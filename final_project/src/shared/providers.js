export const ANALYSIS_SCHEMA_VERSION = 2;

const skillPatterns = [
  { key: "python", label: "Python", patterns: ["python", "pandas", "numpy"] },
  { key: "sql", label: "SQL", patterns: ["sql", "postgres", "mysql", "snowflake", "bigquery"] },
  { key: "spark", label: "Spark", patterns: ["spark", "pyspark", "databricks"] },
  { key: "pyspark", label: "PySpark", patterns: ["pyspark"] },
  { key: "airflow", label: "Airflow", patterns: ["airflow"] },
  { key: "aws", label: "AWS", patterns: ["aws", "redshift", "s3", "glue", "lambda"] },
  { key: "gcp", label: "GCP", patterns: ["gcp", "google cloud", "bigquery", "dataflow"] },
  { key: "azure", label: "Azure", patterns: ["azure", "synapse", "azure databricks", "azuredatabricks"] },
  { key: "docker", label: "Docker", patterns: ["docker", "container"] },
  { key: "kubernetes", label: "Kubernetes", patterns: ["kubernetes", "k8s"] },
  { key: "java", label: "Java", patterns: ["java"] },
  { key: "javascript", label: "JavaScript", patterns: ["javascript", "typescript", "node"] },
  { key: "dbt", label: "dbt", patterns: ["dbt"] },
  { key: "etl", label: "ETL / ELT", patterns: ["etl", "elt", "pipeline"] },
  { key: "data-modeling", label: "Data Modeling", patterns: ["data modeling", "data models", "dimensional", "schema"] },
  { key: "kafka", label: "Kafka", patterns: ["kafka"] },
  { key: "flink", label: "Flink", patterns: ["flink"] },
  { key: "hive", label: "Hive", patterns: ["hive"] },
  { key: "databricks", label: "Databricks", patterns: ["databricks", "azure databricks", "azuredatabricks"] },
  { key: "spring-boot", label: "Spring Boot", patterns: ["spring boot", "springboot"] },
  { key: "rest-apis", label: "REST APIs", patterns: ["rest api", "rest apis"] },
  { key: "mongodb", label: "MongoDB", patterns: ["mongodb", "mongo db"] },
  { key: "redis", label: "Redis", patterns: ["redis"] },
  { key: "power-bi", label: "Power BI", patterns: ["power bi", "powerbi"] },
  { key: "tableau", label: "Tableau", patterns: ["tableau"] },
  { key: "git", label: "Git", patterns: ["git", "github"] },
  { key: "mysql", label: "MySQL", patterns: ["mysql"] },
  { key: "apis", label: "APIs", patterns: [" api ", " apis ", "api,", "apis,"] },
  { key: "data-quality", label: "Data Quality", patterns: ["data quality", "data validation", "schema consistency", "anomaly detection"] },
  { key: "power-platforms", label: "Cloud Platforms", patterns: ["cloud platform", "cloud platforms", "alicloud", "google cloud", "aws", "azure"] },
  { key: "a-b-testing", label: "A/B Testing", patterns: ["a/b test", "ab test", "a/b testing"] },
  { key: "machine-learning", label: "Machine Learning", patterns: ["machine learning", "random forest", "adaboost", "bert", "bertopic", "k-means", "tf-idf"] }
];

const redFlagRules = [
  { phrase: "fast-paced", reason: "May imply chronic urgency or reactive planning." },
  { phrase: "wear many hats", reason: "Role boundaries may be blurry and workload uneven." },
  { phrase: "rockstar", reason: "Often correlates with unrealistic individual expectations." },
  { phrase: "hit the ground running", reason: "Suggests limited onboarding support." },
  { phrase: "ninja", reason: "Tends to signal vague expectations over clear scope." },
  { phrase: "weekend", reason: "Could indicate off-hours work or support load." },
  { phrase: "on-call", reason: "Operational burden may affect work-life balance." }
];

const greenFlagRules = [
  { phrase: "flexible hours", reason: "Signals schedule autonomy." },
  { phrase: "work-life balance", reason: "The team explicitly values sustainable pace." },
  { phrase: "sustainable pace", reason: "Strong positive language around long-term workload." },
  { phrase: "mentorship", reason: "Suggests investment in onboarding and growth." },
  { phrase: "remote-first", reason: "Often implies more location flexibility." },
  { phrase: "no on-call", reason: "Reduces after-hours operational burden." }
];

