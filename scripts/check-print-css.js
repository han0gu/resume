const fs = require("fs");
const path = require("path");

const mainCssPath = path.join(process.cwd(), "src", "main.css");
const css = fs.readFileSync(mainCssPath, "utf8");

function fail(message) {
  console.error(`[check-print-css] ${message}`);
  process.exit(1);
}

function expectMatch(pattern, message) {
  if (!pattern.test(css)) {
    fail(message);
  }
}

expectMatch(/@page\s*\{[\s\S]*size:\s*A4(?:\s+portrait)?\s*;/, "Missing A4 @page rule.");
expectMatch(/@media print\s*\{[\s\S]*body:before[\s\S]*display:\s*none\s*;/, "Missing print rule to remove the fixed top gradient.");
expectMatch(/@media print\s*\{[\s\S]*\.site-footer\s*\{[\s\S]*display:\s*none\s*;/, "Missing print rule to hide the web-only footer in exported PDF.");
expectMatch(/@media print\s*\{[\s\S]*\.row\s*\{[\s\S]*display:\s*block\s*;/, "Missing print rule to stack company rows vertically.");
expectMatch(/@media print\s*\{[\s\S]*\.project\s*\{[\s\S]*break-inside:\s*auto\s*;/, "Missing print rule to allow project blocks to split naturally.");
expectMatch(/@media print\s*\{[\s\S]*h2,[\s\S]*h3,[\s\S]*h4,[\s\S]*h5,[\s\S]*break-after:\s*avoid-page\s*;/, "Missing print rule to keep headings with following content.");

console.log("[check-print-css] Print stylesheet guards passed.");
