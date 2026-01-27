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

  if (!Array.isArray(cs.profitMechanisms))
    fail(`${at}.profitMechanisms must be an array.`);
  if (!Array.isArray(cs.tags)) fail(`${at}.tags must be an array.`);

  if (!Array.isArray(cs.proofSources)) {
    fail(`${at}.proofSources must be an array.`);
  } else {
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
    }
  }
}

if (!process.exitCode) {
  console.log(`OK: ${data.length} case studies validated.`);
}