const requirementHintRules = [
  { label: "SQL and analytics querying", patterns: ["sql", "query", "queries", "analytics"] },
  { label: "Python or scripting", patterns: ["python", "script", "scripting", "automation"] },
  { label: "Data pipelines", patterns: ["etl", "elt", "pipeline", "workflows", "orchestration"] },
  { label: "Cloud data stack", patterns: ["aws", "azure", "gcp", "cloud", "databricks"] },
  { label: "Dashboards and reporting", patterns: ["dashboard", "reporting", "tableau", "power bi", "bi"] },
  { label: "Experimentation", patterns: ["a/b", "experiment", "testing", "hypothesis"] },
  { label: "Machine learning", patterns: ["machine learning", "model", "classification", "prediction"] },
  { label: "Data modeling", patterns: ["data model", "schema", "warehouse", "dimensional"] },
  { label: "Cross-functional communication", patterns: ["stakeholder", "cross-functional", "partner", "communicate"] },
  { label: "API integration", patterns: ["api", "apis", "integration", "integrate"] }
];

const greenSignalRules = [
  { label: "Mentorship", patterns: ["mentorship", "mentor", "coaching"], reason: "Suggests support for ramp-up and growth." },
  { label: "Flexibility", patterns: ["flexible hours", "flexibility", "remote-first", "hybrid"], reason: "Signals some autonomy over where or when work happens." },
  { label: "Collaboration", patterns: ["collaborate", "cross-functional", "partner with", "work closely"], reason: "The role appears to involve shared ownership instead of isolated firefighting." },
  { label: "Learning", patterns: ["learn", "growth", "development", "career"], reason: "The job language points to skill development opportunities." },
  { label: "Well-being", patterns: ["work-life balance", "sustainable pace", "no on-call"], reason: "The description explicitly hints at a healthier operating model." }
];

const redSignalRules = [
  { label: "Urgency", patterns: ["fast-paced", "urgency", "high pressure", "tight deadlines"], reason: "May indicate sustained reactive work." },
  { label: "Overload", patterns: ["wear many hats", "rockstar", "ninja", "self-starter"], reason: "Can signal broad expectations without enough structure." },
  { label: "On-call", patterns: ["on-call", "after hours", "weekend", "off-hours"], reason: "Suggests extra operational load beyond normal working hours." },
  { label: "Immediate ramp", patterns: ["hit the ground running", "immediately", "day one"], reason: "May imply limited onboarding support." },
  { label: "Always-on ownership", patterns: ["own everything", "end-to-end ownership", "full ownership"], reason: "Could mean wide scope if not balanced by clear support systems." }
];

function unique(items) {
  return [...new Set(items)];
}

