import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";

function createMetricTracker() {
  return { sum: 0, count: 0 };
}

function appendMetric(tracker, rawValue) {
  const value = Number.parseFloat(rawValue);
  if (!Number.isFinite(value)) {
    return;
  }

  tracker.sum += value;
  tracker.count += 1;
}

function averageMetric(tracker) {
  if (!tracker.count) {
    return null;
  }

  return Number((tracker.sum / tracker.count).toFixed(1));
}

function appendUniqueSnippet(list, rawValue) {
  const value = (rawValue || "").replace(/\s+/g, " ").trim();
  if (!value || list.includes(value)) {
    return;
  }

  list.push(value);
}

function normalizeCompanyKey(value) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toCompanyRecord(aggregate) {
  return {
    id: aggregate.id,
    name: aggregate.name,
    reviewCount: aggregate.rating.count,
    totalRating: averageMetric(aggregate.rating),
    careerOpportunities: averageMetric(aggregate.careerOpportunities),
    compensationAndBenefits: averageMetric(aggregate.compensationAndBenefits),
    workLifeBalance: averageMetric(aggregate.workLifeBalance),
    allPros: aggregate.topPros.slice(0, 8),
    allCons: aggregate.lowCons.slice(0, 8)
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const appDir = path.resolve(scriptDir, "..");
  const projectRoot = path.resolve(appDir, "..", "..");
  const csvPath = path.resolve(projectRoot, "src", "shared", "glassdoor_cleaned.csv");
  const outputDir = path.resolve(appDir, "data");
  const outputPath = path.resolve(outputDir, "company-rankings.json");

  const csvText = await readFile(csvPath, "utf8");
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true
  });

  const companyIndex = new Map();

  for (const row of rows) {
    const companyName = row.firm_name?.trim();
    if (!companyName) {
      continue;
    }

    const companyKey = normalizeCompanyKey(companyName);
    if (!companyIndex.has(companyKey)) {
      companyIndex.set(companyKey, {
        id: companyKey,
        name: companyName,
        rating: createMetricTracker(),
        careerOpportunities: createMetricTracker(),
        compensationAndBenefits: createMetricTracker(),
        workLifeBalance: createMetricTracker(),
        topPros: [],
        lowCons: []
      });
    }

    const aggregate = companyIndex.get(companyKey);
    appendMetric(aggregate.rating, row.rating);
    appendMetric(aggregate.careerOpportunities, row["Career Opportunities"]);
    appendMetric(aggregate.compensationAndBenefits, row["Compensation and Benefits"]);
    appendMetric(aggregate.workLifeBalance, row["Work/Life Balance"]);
    appendUniqueSnippet(aggregate.topPros, row.pros);
    appendUniqueSnippet(aggregate.lowCons, row.cons);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    companies: [...companyIndex.values()].map(toCompanyRecord)
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload), "utf8");

  console.log(`Wrote ${payload.companies.length} companies to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
