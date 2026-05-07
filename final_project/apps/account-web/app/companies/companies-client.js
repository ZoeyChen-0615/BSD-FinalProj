"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { useMemo, useState } from "react";

function getInitials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "CO";
}

function LandingState() {
  return (
    <main className="landing-shell">
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

export default function CompaniesClient({ categories = [] }) {
  const { user } = useUser();
  const firstCompanyId = categories.find((category) => category.items.length)?.items[0]?.id ?? "";
  const [selectedCompanyId, setSelectedCompanyId] = useState(firstCompanyId);

  const companyMap = useMemo(
    () => new Map(categories.flatMap((category) => category.items.map((company) => [company.id, company]))),
    [categories]
  );

  const selectedCompany = companyMap.get(selectedCompanyId) ?? companyMap.values().next().value ?? null;

  return (
    <>
      <SignedOut>
        <LandingState />
      </SignedOut>
      <SignedIn>
        <main className="account-shell">
          <header className="account-hero">
            <div>
              <p className="eyebrow">WorkWise Rankings</p>
              <h1>Top 5 companies by rating category.</h1>
              <p className="hero-copy">
                Explore the highest-ranked companies in the current Glassdoor dataset and open any card to inspect full rating details.
              </p>
              <div className="hero-actions">
                <Link className="secondary-button nav-link-button" href="/">Account page</Link>
              </div>
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
              <h2>Top company cards</h2>
              <span className="status-pill">Top 5 per metric</span>
            </div>
            <div className="ranking-sections">
              {categories.map((category) => (
                <div key={category.key} className="ranking-group">
                  <p className="section-kicker">{category.label}</p>
                  <div className="ranking-card-grid">
                    {category.items.map((company, index) => (
                      <button
                        key={`${category.key}-${company.id}`}
                        type="button"
                        className={`ranking-card ${selectedCompany?.id === company.id ? "is-active" : ""}`}
                        onClick={() => setSelectedCompanyId(company.id)}
                      >
                        <div className="favorite-logo">{getInitials(company.name)}</div>
                        <div className="ranking-card-copy">
                          <strong>{company.name}</strong>
                          <span>#{index + 1} in {category.label}</span>
                          <b>{company[category.key]?.toFixed?.(1) ?? "--"}</b>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card">
            <div className="section-head">
              <h2>{selectedCompany?.name ?? "Select a company"}</h2>
              <span className="status-pill">Detail view</span>
            </div>
            {selectedCompany ? (
              <>
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
                        <article key={`${selectedCompany.id}-pro-${index}`} className="comment-card positive">{item}</article>
                      ))}
                      {!selectedCompany.allPros.length && <div className="empty-pill">No pros found.</div>}
                    </div>
                  </div>
                  <div>
                    <p className="section-kicker">Cons</p>
                    <div className="comment-stack">
                      {selectedCompany.allCons.map((item, index) => (
                        <article key={`${selectedCompany.id}-con-${index}`} className="comment-card negative">{item}</article>
                      ))}
                      {!selectedCompany.allCons.length && <div className="empty-pill">No cons found.</div>}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted-copy">No company data available.</p>
            )}
          </section>
        </main>
      </SignedIn>
    </>
  );
}