function includesAny(text, patterns) {
  const normalized = text.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function extractSkillsFromText(text) {
  return skillPatterns
    .filter((skill) => includesAny(text, skill.patterns))
    .map((skill) => skill.label);
}

function extractRequirementSnippets(description) {
  return description
    .split(/\n|\./)
    .map((item) => item.trim())
    .filter((item) => item.length > 20)
    .slice(0, 12);
}

function splitMeaningfulLines(text) {
  return text
    .split(/\n|\r|\u2022|•/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 20);
}

function collectRequirementSnippets(description) {
  const lines = splitMeaningfulLines(description);
  const priorityLines = lines.filter((line) =>
    /(requirements?|qualifications?|responsibilities|what you'll do|you will|preferred|must have|nice to have)/i.test(line)
  );
  const source = priorityLines.length ? priorityLines : lines;
  return source.slice(0, 8);
}

function inferRequirementLabels(description) {
  return requirementHintRules
    .filter((rule) => includesAny(description, rule.patterns))
    .map((rule) => rule.label);
}

function buildRequirementList(text, resumeSkills) {
  const explicitSkills = unique(extractSkillsFromText(text));
  if (explicitSkills.length) {
    return explicitSkills.map((skill) => ({
      label: skill,
      matched: resumeSkills.includes(skill)
    }));
  }

  const inferredLabels = unique(inferRequirementLabels(text));
  if (inferredLabels.length) {
    return inferredLabels.map((label) => ({
      label,
      matched: resumeSkills.some((skill) => label.toLowerCase().includes(skill.toLowerCase()) || skill.toLowerCase().includes(label.toLowerCase()))
    }));
  }

  const snippets = collectRequirementSnippets(text);
  if (snippets.length) {
    return snippets.map((snippet) => ({
      label: snippet,
      matched: resumeSkills.some((skill) => snippet.toLowerCase().includes(skill.toLowerCase()))
    }));
  }

  return [
    {
      label: "Visible job details are limited; refresh on the full LinkedIn posting to compare role fit.",
      matched: false
    }
  ];
}

function collectLanguageFlags(description, rules) {
  return rules
    .filter((rule) => includesAny(description, rule.patterns))
    .map((rule) => ({ label: rule.label, reason: rule.reason }));
}

function createLanguageSummary(analysisText, greenFlags, redFlags) {
  if (!analysisText) {
    return "Open a job posting with a visible title or description to analyze language and role requirements.";
  }

  const substantiveRedFlags = redFlags.filter((flag) => flag.label !== "No clear red flags found");
  const substantiveGreenFlags = greenFlags.filter((flag) => flag.label !== "No obvious toxic language");

  if (substantiveRedFlags.length > substantiveGreenFlags.length) {
    return "Language suggests a potentially high-intensity environment.";
  }

  return "Language leans neutral to healthy, with some signs of sustainable work practices.";
}

export const demoResumeParser = {
  async parseResume(fileText, metadata = {}) {
    const skills = unique(extractSkillsFromText(fileText));
    const preview = fileText
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 40)
      .join("\n");
    const profile = {
      id: "local-demo-user",
      email: "demo@workwise.local",
      authProvider: "local-demo",
      resume: {
        fileName: metadata.fileName ?? "resume.txt",
        uploadedAt: new Date().toISOString(),
        rawText: fileText
      },
      parsedResume: {
        skills,
        preview,
        summary: fileText.split(/\n/).filter(Boolean).slice(0, 3).join(" "),
        experienceLevel: /senior|lead|staff/i.test(fileText) ? "Senior" : "Mid-level",
        education: /master|ms|phd/i.test(fileText) ? "Advanced degree mentioned" : "Education not detected"
      }
    };

    return profile;
  }
};

export const demoJobAnalyzer = {
  async analyzeJob({ job, profile }) {
    const title = job?.title ?? "";
    const description = job?.description ?? "";
    const analysisText = `${title}\n${description}`.trim();
    const resumeSkills = profile?.parsedResume?.skills ?? [];
    const requirements = buildRequirementList(analysisText, resumeSkills);
    const matchedSkills = requirements.filter((item) => item.matched).map((item) => item.label);
    const missingSkills = requirements.filter((item) => !item.matched).map((item) => item.label);
    const scoreBase = requirements.length || Math.max(resumeSkills.length, 1);
    const matchScore = requirements.length
      ? Math.round((matchedSkills.length / scoreBase) * 100)
      : 0;

    const phraseRedFlags = redFlagRules
      .filter((rule) => analysisText.toLowerCase().includes(rule.phrase))
      .map((rule) => ({ label: rule.phrase, reason: rule.reason }));

    const phraseGreenFlags = greenFlagRules
      .filter((rule) => analysisText.toLowerCase().includes(rule.phrase))
      .map((rule) => ({ label: rule.phrase, reason: rule.reason }));

    const ruleBasedGreenFlags = collectLanguageFlags(analysisText, greenSignalRules);
    const ruleBasedRedFlags = collectLanguageFlags(analysisText, redSignalRules);
    const greenFlags = unique([...phraseGreenFlags, ...ruleBasedGreenFlags].map((item) => JSON.stringify(item))).map((item) =>
      JSON.parse(item)
    );
    const redFlags = unique([...phraseRedFlags, ...ruleBasedRedFlags].map((item) => JSON.stringify(item))).map((item) =>
      JSON.parse(item)
    );

    if (!greenFlags.length && analysisText) {
      greenFlags.push({
        label: "No obvious toxic language",
        reason: "The posting does not strongly emphasize urgency, heroics, or off-hours work."
      });
    }

    if (!redFlags.length && analysisText) {
      redFlags.push({
        label: "No clear red flags found",
        reason: "No common overwork or unrealistic-expectation phrases were detected in the visible posting text."
      });
    }

    return {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      analyzedAt: new Date().toISOString(),
      match: {
        score: matchScore,
        matchedSkills,
        missingSkills,
        requirements
      },
      languageSignals: {
        redFlags,
        greenFlags,
        summary: createLanguageSummary(analysisText, greenFlags, redFlags)
      }
    };
  }
};

export const demoCompanyInsightsProvider = {
  async lookupCompany(companyName) {
    const record = await lookupCompanyFromGlassdoorCsv(companyName);
    if (record) {
      return {
        ...record,
        source: "glassdoor-csv"
      };
    }

    return {
      name: companyName || "Unknown company",
      workLifeBalance: "--",
      companySize: "--",
      industry: "--",
      salaryHint: "--",
      pros: [],
      cons: [],
      source: "no-coverage"
    };
  }
};

const GLASSDOOR_CSV_PATH = "src/shared/glassdoor_cleaned.csv";

let glassdoorCompanyIndexPromise = null;

function normalizeCompanyLookup(value) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|plc|group|holdings)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
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

  return (tracker.sum / tracker.count).toFixed(1);
}

