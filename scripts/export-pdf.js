const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright-core");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

const PRESET_DEFINITIONS = {
  "a4-print": {
    fileName: "resume-a4-print.pdf",
    media: "print",
    viewport: { width: 1440, height: 1200 },
    pdf: {
      format: "A4",
      preferCSSPageSize: true,
      scale: 1,
    },
  },
  "desktop-long-canvas": {
    fileName: "resume-desktop-long-canvas.pdf",
    media: "screen",
    viewport: { width: 1440, height: 1200 },
    longCanvas: true,
  },
  "mobile-long-canvas": {
    fileName: "resume-mobile-long-canvas.pdf",
    media: "screen",
    viewport: { width: 390, height: 844 },
    longCanvas: true,
  },
};

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

function getRequestedPreset(argv = process.argv.slice(2)) {
  const preset = getArgValue("preset", argv);

  if (!preset) {
    fail("Missing required --preset argument.");
  }

  return preset;
}

function getPresetNames(argv = process.argv.slice(2)) {
  const preset = getRequestedPreset(argv);

  if (preset === "all") {
    return Object.keys(PRESET_DEFINITIONS);
  }

  if (!PRESET_DEFINITIONS[preset]) {
    fail(`Unsupported preset: ${preset}`);
  }

  return [preset];
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
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
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

async function measureDocumentHeight(page) {
  return page.evaluate(() => {
    const body = document.body;
    const doc = document.documentElement;

    return (
      Math.ceil(
        Math.max(
          body.scrollHeight,
          body.offsetHeight,
          doc.clientHeight,
          doc.scrollHeight,
          doc.offsetHeight
        )
      ) + 1
    );
  });
}

function buildPdfOptions(preset, outputPath, documentHeight) {
  if (preset.longCanvas) {
    return {
      path: outputPath,
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
      scale: 1,
    };
  }

  return {
    path: outputPath,
    printBackground: true,
    displayHeaderFooter: false,
    format: preset.pdf.format || "A4",
    preferCSSPageSize: Boolean(preset.pdf.preferCSSPageSize),
    scale: preset.pdf.scale || 1,
  };
}

function buildLongCanvasPageStyle(preset, documentHeight) {
  return [
    "@page {",
    `  size: ${preset.viewport.width}px ${documentHeight}px;`,
    "  margin: 0;",
    "}",
    "html, body {",
    "  margin: 0;",
    "}",
  ].join("\n");
}

async function renderPreset(browser, baseUrl, outputPath, preset) {
  const page = await browser.newPage({
    viewport: preset.viewport,
    deviceScaleFactor: 1,
  });

  try {
    await page.emulateMedia({ media: preset.media });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts && document.fonts.ready);

    const documentHeight = preset.longCanvas ? await measureDocumentHeight(page) : 0;

    if (preset.longCanvas) {
      await page.addStyleTag({
        content: buildLongCanvasPageStyle(preset, documentHeight),
      });
    }

    const pdfOptions = buildPdfOptions(preset, outputPath, documentHeight);

    await page.pdf(pdfOptions);
  } finally {
    await page.close();
  }
}

function buildOutputMap(outputDir, presetNames) {
  return presetNames.reduce((outputs, presetName) => {
    outputs[presetName] = path.join(outputDir, PRESET_DEFINITIONS[presetName].fileName);
    return outputs;
  }, {});
}

async function main() {
  const presetNames = getPresetNames();
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
    const outputs = buildOutputMap(outputDir, presetNames);

    for (const presetName of presetNames) {
      await renderPreset(browser, url, outputs[presetName], PRESET_DEFINITIONS[presetName]);
    }

    console.log(
      JSON.stringify(
        {
          outputDir,
          baseUrl: url,
          presetNames,
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
