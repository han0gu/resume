const fs = require("fs");
const path = require("path");

const packageJsonPath = path.join(process.cwd(), "package.json");
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
  const runSiteModule = require(runSiteScriptPath);

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

  console.log("[check-run-site] Runtime guard checks passed.");
}

main();
