const fs = require("fs");
const path = require("path");

const distDir = path.resolve(process.cwd(), process.argv[2] || "dist");
const measurementId = process.env.GA_MEASUREMENT_ID || "";

function fail(message) {
  console.error(`[check-dist] ${message}`);
  process.exit(1);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractAssetRefs(html) {
  return Array.from(html.matchAll(/\b(?:src|href|content)=["']([^"']+)["']/g))
    .map((match) => match[1])
    .filter((ref) => {
      if (!ref || ref === "/" || ref.startsWith("#")) {
        return false;
      }

      if (
        ref.startsWith("http://") ||
        ref.startsWith("https://") ||
        ref.startsWith("mailto:") ||
        ref.startsWith("data:")
      ) {
        return false;
      }

      return ref.startsWith("/") || ref.startsWith("./");
    });
}

function resolveDistAsset(ref) {
  const normalizedRef = ref.split(/[?#]/)[0].replace(/^\.\//, "");
  const trimmedRef = normalizedRef.replace(/^\/+/, "");
  const candidates = [trimmedRef];

  if (trimmedRef.includes("/")) {
    candidates.push(trimmedRef.replace(/^[^/]+\//, ""));
  }

  for (const candidate of candidates) {
    const candidatePath = path.join(distDir, candidate);

    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

if (!fs.existsSync(distDir)) {
  fail(`Missing dist directory: ${distDir}`);
}

const indexPath = path.join(distDir, "index.html");

if (!fs.existsSync(indexPath)) {
  fail(`Missing built HTML: ${indexPath}`);
}

const html = readFile(indexPath);

[
  "이력서 - 한승완",
  "안녕하세요,",
  "GitHub",
  "Email",
  "Google Analytics를 사용합니다.",
].forEach((snippet) => {
  if (!html.includes(snippet)) {
    fail(`Built HTML is missing expected content: ${snippet}`);
  }
});

if (html.includes("/docs/")) {
  fail("Built HTML still references the old /docs deployment path.");
}

const assetRefs = [...new Set(extractAssetRefs(html))];

if (!assetRefs.some((ref) => ref.endsWith(".css"))) {
  fail("Built HTML does not reference a stylesheet.");
}

if (!assetRefs.some((ref) => ref.endsWith(".js"))) {
  fail("Built HTML does not reference a JavaScript bundle.");
}

if (!assetRefs.some((ref) => ref.endsWith(".png"))) {
  fail("Built HTML does not reference the OG image asset.");
}

assetRefs.forEach((ref) => {
  const resolvedPath = resolveDistAsset(ref);

  if (!resolvedPath) {
    fail(`Referenced asset is missing from dist: ${ref}`);
  }
});

const jsFiles = fs
  .readdirSync(distDir)
  .filter((fileName) => fileName.endsWith(".js"))
  .map((fileName) => path.join(distDir, fileName));

if (!jsFiles.length) {
  fail("No JavaScript bundles were generated.");
}

if (measurementId) {
  const hasInjectedMeasurementId = jsFiles.some((filePath) =>
    readFile(filePath).includes(measurementId)
  );

  if (!hasInjectedMeasurementId) {
    fail(
      `Expected measurement ID ${measurementId} was not injected into the built bundle.`
    );
  }
}

console.log(
  `[check-dist] Verified ${path.relative(process.cwd(), indexPath)} and ${assetRefs.length} asset references.`
);
