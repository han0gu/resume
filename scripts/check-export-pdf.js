const fs = require("fs");
const path = require("path");

const packageJsonPath = path.join(process.cwd(), "package.json");
const exportScriptPath = path.join(process.cwd(), "scripts", "export-pdf.js");

function fail(message) {
  console.error(`[check-export-pdf] ${message}`);
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const scripts = packageJson.scripts || {};
const devDependencies = packageJson.devDependencies || {};

if (scripts["export:pdf"] !== "yarn build && node scripts/export-pdf.js --mode=print") {
  fail("Missing or unexpected export:pdf script.");
}

if (scripts["export:pdf:compare"] !== "yarn build && node scripts/export-pdf.js --mode=both") {
  fail("Missing or unexpected export:pdf:compare script.");
}

if (devDependencies["playwright-core"] !== "^1.59.1") {
  fail("Missing playwright-core devDependency.");
}

if (!fs.existsSync(exportScriptPath)) {
  fail("Missing scripts/export-pdf.js.");
}

const exportScript = fs.readFileSync(exportScriptPath, "utf8");

[
  "const { chromium } = require(\"playwright-core\");",
  "const mode = getMode();",
  "process.pid",
  "preferCSSPageSize: Boolean(options.preferCSSPageSize)",
  "resume-a4-print-optimized.pdf",
  "resume-a4-legacy-screen.pdf",
].forEach((snippet) => {
  if (!exportScript.includes(snippet)) {
    fail(`Export script is missing expected snippet: ${snippet}`);
  }
});

console.log("[check-export-pdf] Export script guards passed.");
