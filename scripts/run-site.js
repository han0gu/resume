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

function extractArgValue(name, argv = process.argv.slice(2)) {
  const flag = `--${name}`;
  const prefix = `${flag}=`;
  const remainingArgs = [];
  let value = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!value && arg.startsWith(prefix)) {
      value = arg.slice(prefix.length);

      if (!value) {
        fail(`Missing value for ${flag}.`);
      }

      continue;
    }

    if (!value && arg === flag) {
      const nextArg = argv[index + 1];

      if (!nextArg || nextArg.startsWith("--")) {
        fail(`Missing value for ${flag}.`);
      }

      value = nextArg;
      index += 1;
      continue;
    }

    remainingArgs.push(arg);
  }

  return { value, remainingArgs };
}

function getRuntimeOptions(argv = process.argv.slice(2)) {
  const { value, remainingArgs } = extractArgValue("mode", argv);
  const mode = value || "build";

  if (mode !== "build" && mode !== "serve") {
    fail(`Unsupported --mode value: ${mode}`);
  }

  return {
    mode,
    parcelArgs: remainingArgs,
  };
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

function runParcel(mode, extraArgs = []) {
  const parcelCliPath = getParcelCliPath();
  const result = spawnSync(
    process.execPath,
    [parcelCliPath, ...getParcelArgs(mode), ...extraArgs],
    {
      cwd: projectRoot,
      stdio: "inherit",
    }
  );

  if (result.error) {
    fail("Failed to start Parcel.", result.error);
  }

  process.exit(result.status === null ? 1 : result.status);
}

function main(argv = process.argv.slice(2)) {
  const options = getRuntimeOptions(argv);

  ensureCompatibleRuntime();

  if (options.mode === "build") {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  runParcel(options.mode, options.parcelArgs);
}

if (require.main === module) {
  main();
}

module.exports = {
  extractArgValue,
  getRuntimeOptions,
  getParcelArgs,
  isDeasyncBindingError,
  getBindingRecoveryMessage,
  getMissingDependenciesMessage,
};
