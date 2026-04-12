const fs = require("fs");
const http = require("http");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");

const packageJsonPath = path.join(process.cwd(), "package.json");
const exportScriptPath = path.join(process.cwd(), "scripts", "export-pdf.js");
const exportScriptDir = path.dirname(exportScriptPath);

function fail(message, error) {
  console.error(`[check-export-pdf] ${message}`);

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

function loadExportModule(options = {}) {
  const source = fs.readFileSync(exportScriptPath, "utf8");
  const instrumentedSource = source.replace(
    /\nmain\(\)\.catch\(\(error\) => \{\n[\s\S]*?\n\}\);\s*$/,
    "\nmodule.exports = { getChromePath, resolveRequestPath, startStaticServer, buildOutputMap };\n"
  );

  if (instrumentedSource === source) {
    fail("Unable to instrument scripts/export-pdf.js for verification.");
  }

  const module = { exports: {} };
  const sandboxProcess = {
    ...process,
    argv: options.argv || ["node", exportScriptPath],
    env: options.env || {},
    platform: options.platform || process.platform,
    pid: process.pid,
  };

  const sandboxRequire = (moduleName) => {
    if (moduleName === "fs") {
      return options.fsModule || require("fs");
    }

    if (moduleName === "http") {
      return require("http");
    }

    if (moduleName === "path") {
      return require("path");
    }

    if (moduleName === "playwright-core") {
      return { chromium: {} };
    }

    return require(moduleName);
  };

  const context = {
    module,
    exports: module.exports,
    require: sandboxRequire,
    __dirname: exportScriptDir,
    __filename: exportScriptPath,
    process: sandboxProcess,
    console,
    Buffer,
    URL,
    setTimeout,
    clearTimeout,
    setImmediate,
    clearImmediate,
  };

  vm.runInNewContext(instrumentedSource, context, { filename: exportScriptPath });
  return module.exports;
}

function createReadErrorFs() {
  return {
    existsSync() {
      return true;
    },
    createReadStream() {
      const stream = new EventEmitter();

      setImmediate(() => {
        if (stream.listenerCount("error") > 0) {
          stream.emit("error", new Error("forced read failure"));
        }
      });

      stream.pipe = (response) => {
        return response;
      };

      return stream;
    },
  };
}

async function assertReadStreamErrorsCloseResponse() {
  const exportModule = loadExportModule({
    fsModule: createReadErrorFs(),
  });
  const { server, url } = await exportModule.startStaticServer();

  try {
    const result = await new Promise((resolve, reject) => {
      const request = http.get(`${url}index.html`, (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            body,
          });
        });
      });

      request.on("error", reject);
      request.setTimeout(300, () => {
        request.destroy(new Error("Timed out waiting for static server response."));
      });
    });

    expect(
      result.statusCode === 500,
      "Expected stream read failures to return a 500 response."
    );
    expect(
      result.body.includes("Failed to read file"),
      "Expected stream read failures to end the response with an error message."
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

async function main() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const scripts = packageJson.scripts || {};
  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  expectMatch(
    scripts["export:pdf"],
    /node\s+scripts\/export-pdf\.js\b[\s\S]*--mode=print\b/,
    "Missing or unexpected export:pdf script."
  );
  expectMatch(
    scripts["export:pdf:compare"],
    /node\s+scripts\/export-pdf\.js\b[\s\S]*--mode=both\b/,
    "Missing or unexpected export:pdf:compare script."
  );
  expect(Boolean(dependencies["playwright-core"]), "Missing playwright-core dependency.");
  expect(fs.existsSync(exportScriptPath), "Missing scripts/export-pdf.js.");

  const linuxModule = loadExportModule({
    platform: "linux",
    env: {
      PATH: "/mock/bin",
    },
    fsModule: {
      existsSync(filePath) {
        return filePath === "/mock/bin/google-chrome";
      },
      createReadStream: fs.createReadStream.bind(fs),
    },
  });
  const defaultChromePath = linuxModule.getChromePath();

  expect(
    defaultChromePath === "/mock/bin/google-chrome",
    `Expected linux defaults to resolve Chrome from PATH, got: ${defaultChromePath}`
  );

  const traversalModule = loadExportModule();

  expect(
    traversalModule.resolveRequestPath("/resume/..%2Fdist-backup/secret.txt") === null,
    "Expected dist boundary check to reject prefix-based traversal paths."
  );

  const validIndex = traversalModule.resolveRequestPath("/resume/");

  expect(
    Boolean(validIndex && validIndex.filePath && validIndex.filePath.endsWith(path.join("dist", "index.html"))),
    "Expected /resume/ to resolve to dist/index.html."
  );

  await assertReadStreamErrorsCloseResponse();

  console.log("[check-export-pdf] Export script guards passed.");
}

main().catch((error) => {
  fail("Export verification failed.", error);
});
