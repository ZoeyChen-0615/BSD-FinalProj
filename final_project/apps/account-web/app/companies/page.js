import CompaniesClient from "./companies-client";
import { getCompanyRankings } from "../../lib/company-rankings";

export const metadata = {
  title: "WorkWise Rankings",
  description: "Browse the top 5 companies by rating across the WorkWise Glassdoor dataset."
};

export default async function CompaniesPage() {
  const { categories } = await getCompanyRankings();
  return <CompaniesClient categories={categories} />;
}
