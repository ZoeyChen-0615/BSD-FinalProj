"use client";

import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { useMemo, useState } from "react";
import TopNavTabs from "../components/top-nav-tabs";

const COMMENT_PREVIEW_LENGTH = 220;
const DEFAULT_MIN_REVIEWS = 25;
const RANKING_CATEGORIES = [
  { key: "totalRating", label: "Top Total Rating" },
  { key: "careerOpportunities", label: "Top Career Opportunities" },
  { key: "compensationAndBenefits", label: "Top Compensation & Benefits" },
  { key: "workLifeBalance", label: "Top Work-Life Balance" }
];

function getInitials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "CO";
}

function truncateComment(text = "", limit = COMMENT_PREVIEW_LENGTH) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return { text: normalized, truncated: false };
  }

  return {
    text: `${normalized.slice(0, limit).trimEnd()}...`,
    truncated: true
  };
}

function CommentCard({ companyId, tone, item, index, expandedMap, setExpandedMap }) {
  const key = `${companyId}:${tone}:${index}`;
  const expanded = Boolean(expandedMap[key]);
  const preview = truncateComment(item);
  const label = expanded || !preview.truncated ? item : preview.text;

  return (
    <article className={`comment-card ${tone}`}>
      <p className="comment-copy">{label}</p>
      {preview.truncated ? (
        <button
          type="button"
          className="comment-toggle"
          onClick={() => setExpandedMap((current) => ({ ...current, [key]: !current[key] }))}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </article>
  );
}

function LandingState() {
  return (
    <main className="landing-shell">
      <TopNavTabs active="rankings" />
      <section className="landing-card">
        <p className="eyebrow">WorkWise Rankings</p>
        <h1>Browse the top-rated companies in the Glassdoor dataset.</h1>
        <p className="landing-copy">
          Sign in to explore the current top 5 companies across total rating, career growth, compensation, and work-life balance.
        </p>
        <div className="landing-actions">
          <SignInButton mode="modal">
            <button className="primary-button" type="button">Sign in</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="secondary-button" type="button">Create account</button>
          </SignUpButton>
        </div>
      </section>
    </main>
  );
}

function buildCategories(companies, minReviews) {
  const threshold = Number.isFinite(minReviews) ? minReviews : 0;
  const eligibleCompanies = companies.filter((company) => (company.reviewCount ?? 0) >= threshold);

  return RANKING_CATEGORIES.map((category) => ({
    ...category,
    items: [...eligibleCompanies]
      .filter((company) => Number.isFinite(company[category.key]))
      .sort((left, right) => right[category.key] - left[category.key] || left.name.localeCompare(right.name))
      .slice(0, 5)
  }));
}

export default function CompaniesClient({ companies = [] }) {
  const { user } = useUser();
  const [minReviewsInput, setMinReviewsInput] = useState(String(DEFAULT_MIN_REVIEWS));
  const [selectedCategoryKey, setSelectedCategoryKey] = useState(RANKING_CATEGORIES[0]?.key ?? "");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [expandedMap, setExpandedMap] = useState({});

  const minReviews = useMemo(() => {
    const parsed = Number.parseInt(minReviewsInput, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [minReviewsInput]);

  const categories = useMemo(
    () => buildCategories(companies, minReviews),
    [companies, minReviews]
  );

  const selectedCategory = useMemo(
    () => categories.find((category) => category.key === selectedCategoryKey) ?? categories[0] ?? null,
    [categories, selectedCategoryKey]
  );

  const selectedCompany = useMemo(
    () => selectedCategory?.items.find((company) => company.id === selectedCompanyId) ?? selectedCategory?.items?.[0] ?? null,
    [selectedCategory, selectedCompanyId]
  );

  function handleSelectCategory(category) {
    setSelectedCategoryKey(category.key);
    setSelectedCompanyId(category.items[0]?.id ?? "");
    setExpandedMap({});
  }

  function handleSelectCompany(companyId) {
    setSelectedCompanyId(companyId);
    setExpandedMap({});
  }

  return (
    <>
      <SignedOut>
        <LandingState />
      </SignedOut>
      <SignedIn>
        <main className="account-shell">
          <TopNavTabs active="rankings" />
          <header className="account-hero">
            <div>
              <p className="eyebrow">WorkWise Rankings</p>
              <h1>Top 5 companies by rating category.</h1>
              <p className="hero-copy">
                Switch between rating dimensions, review the top 5 company cards, and open one company at a time for a deeper detail view.
              </p>
            </div>
            <div className="hero-user">
              <div className="hero-user-meta">
                <span className="hero-user-label">Signed in as</span>
                <strong>{user?.primaryEmailAddress?.emailAddress}</strong>
              </div>
              <UserButton afterSignOutUrl="/companies" />
            </div>
          </header>

          <section className="surface-card rankings-card">
            <div className="section-head">
              <h2>Company rankings</h2>
              <span className="status-pill">Top 5 only</span>
            </div>

            <div className="ranking-controls">
              <label className="ranking-filter">
                <span className="section-kicker">Minimum rating count</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={minReviewsInput}
                  onChange={(event) => setMinReviewsInput(event.target.value)}
                />
              </label>
              <span className="status-pill">Showing companies with at least {minReviews} reviews</span>
            </div>

            <div className="ranking-tabs">
              {categories.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  className={`ranking-tab ${selectedCategory?.key === category.key ? "is-active" : ""}`}
                  onClick={() => handleSelectCategory(category)}
                >
                  {category.label}
                </button>
              ))}
            </div>

            {selectedCategory ? (
              <div className="favorites-layout rankings-layout">
                <div className="favorites-list">
                  {selectedCategory.items.map((company, index) => (
                    <button
                      key={company.id}
                      type="button"
                      className={`favorite-item ${selectedCompany?.id === company.id ? "is-active" : ""}`}
                      onClick={() => handleSelectCompany(company.id)}
                    >
                      <div className="favorite-logo">{getInitials(company.name)}</div>
                      <div className="favorite-copy">
                        <strong>{company.name}</strong>
                        <span>#{index + 1} in {selectedCategory.label}</span>
                        <span>{company.reviewCount} ratings</span>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="favorite-detail">
                  {selectedCompany ? (
                    <>
                      <div className="section-head">
                        <h3>{selectedCompany.name}</h3>
                        <span className="status-pill">
                          Rank #{selectedCategory.items.findIndex((company) => company.id === selectedCompany.id) + 1} · {selectedCompany.reviewCount} ratings
                        </span>
                      </div>
                      <div className="detail-metrics">
                        <div className="metric-card">
                          <span>Total Rating</span>
                          <strong>{selectedCompany.totalRating?.toFixed?.(1) ?? "--"}</strong>
                        </div>
                        <div className="metric-card">
                          <span>Career Opps</span>
                          <strong>{selectedCompany.careerOpportunities?.toFixed?.(1) ?? "--"}</strong>
                        </div>
                        <div className="metric-card">
                          <span>Comp & Benefits</span>
                          <strong>{selectedCompany.compensationAndBenefits?.toFixed?.(1) ?? "--"}</strong>
                        </div>
                        <div className="metric-card">
                          <span>WLB</span>
                          <strong>{selectedCompany.workLifeBalance?.toFixed?.(1) ?? "--"}</strong>
                        </div>
                      </div>
                      <div className="comments-grid">
                        <div>
                          <p className="section-kicker">Pros</p>
                          <div className="comment-stack">
                            {selectedCompany.allPros.map((item, index) => (
                              <CommentCard
                                key={`${selectedCompany.id}-pro-${index}`}
                                companyId={selectedCompany.id}
                                tone="positive"
                                item={item}
                                index={index}
                                expandedMap={expandedMap}
                                setExpandedMap={setExpandedMap}
                              />
                            ))}
                            {!selectedCompany.allPros.length && <div className="empty-pill">No pros found.</div>}
                          </div>
                        </div>
                        <div>
                          <p className="section-kicker">Cons</p>
                          <div className="comment-stack">
                            {selectedCompany.allCons.map((item, index) => (
                              <CommentCard
                                key={`${selectedCompany.id}-con-${index}`}
                                companyId={selectedCompany.id}
                                tone="negative"
                                item={item}
                                index={index}
                                expandedMap={expandedMap}
                                setExpandedMap={setExpandedMap}
                              />
                            ))}
                            {!selectedCompany.allCons.length && <div className="empty-pill">No cons found.</div>}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="muted-copy">Select a company to inspect the full details.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="muted-copy">No ranking data available for this minimum rating count.</p>
            )}
          </section>
        </main>
      </SignedIn>
    </>
  );
}