function appendUniqueSnippet(list, rawValue) {
  const value = (rawValue || "").replace(/\s+/g, " ").trim();
  if (!value || list.includes(value)) {
    return;
  }

  list.push(value);
}

async function buildGlassdoorCompanyIndex() {
  const response = await fetch(chrome.runtime.getURL(GLASSDOOR_CSV_PATH));
  const csvText = await response.text();
  const lines = csvText.split(/\r?\n/).filter(Boolean);

  if (lines.length <= 1) {
    return new Map();
  }

  const headers = parseCsvLine(lines[0]);
  const companyIndex = new Map();
  const companyColumn = headers.indexOf("firm_name");
  const ratingColumn = headers.indexOf("rating");
  const prosColumn = headers.indexOf("pros");
  const consColumn = headers.indexOf("cons");
  const careerColumn = headers.indexOf("Career Opportunities");
  const compensationColumn = headers.indexOf("Compensation and Benefits");
  const wlbColumn = headers.indexOf("Work/Life Balance");

  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const companyName = row[companyColumn];
    const normalizedCompany = normalizeCompanyLookup(companyName);

    if (!normalizedCompany) {
      continue;
    }

    if (!companyIndex.has(normalizedCompany)) {
      companyIndex.set(normalizedCompany, {
        name: companyName.trim(),
        rating: createMetricTracker(),
        careerOpportunities: createMetricTracker(),
        compensationAndBenefits: createMetricTracker(),
        workLifeBalance: createMetricTracker(),
        pros: [],
        cons: []
      });
    }

    const aggregate = companyIndex.get(normalizedCompany);
    appendMetric(aggregate.rating, row[ratingColumn]);
    appendMetric(aggregate.careerOpportunities, row[careerColumn]);
    appendMetric(aggregate.compensationAndBenefits, row[compensationColumn]);
    appendMetric(aggregate.workLifeBalance, row[wlbColumn]);
    appendUniqueSnippet(aggregate.pros, row[prosColumn]);
    appendUniqueSnippet(aggregate.cons, row[consColumn]);
  }

  return companyIndex;
}

async function loadGlassdoorCompanyIndex() {
  if (!glassdoorCompanyIndexPromise) {
    glassdoorCompanyIndexPromise = buildGlassdoorCompanyIndex();
  }

  return glassdoorCompanyIndexPromise;
}

function pickBestCompanyAggregate(companyIndex, companyName) {
  const normalizedTarget = normalizeCompanyLookup(companyName);
  if (!normalizedTarget) {
    return null;
  }

  if (companyIndex.has(normalizedTarget)) {
    return companyIndex.get(normalizedTarget);
  }

  let bestMatch = null;

  for (const [normalizedName, aggregate] of companyIndex.entries()) {
    if (
      normalizedName.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedName)
    ) {
      if (!bestMatch || normalizedName.length > bestMatch.normalizedName.length) {
        bestMatch = { normalizedName, aggregate };
      }
    }
  }

  return bestMatch?.aggregate ?? null;
}

async function lookupCompanyFromGlassdoorCsv(companyName) {
  const companyIndex = await loadGlassdoorCompanyIndex();
  const aggregate = pickBestCompanyAggregate(companyIndex, companyName);

  if (!aggregate) {
    return null;
  }

  return {
    name: aggregate.name,
    workLifeBalance: averageMetric(aggregate.rating) ?? "--",
    companySize: averageMetric(aggregate.careerOpportunities) ?? "--",
    industry: averageMetric(aggregate.compensationAndBenefits) ?? "--",
    salaryHint: averageMetric(aggregate.workLifeBalance) ?? "--",
    pros: aggregate.pros.slice(0, 3),
    cons: aggregate.cons.slice(0, 3)
  };
}

export const providerRegistry = {
  authStore: {
    mode: "chrome-storage-local",
    futureProvider: "supabase-auth"
  },
  resumeParser: demoResumeParser,
  jobAnalyzer: demoJobAnalyzer,
  companyInsights: demoCompanyInsightsProvider
};
