const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright-core");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

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

function getArgValue(name, argv = process.argv.slice(2)) {
  const prefix = `--${name}=`;
  const entry = argv.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : "";
}

function getMode(argv = process.argv.slice(2)) {
  const mode = getArgValue("mode", argv) || "print";

  if (!["print", "legacy", "both"].includes(mode)) {
    fail(`Unsupported mode: ${mode}`);
  }

  return mode;
}

function getOutputDir(argv = process.argv.slice(2)) {
  const customOutputDir = getArgValue("output-dir", argv);

  if (customOutputDir) {
    return path.resolve(projectRoot, customOutputDir);
  }

  return path.join(projectRoot, "tmp", "exports", createRunId());
}

function isExplicitPath(target) {
  return path.isAbsolute(target) || /[\\/]/.test(target);
}

function normalizeExecutableTarget(target) {
  return isExplicitPath(target) ? path.resolve(target) : target;
}

function getDefaultChromeCandidates(platform = process.platform) {
  if (platform === "darwin") {
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  }

  if (platform === "win32") {
    return [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];
  }

  return [
    "google-chrome",
    "google-chrome-stable",
    "chromium-browser",
    "chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/snap/bin/chromium",
  ];
}

function findExecutableInPath(
  executableName,
  env = process.env,
  platform = process.platform,
  fsModule = fs
) {
  const pathValue = env.PATH || "";
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  const extensions =
    platform === "win32"
      ? ["", ...String(env.PATHEXT || ".EXE;.CMD;.BAT").split(";").filter(Boolean)]
      : [""];

  for (const directory of directories) {
    for (const extension of extensions) {
      const candidatePath = path.join(directory, `${executableName}${extension}`);

      if (fsModule.existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return "";
}

function resolveExecutableTarget(
  target,
  env = process.env,
  platform = process.platform,
  fsModule = fs
) {
  const normalizedTarget = normalizeExecutableTarget(target);

  if (isExplicitPath(target)) {
    return fsModule.existsSync(normalizedTarget) ? normalizedTarget : "";
  }

  return findExecutableInPath(target, env, platform, fsModule);
}

function getChromePath(options = {}) {
  const argv = options.argv || process.argv.slice(2);
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const fsModule = options.fsModule || fs;
  const requestedTarget = getArgValue("chrome-path", argv) || env.CHROME_PATH;

  if (requestedTarget) {
    return (
      resolveExecutableTarget(requestedTarget, env, platform, fsModule) ||
      normalizeExecutableTarget(requestedTarget)
    );
  }

  const candidates = getDefaultChromeCandidates(platform);

  for (const candidate of candidates) {
    const resolvedTarget = resolveExecutableTarget(candidate, env, platform, fsModule);

    if (resolvedTarget) {
      return resolvedTarget;
    }
  }

  return normalizeExecutableTarget(candidates[0]);
}

function assertExecutableExists(
  executablePath,
  label,
  env = process.env,
  platform = process.platform,
  fsModule = fs
) {
  const resolvedTarget =
    resolveExecutableTarget(executablePath, env, platform, fsModule) ||
    (isExplicitPath(executablePath) && fsModule.existsSync(executablePath)
      ? executablePath
      : "");

  if (!resolvedTarget) {
    fail(`${label} not found: ${executablePath}`);
  }

  return resolvedTarget;
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

function isPathInsideDirectory(directoryPath, targetPath) {
  const relativePath = path.relative(directoryPath, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
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

  let relativePath = "";

  try {
    relativePath = decodeURIComponent(urlPath.replace(/^\/resume\//, "")).replace(
      /^\/+/,
      ""
    );
  } catch {
    return null;
  }

  const filePath = path.resolve(distDir, relativePath);

  if (!isPathInsideDirectory(distDir, filePath)) {
    return null;
  }

  return { filePath };
}

function sendTextResponse(response, statusCode, body) {
  if (!response.headersSent) {
    response.writeHead(statusCode, {
      "Content-Type": "text/plain; charset=utf-8",
    });
  }

  response.end(body);
}

function pipeFileToResponse(filePath, response) {
  const stream = fs.createReadStream(filePath);

  stream.on("error", () => {
    sendTextResponse(response, 500, "Failed to read file");
  });

  stream.on("open", () => {
    response.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
    });
    stream.pipe(response);
  });
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const urlPath = new URL(request.url, "http://127.0.0.1").pathname;
      const resolution = resolveRequestPath(urlPath);

      if (!resolution) {
        sendTextResponse(response, 404, "Not Found");
        return;
      }

      if (resolution.redirect) {
        response.writeHead(302, { Location: resolution.redirect });
        response.end();
        return;
      }

      if (!fs.existsSync(resolution.filePath)) {
        sendTextResponse(response, 404, "Not Found");
        return;
      }

      pipeFileToResponse(resolution.filePath, response);
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
  const chromePath = assertExecutableExists(getChromePath(), "Chrome executable");

  assertFileExists(distDir, "dist directory");
  assertFileExists(path.join(distDir, "index.html"), "built index.html");

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
