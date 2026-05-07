import { access, readFile } from "node:fs/promises";
import path from "node:path";

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

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
  const lines = csvText.split(/\r?\n/).filter(Boolean);

  if (lines.length <= 1) {
    return new Map();
  }

  const headers = parseCsvLine(lines[0]);
  const companyColumn = headers.indexOf("firm_name");
  const ratingColumn = headers.indexOf("rating");
  const prosColumn = headers.indexOf("pros");
  const consColumn = headers.indexOf("cons");
  const careerColumn = headers.indexOf("Career Opportunities");
  const compensationColumn = headers.indexOf("Compensation and Benefits");
  const wlbColumn = headers.indexOf("Work/Life Balance");

  const companyIndex = new Map();

  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const companyName = row[companyColumn]?.trim();
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
    appendMetric(aggregate.rating, row[ratingColumn]);
    appendMetric(aggregate.careerOpportunities, row[careerColumn]);
    appendMetric(aggregate.compensationAndBenefits, row[compensationColumn]);
    appendMetric(aggregate.workLifeBalance, row[wlbColumn]);
    appendUniqueSnippet(aggregate.topPros, row[prosColumn]);
    appendUniqueSnippet(aggregate.lowCons, row[consColumn]);
  }

  return companyIndex;
}

function toCompanyRecord(aggregate) {
  return {
    id: aggregate.id,
    name: aggregate.name,
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

export async function getCompanyRankings() {
  const companyIndex = await buildCompanyIndex();
  const companies = [...companyIndex.values()].map(toCompanyRecord);

  return {
    companies,
    categories: [
      { key: "totalRating", label: "Top Total Rating", items: topByMetric(companies, "totalRating") },
      { key: "careerOpportunities", label: "Top Career Opportunities", items: topByMetric(companies, "careerOpportunities") },
      { key: "compensationAndBenefits", label: "Top Compensation & Benefits", items: topByMetric(companies, "compensationAndBenefits") },
      { key: "workLifeBalance", label: "Top Work-Life Balance", items: topByMetric(companies, "workLifeBalance") }
    ]
  };
}
