const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

function fail(message, error) {
  console.error(`[run-site] ${message}`);

  if (error) {
    console.error(error.stack || error.message || String(error));
  }

  process.exit(1);
}

function getArgValue(name, argv = process.argv.slice(2)) {
  const prefix = `--${name}=`;
  const entry = argv.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : "";
}

function getMode(argv = process.argv.slice(2)) {
  const mode = getArgValue("mode", argv) || "build";

  if (mode !== "build" && mode !== "serve") {
    fail(`Unsupported --mode value: ${mode}`);
  }

  return mode;
}

function isDeasyncBindingError(error) {
  const message = String(error && (error.stack || error.message || error));

  return (
    message.includes("deasync") && message.includes("Could not locate the bindings file")
  );
}

function getBindingRecoveryMessage(nodeVersion = process.version) {
  return [
    `Current Node.js runtime (${nodeVersion}) cannot load deasync native bindings.`,
    "This usually means node_modules was installed under a different Node major version.",
    "Reinstall or rebuild native modules with the same Node version you plan to use for this repository.",
    "Recommended recovery commands:",
    "  yarn install",
    "  npm rebuild deasync",
  ].join("\n");
}

function getMissingDependenciesMessage() {
  return [
    "Required build dependencies are missing.",
    "Install dependencies before running this command:",
    "  yarn install",
  ].join("\n");
}

function ensureCompatibleRuntime(requireFn = require) {
  try {
    requireFn("deasync");
  } catch (error) {
    if (isDeasyncBindingError(error)) {
      fail(getBindingRecoveryMessage());
    }

    if (error && error.code === "MODULE_NOT_FOUND") {
      fail(getMissingDependenciesMessage());
    }

    fail("Failed to initialize Parcel runtime.", error);
  }
}

function getParcelArgs(mode) {
  if (mode === "serve") {
    return ["src/index.html"];
  }

  return [
    "build",
    "--no-cache",
    "-d",
    "dist",
    "--public-url",
    "/resume",
    "src/index.html",
  ];
}

function getParcelCliPath() {
  try {
    return require.resolve("parcel-bundler/bin/cli.js");
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND") {
      fail(getMissingDependenciesMessage());
    }

    fail("Failed to locate Parcel CLI.", error);
  }
}

function runParcel(mode) {
  const parcelCliPath = getParcelCliPath();
  const result = spawnSync(process.execPath, [parcelCliPath, ...getParcelArgs(mode)], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.error) {
    fail("Failed to start Parcel.", result.error);
  }

  process.exit(result.status === null ? 1 : result.status);
}

function main(argv = process.argv.slice(2)) {
  const mode = getMode(argv);

  ensureCompatibleRuntime();

  if (mode === "build") {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  runParcel(mode);
}

if (require.main === module) {
  main();
}

module.exports = {
  getMode,
  getParcelArgs,
  isDeasyncBindingError,
  getBindingRecoveryMessage,
  getMissingDependenciesMessage,
};
