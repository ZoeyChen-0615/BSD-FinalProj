"use client";

import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { useEffect, useMemo, useState } from "react";
import { normalizeProfile } from "../lib/profile";
import { readResumeText } from "../lib/resume";

const ACCOUNT_AUTH_STATE_KEY = "workwise.accountAuthState";
const ACCOUNT_PROFILE_STATE_KEY = "workwise.accountProfileState";

function persistAccountSyncState(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore localStorage write failures in the account page.
  }
}

function syncAuthToExtension(user) {
  if (typeof window === "undefined") {
    return "";
  }

  const syncedAt = new Date().toISOString();
  persistAccountSyncState(ACCOUNT_AUTH_STATE_KEY, {
    email: user?.primaryEmailAddress?.emailAddress ?? "",
    signedIn: Boolean(user?.id),
    source: "account-web",
    syncedAt
  });

  window.postMessage(
    {
      source: "workwise-account-web",
      type: "WORKWISE_AUTH_SYNC",
      payload: {
        email: user?.primaryEmailAddress?.emailAddress ?? "",
        signedIn: Boolean(user?.id),
        syncedAt
      }
    },
    window.location.origin
  );
  return syncedAt;
}

function syncProfileToExtension(profile, user) {
  if (typeof window === "undefined" || !profile || !user?.id) {
    return "";
  }

  const syncedAt = new Date().toISOString();
  persistAccountSyncState(ACCOUNT_PROFILE_STATE_KEY, {
    clerkUserId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? "",
    profile,
    syncedAt
  });

  window.postMessage(
    {
      source: "workwise-account-web",
      type: "WORKWISE_PROFILE_SYNC",
      payload: {
        clerkUserId: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? "",
        profile,
        syncedAt
      }
    },
    window.location.origin
  );
  return syncedAt;
}

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || "Request failed.");
  }

  return payload;
}

async function loadRemoteProfile() {
  const response = await fetch("/api/profile", {
    method: "GET",
    credentials: "include"
  });

  const payload = await parseJsonResponse(response);
  return payload?.profile ?? null;
}

async function saveRemoteProfile(profile, email) {
  const response = await fetch("/api/profile", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ profile, email })
  });

  const payload = await parseJsonResponse(response);
  return payload?.profile ?? profile;
}

