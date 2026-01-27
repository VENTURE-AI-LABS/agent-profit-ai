import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATA_PATH = path.join(ROOT, "src", "data", "case-studies.json");

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isIsoDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isUrl(v) {
  try {
    const u = new URL(v);
    void u;
    return true;
  } catch {
    return false;
  }
}

function containsDollarAmount(s) {
  return typeof s === "string" && /\$\d/.test(s);
}

function containsFundingLanguage(s) {
  if (typeof s !== "string") return false;
  return /\b(seed|series\s+[a-z]|funding|raise[sd]?|valuation|round)\b/i.test(s);
}

const raw = fs.readFileSync(DATA_PATH, "utf8");
let data;
try {
  data = JSON.parse(raw);
} catch {
  fail(`Invalid JSON: ${DATA_PATH}`);
  process.exit(1);
}

if (!Array.isArray(data)) {
  fail("Root must be an array of case studies.");
  process.exit(1);
}

const ids = new Set();
for (let i = 0; i < data.length; i++) {
  const cs = data[i];
  const at = `caseStudies[${i}]`;
  if (!cs || typeof cs !== "object") {
    fail(`${at} must be an object.`);
    continue;
  }

  if (!isNonEmptyString(cs.id)) fail(`${at}.id is required.`);
  else if (ids.has(cs.id)) fail(`${at}.id is duplicated: ${cs.id}`);
  else ids.add(cs.id);

  if (!isIsoDate(cs.date)) fail(`${at}.date must be YYYY-MM-DD.`);
  if (!isNonEmptyString(cs.title)) fail(`${at}.title is required.`);
  if (!isNonEmptyString(cs.summary)) fail(`${at}.summary is required.`);
  if (!isNonEmptyString(cs.description)) fail(`${at}.description is required.`);

  // Strict rules: titles must include a $ amount and must not use funding rounds as "making money".
  if (isNonEmptyString(cs.title) && !containsDollarAmount(cs.title)) {
    fail(`${at}.title must include a $ amount.`);
  }
  if (containsFundingLanguage(cs.title) || containsFundingLanguage(cs.summary)) {
    fail(
      `${at} appears to be fundraising-based (seed/series/raise). Funding rounds are not allowed as "making money".`,
    );
  }

  if (!Array.isArray(cs.profitMechanisms))
    fail(`${at}.profitMechanisms must be an array.`);
  if (!Array.isArray(cs.tags)) fail(`${at}.tags must be an array.`);

  if (!Array.isArray(cs.proofSources)) {
    fail(`${at}.proofSources must be an array.`);
  } else {
    if (cs.proofSources.length < 2) {
      fail(`${at}.proofSources must include at least 2 sources.`);
    }

    let hasMoneyExcerpt = false;
    for (let j = 0; j < cs.proofSources.length; j++) {
      const s = cs.proofSources[j];
      const sat = `${at}.proofSources[${j}]`;
      if (!s || typeof s !== "object") {
        fail(`${sat} must be an object.`);
        continue;
      }
      if (!isNonEmptyString(s.label)) fail(`${sat}.label is required.`);
      if (!isNonEmptyString(s.url) || !isUrl(s.url))
        fail(`${sat}.url must be a valid URL.`);

      if (containsDollarAmount(s.excerpt)) hasMoneyExcerpt = true;
    }

    if (!hasMoneyExcerpt) {
      fail(
        `${at} must include at least one proofSources[].excerpt containing the $ amount.`,
      );
    }
  }
}

if (!process.exitCode) {
  console.log(`OK: ${data.length} case studies validated.`);
}

