import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { unstable_cache } from "next/cache";
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

async function resolveCsvPath() {
  const candidates = [
    path.resolve(process.cwd(), "..", "..", "src", "shared", "glassdoor_cleaned.csv"),
    path.resolve(process.cwd(), "src", "shared", "glassdoor_cleaned.csv")
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("Could not locate glassdoor_cleaned.csv.");
}

async function buildCompanyIndex() {
  const csvPath = await resolveCsvPath();
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

  return companyIndex;
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

function topByMetric(companies, field) {
  return [...companies]
    .filter((company) => Number.isFinite(company[field]))
    .sort((left, right) => right[field] - left[field] || left.name.localeCompare(right.name))
    .slice(0, 5);
}

const getCachedCompanyRankings = unstable_cache(
  async () => {
    const companyIndex = await buildCompanyIndex();
    return {
      companies: [...companyIndex.values()].map(toCompanyRecord)
    };
  },
  ["workwise-company-rankings"],
  {
    revalidate: 3600
  }
);

export async function getCompanyRankings() {
  return getCachedCompanyRankings();
}
