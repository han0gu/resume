const fs = require("fs");
const path = require("path");

const packageJsonPath = path.join(process.cwd(), "package.json");
const nvmrcPath = path.join(process.cwd(), ".nvmrc");
const runSiteScriptPath = path.join(process.cwd(), "scripts", "run-site.js");

function fail(message, error) {
  console.error(`[check-run-site] ${message}`);

  if (error) {
    console.error(error.stack || error.message || String(error));
  }

  process.exit(1);
}

function expect(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function expectMatch(value, pattern, message) {
  if (!pattern.test(value || "")) {
    fail(message);
  }
}

function main() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const scripts = packageJson.scripts || {};
  const nvmrc = fs.readFileSync(nvmrcPath, "utf8").trim();
  const runSiteModule = require(runSiteScriptPath);

  expect(fs.existsSync(nvmrcPath), "Missing .nvmrc.");
  expect(nvmrc === "20", "Expected .nvmrc to pin Node 20.");
  expect(
    packageJson.engines && packageJson.engines.node === "20.x",
    "Expected package.json engines.node to pin Node 20.x."
  );

  expectMatch(
    scripts.start,
    /node\s+scripts\/run-site\.js\b[\s\S]*--mode=serve\b/,
    "Missing or unexpected start script."
  );
  expectMatch(
    scripts.build,
    /node\s+scripts\/run-site\.js\b[\s\S]*--mode=build\b/,
    "Missing or unexpected build script."
  );
  expect(fs.existsSync(runSiteScriptPath), "Missing scripts/run-site.js.");

  const defaultOptions = runSiteModule.getRuntimeOptions([]);
  const equalsModeOptions = runSiteModule.getRuntimeOptions(["--mode=serve"]);
  const splitModeOptions = runSiteModule.getRuntimeOptions(["--mode", "serve"]);
  const passthroughOptions = runSiteModule.getRuntimeOptions([
    "--mode=build",
    "--no-source-maps",
    "--detailed-report",
  ]);

  expect(defaultOptions.mode === "build", "Expected default mode to be build.");
  expect(
    equalsModeOptions.mode === "serve",
    "Expected --mode=serve to resolve serve mode."
  );
  expect(
    splitModeOptions.mode === "serve",
    "Expected --mode serve to resolve serve mode."
  );
  expect(
    passthroughOptions.mode === "build" &&
      passthroughOptions.parcelArgs.length === 2 &&
      passthroughOptions.parcelArgs[0] === "--no-source-maps" &&
      passthroughOptions.parcelArgs[1] === "--detailed-report",
    "Expected non-runtime CLI args to pass through to Parcel."
  );

  const buildArgs = runSiteModule.getParcelArgs("build");
  const serveArgs = runSiteModule.getParcelArgs("serve");

  expect(
    Array.isArray(buildArgs) &&
      buildArgs[0] === "build" &&
      buildArgs.includes("--public-url") &&
      buildArgs.includes("/resume"),
    "Expected build args to target Parcel production build with /resume public URL."
  );
  expect(
    Array.isArray(serveArgs) &&
      serveArgs.length === 1 &&
      serveArgs[0] === "src/index.html",
    "Expected serve args to target src/index.html."
  );

  expect(
    runSiteModule.isDeasyncBindingError(
      new Error("deasync: Could not locate the bindings file")
    ),
    "Expected deasync binding matcher to recognize binding load failures."
  );
  expect(
    !runSiteModule.isDeasyncBindingError(new Error("Some other runtime error")),
    "Expected unrelated runtime errors to be ignored by deasync binding matcher."
  );

  const recoveryMessage = runSiteModule.getBindingRecoveryMessage("v22.22.2");

  expect(
    recoveryMessage.includes("v22.22.2") &&
      recoveryMessage.includes("yarn install") &&
      recoveryMessage.includes("npm rebuild deasync"),
    "Expected binding recovery message to include Node version and recovery commands."
  );
  expect(
    runSiteModule.getMissingDependenciesMessage().includes("yarn install"),
    "Expected dependency recovery message to include yarn install."
  );

  expect(
    runSiteModule.getSupportedNodeMajor() === 20,
    "Expected supported Node major version to be 20."
  );
  expect(
    runSiteModule.isSupportedNodeVersion("v20.20.2"),
    "Expected Node 20.x to be treated as supported."
  );
  expect(
    !runSiteModule.isSupportedNodeVersion("v24.14.1"),
    "Expected Node 24.x to be treated as unsupported."
  );

  const unsupportedVersionMessage =
    runSiteModule.getUnsupportedNodeVersionMessage("v24.14.1");

  expect(
    unsupportedVersionMessage.includes("Node.js 20.x") &&
      unsupportedVersionMessage.includes("v24.14.1") &&
      unsupportedVersionMessage.includes("nvm use") &&
      unsupportedVersionMessage.includes("corepack enable"),
    "Expected unsupported Node version message to include the current version and recovery commands."
  );

  console.log("[check-run-site] Runtime guard checks passed.");
}

main();