function formatDate(value) {
  if (!value) {
    return "--";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function getInitials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "CO";
}

function EmptyState() {
  useEffect(() => {
    syncAuthToExtension(null);
  }, []);

  return (
    <main className="landing-shell">
      <section className="landing-card">
        <p className="eyebrow">WorkWise</p>
        <h1>Manage your WorkWise account, resume, and favorite companies.</h1>
        <p className="landing-copy">
          Sign in to keep one resume across LinkedIn job posts and review every company you saved from the extension.
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

function AccountDashboard() {
  const { user } = useUser();
  const [profile, setProfile] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [status, setStatus] = useState("Loading your account...");
  const [isUploading, setIsUploading] = useState(false);

  const favorites = useMemo(() => profile?.favoriteCompanies ?? [], [profile]);
  const selectedCompany = useMemo(
    () => favorites.find((company) => company.id === selectedCompanyId) ?? favorites[0] ?? null,
    [favorites, selectedCompanyId]
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        if (!user?.id) {
          syncAuthToExtension(null);
          if (!cancelled) {
            setStatus("Sign in to load your WorkWise account.");
          }
          return;
        }

        syncAuthToExtension(user);

        const remoteProfile = normalizeProfile(
          await loadRemoteProfile()
        );

        if (cancelled) {
          return;
        }

        setProfile(remoteProfile);
        setSelectedCompanyId(remoteProfile?.favoriteCompanies?.[0]?.id ?? "");
        setStatus(remoteProfile?.parsedResume ? "Resume restored from your account." : "No resume uploaded yet.");
        syncProfileToExtension(remoteProfile, user);
      } catch (error) {
        if (!cancelled) {
          setStatus(error?.message || "Could not load your account.");
        }
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function persistProfile(nextProfile, successMessage) {
    if (!user?.id) {
      throw new Error("Please sign in again.");
    }

    const savedProfile = normalizeProfile(
      await saveRemoteProfile(nextProfile, user.primaryEmailAddress?.emailAddress ?? "")
    );

    setProfile(savedProfile);
    setSelectedCompanyId(savedProfile?.favoriteCompanies?.[0]?.id ?? "");
    setStatus(successMessage);
    syncAuthToExtension(user);
    syncProfileToExtension(savedProfile, user);
  }

  async function handleResumeUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    setStatus(`Reading ${file.name}...`);

    try {
      const fileText = await readResumeText(file);
      const nextProfile = normalizeProfile({
        ...(profile ?? {}),
        favoriteCompanies: favorites,
        resume: {
          fileName: file.name,
          uploadedAt: new Date().toISOString(),
          rawText: fileText
        },
        parsedResume: {
          ...(profile?.parsedResume ?? {})
        }
      });

      await persistProfile(nextProfile, `${file.name} uploaded.`);
    } catch (error) {
      setStatus(error?.message || "Resume upload failed.");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleRemoveFavorite(companyId) {
    const nextFavorites = favorites.filter((company) => company.id !== companyId);
    const nextProfile = {
      ...(profile ?? {}),
      favoriteCompanies: nextFavorites
    };

    try {
      await persistProfile(nextProfile, "Favorite companies updated.");
    } catch (error) {
      setStatus(error?.message || "Could not update favorites.");
    }
  }

  return (
    <main className="account-shell">
      <header className="account-hero">
        <div>
          <p className="eyebrow">WorkWise Account</p>
          <h1>One account for resume sync and company tracking.</h1>
          <p className="hero-copy">
            Upload the latest resume once, keep your session across job posts, and review the companies you saved from the extension.
          </p>
        </div>
        <div className="hero-user">
          <div className="hero-user-meta">
            <span className="hero-user-label">Signed in as</span>
            <strong>{user?.primaryEmailAddress?.emailAddress}</strong>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <div className="dashboard-grid">
        <section className="surface-card">
          <div className="section-head">
            <h2>Resume</h2>
            <span className="status-pill">{status}</span>
          </div>
          <p className="muted-copy">
            Latest resume: <strong>{profile?.resume?.fileName ?? "none"}</strong>
          </p>
          <p className="muted-copy">Uploaded at: {formatDate(profile?.resume?.uploadedAt)}</p>
          <label className="upload-button">
            <span>{isUploading ? "Uploading..." : "Upload Resume (.txt, .docx)"}</span>
            <input
              type="file"
              accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleResumeUpload}
              disabled={isUploading}
            />
          </label>
          <div className="keyword-block">
            <p className="section-kicker">Latest Keywords</p>
            <div className="keyword-row">
              {(profile?.parsedResume?.skills ?? []).map((skill) => (
                <span key={skill} className="keyword-chip">{skill}</span>
              ))}
              {!profile?.parsedResume?.skills?.length && <span className="empty-pill">No keywords yet.</span>}
            </div>
          </div>
          <div className="preview-block">
            <p className="section-kicker">Resume Preview</p>
            <pre className="resume-preview">{profile?.parsedResume?.preview ?? "No extracted resume text yet."}</pre>
          </div>
        </section>

        <section className="surface-card">
          <div className="section-head">
            <h2>Favorite Companies</h2>
            <span className="status-pill">{favorites.length} saved</span>
          </div>
          {!favorites.length ? (
            <p className="muted-copy">Favorite a company from the extension to see it here.</p>
          ) : (
            <div className="favorites-layout">
              <div className="favorites-list">
                {favorites.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    className={`favorite-item ${selectedCompany?.id === company.id ? "is-active" : ""}`}
                    onClick={() => setSelectedCompanyId(company.id)}
                  >
                    <div className="favorite-logo">{getInitials(company.name)}</div>
                    <div className="favorite-copy">
                      <strong>{company.name}</strong>
                      <span>Saved {formatDate(company.savedAt)}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="favorite-detail">
                {selectedCompany ? (
                  <>
                    <div className="section-head">
                      <h3>{selectedCompany.name}</h3>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => handleRemoveFavorite(selectedCompany.id)}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="detail-metrics">
                      <div className="metric-card">
                        <span>Total Rating</span>
                        <strong>{selectedCompany.totalRating}</strong>
                      </div>
                      <div className="metric-card">
                        <span>Career Opps</span>
                        <strong>{selectedCompany.careerOpportunities}</strong>
                      </div>
                      <div className="metric-card">
                        <span>Comp & Benefits</span>
                        <strong>{selectedCompany.compensationAndBenefits}</strong>
                      </div>
                      <div className="metric-card">
                        <span>WLB</span>
                        <strong>{selectedCompany.workLifeBalance}</strong>
                      </div>
                    </div>
                    <div className="comments-grid">
                      <div>
                        <p className="section-kicker">Pros</p>
                        <div className="comment-stack">
                          {(selectedCompany.allPros ?? selectedCompany.pros ?? []).map((item, index) => (
                            <article key={`${selectedCompany.id}-pro-${index}`} className="comment-card positive">{item}</article>
                          ))}
                          {!(selectedCompany.allPros ?? selectedCompany.pros ?? []).length && (
                            <div className="empty-pill">No pros found.</div>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="section-kicker">Cons</p>
                        <div className="comment-stack">
                          {(selectedCompany.allCons ?? selectedCompany.cons ?? []).map((item, index) => (
                            <article key={`${selectedCompany.id}-con-${index}`} className="comment-card negative">{item}</article>
                          ))}
                          {!(selectedCompany.allCons ?? selectedCompany.cons ?? []).length && (
                            <div className="empty-pill">No cons found.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="muted-copy">Select a company to view full comments.</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <>
      <SignedOut>
        <EmptyState />
      </SignedOut>
      <SignedIn>
        <AccountDashboard />
      </SignedIn>
    </>
  );
}
