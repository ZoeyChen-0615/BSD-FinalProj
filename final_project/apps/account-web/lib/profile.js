const skillPatterns = [
  { label: "Python", patterns: ["python", "pandas", "numpy"] },
  { label: "C++", patterns: ["c++", "cpp"] },
  { label: "C#", patterns: ["c#", ".net", "dotnet", "asp.net", "asp net"] },
  { label: "Go", patterns: ["golang", " go ", "go,", "go."] },
  { label: "Scala", patterns: ["scala"] },
  { label: "SQL", patterns: ["sql", "postgres", "mysql", "snowflake", "bigquery"] },
  { label: "Spark", patterns: ["spark"] },
  { label: "PySpark", patterns: ["pyspark"] },
  { label: "Azure", patterns: ["azure", "synapse", "azure databricks", "azuredatabricks"] },
  { label: "Docker", patterns: ["docker", "container"] },
  { label: "Java", patterns: ["java"] },
  { label: "Spring", patterns: ["spring", "spring framework"] },
  { label: "Databricks", patterns: ["databricks", "azure databricks", "azuredatabricks"] },
  { label: "REST APIs", patterns: ["rest api", "rest apis"] },
  { label: "MongoDB", patterns: ["mongodb", "mongo db"] },
  { label: "Redis", patterns: ["redis"] },
  { label: "MySQL", patterns: ["mysql"] },
  { label: "APIs", patterns: [" api ", " apis ", "api,", "apis,"] },
  { label: "Cloud Platforms", patterns: ["cloud platform", "cloud platforms", "google cloud", "aws", "azure"] },
  { label: "Computer Programming", patterns: ["computer programming", "programming language", "programming"] },
  { label: "A/B Testing", patterns: ["a/b test", "ab test", "a/b testing"] },
  { label: "Data Analysis", patterns: ["data analysis", "analyze data", "analytics"] },
  { label: "Automation", patterns: ["automation", "automate"] },
  { label: "Machine Learning", patterns: ["machine learning", "random forest", "bert", "k-means", "tf-idf"] }
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

function buildResumePreview(fileText) {
  return (fileText || "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40)
    .join("\n");
}

function buildResumeSummary(fileText) {
  return (fileText || "")
    .split(/\n/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

export function normalizeProfile(profile) {
  if (!profile) {
    return null;
  }

  const rawText = profile.resume?.rawText || profile.parsedResume?.preview || "";
  const normalizedSkills = unique(
    rawText
      ? extractSkillsFromText(rawText)
      : (profile.parsedResume?.skills ?? []).filter(Boolean)
  );

  return {
    ...profile,
    resume: {
      ...profile.resume,
      fileName: profile.resume?.fileName ?? "resume.txt",
      uploadedAt: profile.resume?.uploadedAt ?? new Date().toISOString(),
      rawText
    },
    parsedResume: {
      ...profile.parsedResume,
      skills: normalizedSkills,
      preview: rawText ? buildResumePreview(rawText) : (profile.parsedResume?.preview ?? ""),
      summary: rawText ? buildResumeSummary(rawText) : (profile.parsedResume?.summary ?? ""),
      experienceLevel:
        profile.parsedResume?.experienceLevel ??
        (/senior|lead|staff/i.test(rawText) ? "Senior" : "Mid-level"),
      education:
        profile.parsedResume?.education ??
        (/master|ms|phd/i.test(rawText) ? "Advanced degree mentioned" : "Education not detected")
    }
  };
}

