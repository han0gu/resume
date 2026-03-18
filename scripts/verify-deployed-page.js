const expectedSnippets = [
  "이력서 - 한승완",
  "안녕하세요,",
  "GitHub",
  "Email",
  "Google Analytics를 사용합니다.",
];

const pageUrl = process.argv[2];
const maxAttempts = Number(process.env.VERIFY_ATTEMPTS || "12");
const delayMs = Number(process.env.VERIFY_DELAY_MS || "5000");

function fail(message) {
  console.error(`[verify-deployed-page] ${message}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

async function fetchWithRetry(url, expectedType) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const body =
        expectedType === "text" ? await response.text() : await response.arrayBuffer();

      return body;
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        console.log(
          `[verify-deployed-page] Retry ${attempt}/${maxAttempts} for ${url}: ${error.message}`
        );
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

if (!pageUrl) {
  fail("Missing deployed page URL argument.");
}

(async () => {
  const html = await fetchWithRetry(pageUrl, "text");

  expectedSnippets.forEach((snippet) => {
    if (!html.includes(snippet)) {
      fail(`Deployed HTML is missing expected content: ${snippet}`);
    }
  });

  const assetRefs = [...new Set(extractAssetRefs(html))];

  if (!assetRefs.length) {
    fail("Deployed HTML does not reference any local assets.");
  }

  for (const ref of assetRefs) {
    const assetUrl = new URL(ref, pageUrl).toString();
    await fetchWithRetry(assetUrl, "binary");
  }

  console.log(
    `[verify-deployed-page] Verified ${pageUrl} and ${assetRefs.length} deployed asset URLs.`
  );
})().catch((error) => {
  fail(error.message);
});
