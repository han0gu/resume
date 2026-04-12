const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright-core");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const defaultChromePath =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function fail(message) {
  console.error(`[export-pdf] ${message}`);
  process.exit(1);
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found: ${filePath}`);
  }
}

function createRunId() {
  const now = new Date();
  const pad = (value, width = 2) => String(value).padStart(width, "0");

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    "-",
    pad(now.getMilliseconds(), 3),
    "-",
    process.pid,
  ].join("");
}

function getArgValue(name) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : "";
}

function getMode() {
  const mode = getArgValue("mode") || "print";

  if (!["print", "legacy", "both"].includes(mode)) {
    fail(`Unsupported mode: ${mode}`);
  }

  return mode;
}

function getOutputDir() {
  const customOutputDir = getArgValue("output-dir");

  if (customOutputDir) {
    return path.resolve(projectRoot, customOutputDir);
  }

  return path.join(projectRoot, "tmp", "exports", createRunId());
}

function getChromePath() {
  const chromePath = getArgValue("chrome-path") || defaultChromePath;
  return path.resolve(chromePath);
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".html":
    default:
      return "text/html; charset=utf-8";
  }
}

function resolveRequestPath(urlPath) {
  if (urlPath === "/") {
    return { redirect: "/resume/" };
  }

  if (urlPath === "/resume" || urlPath === "/resume/") {
    return { filePath: path.join(distDir, "index.html") };
  }

  if (!urlPath.startsWith("/resume/")) {
    return null;
  }

  const relativePath = decodeURIComponent(
    urlPath.replace(/^\/resume\//, "")
  ).replace(/^\/+/, "");
  const filePath = path.resolve(distDir, relativePath);

  if (!filePath.startsWith(distDir)) {
    return null;
  }

  return { filePath };
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const urlPath = new URL(request.url, "http://127.0.0.1").pathname;
      const resolution = resolveRequestPath(urlPath);

      if (!resolution) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not Found");
        return;
      }

      if (resolution.redirect) {
        response.writeHead(302, { Location: resolution.redirect });
        response.end();
        return;
      }

      if (!fs.existsSync(resolution.filePath)) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not Found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": contentTypeFor(resolution.filePath),
      });
      fs.createReadStream(resolution.filePath).pipe(response);
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/resume/`,
      });
    });
  });
}

async function renderVariant(browser, baseUrl, outputPath, options = {}) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
  });

  const media = options.media || "print";
  await page.emulateMedia({ media });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  await page.pdf({
    path: outputPath,
    printBackground: true,
    displayHeaderFooter: false,
    format: options.format || "A4",
    preferCSSPageSize: Boolean(options.preferCSSPageSize),
    scale: options.scale || 1,
  });

  await page.close();
}

function buildOutputMap(outputDir, mode) {
  const outputs = {};

  if (mode === "legacy" || mode === "both") {
    outputs.legacy = path.join(outputDir, "resume-a4-legacy-screen.pdf");
  }

  if (mode === "print" || mode === "both") {
    outputs.print = path.join(outputDir, "resume-a4-print-optimized.pdf");
  }

  return outputs;
}

async function main() {
  const mode = getMode();
  const outputDir = getOutputDir();
  const chromePath = getChromePath();

  assertFileExists(distDir, "dist directory");
  assertFileExists(path.join(distDir, "index.html"), "built index.html");
  assertFileExists(chromePath, "Chrome executable");

  fs.mkdirSync(outputDir, { recursive: true });

  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  try {
    const outputs = buildOutputMap(outputDir, mode);

    if (outputs.legacy) {
      await renderVariant(browser, url, outputs.legacy, {
        media: "screen",
        format: "A4",
      });
    }

    if (outputs.print) {
      await renderVariant(browser, url, outputs.print, {
        media: "print",
        preferCSSPageSize: true,
      });
    }

    console.log(
      JSON.stringify(
        {
          outputDir,
          baseUrl: url,
          mode,
          outputs,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
