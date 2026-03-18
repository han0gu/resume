const assert = require("assert");

const {
  ATTRIBUTION_MAX_LENGTH,
  getAttributionParams,
  mergeEventParams,
  normalizeAttributionValue,
} = require("../src/analytics.js");

assert.strictEqual(normalizeAttributionValue(), "");
assert.strictEqual(normalizeAttributionValue(""), "");
assert.strictEqual(normalizeAttributionValue(" NAVER "), "naver");
assert.strictEqual(normalizeAttributionValue("resume_outreach_2026q1"), "resume_outreach_2026q1");
assert.strictEqual(normalizeAttributionValue("naver.com"), "");
assert.strictEqual(normalizeAttributionValue("john@example.com"), "");
assert.strictEqual(normalizeAttributionValue("resume outreach"), "");
assert.strictEqual(normalizeAttributionValue("01012345678"), "");
assert.strictEqual(normalizeAttributionValue("a".repeat(ATTRIBUTION_MAX_LENGTH + 1)), "");

assert.deepStrictEqual(getAttributionParams(""), {});
assert.deepStrictEqual(
  getAttributionParams(
    "?utm_source=NAVER&utm_medium=email&utm_campaign=resume_outreach_2026q1&utm_content=backend_role_a"
  ),
  {
    resume_company: "naver",
    resume_channel: "email",
    resume_campaign: "resume_outreach_2026q1",
    resume_content: "backend_role_a",
  }
);
assert.deepStrictEqual(
  getAttributionParams(
    "?utm_source=naver.com&utm_medium=010-1234-5678&utm_campaign=resume outreach&utm_content=backend_role_a"
  ),
  {
    resume_content: "backend_role_a",
  }
);
assert.deepStrictEqual(
  mergeEventParams(
    {
      section_id: "intro",
    },
    {
      resume_company: "naver",
      resume_channel: "email",
    }
  ),
  {
    section_id: "intro",
    resume_company: "naver",
    resume_channel: "email",
  }
);

console.log("[check-analytics] Analytics attribution helpers passed.");
