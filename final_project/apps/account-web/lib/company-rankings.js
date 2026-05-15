import { readFile } from "node:fs/promises";
import path from "node:path";
import { unstable_cache } from "next/cache";
async function readRankingsJson() {
  const candidates = [
    path.resolve(process.cwd(), "data", "company-rankings.json"),
    path.resolve(process.cwd(), "apps", "account-web", "data", "company-rankings.json")
  ];

  for (const candidate of candidates) {
    try {
      const text = await readFile(candidate, "utf8");
      return JSON.parse(text);
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("Could not locate company-rankings.json. Run `npm run build:rankings-data` in apps/account-web.");
}

const getCachedCompanyRankings = unstable_cache(
  async () => {
    return readRankingsJson();
  },
  ["workwise-company-rankings"],
  {
    revalidate: 3600
  }
);

export async function getCompanyRankings() {
  return getCachedCompanyRankings();
}
