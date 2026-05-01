import { ANALYSIS_SCHEMA_VERSION, normalizeProfile, providerRegistry } from "../shared/providers.js";
import {
  STORAGE_KEYS,
  loadAuthSnapshot,
  loadCurrentAnalysis,
  loadDetectedJob,
  loadFavoriteCompanies,
  loadProfile,
  loadUserFavoriteCompanies,
  loadUserProfile,
  saveCurrentAnalysis,
  saveAuthSnapshot,
  saveFavoriteCompanies,
  saveUserFavoriteCompanies,
  saveUserProfile,
  saveProfile
} from "../shared/storage.js";
import {
  getClerkAuthState,
  getClerkEmail,
  getClerkSessionToken,
  signInWithClerk,
  signOutFromClerk,
  signUpWithClerk
} from "../shared/clerk.js";
import { ACCOUNT_APP_URL } from "../shared/cloudConfig.js";
import {
  isSupabaseConfigured,
  loadRemoteProfile,
  saveRemoteProfile
} from "../shared/supabase.js";

function extractJobFromLinkedInPage() {
  function cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function textFrom(element) {
    return cleanText(element?.innerText || element?.textContent || "");
  }

  function normalizeLocation(rawLocation) {
    if (!rawLocation) {
      return "";
    }

    const [location] = rawLocation
      .split("·")
      .map((part) => part.trim())
      .filter(Boolean);

    return location ?? rawLocation;
  }

  function normalizeCompany(rawCompany) {
    if (!rawCompany) {
      return "";
    }

    let value = cleanText(rawCompany)
      .split(" · ")[0]
      .split("•")[0]
      .split("|")[0]
      .trim();

    value = value
      .replace(/\b\d+\+?\s*(benefit|benefits|applicants?)\b.*$/i, "")
      .replace(/\b(viewed|posted|reposted)\b.*$/i, "")
      .replace(/\b(remote|on-site|hybrid)\b.*$/i, "")
      .replace(/\b[A-Z][a-zA-Z.' -]+,\s?[A-Z]{2}\b.*$/i, "")
      .replace(/\bUnited States\b.*$/i, "")
      .trim();

    const parts = value
      .split(/\s{2,}|\n/)
      .map((part) => part.trim())
      .filter(Boolean);

    return parts[0] || value;
  }

  function isLikelyJobTitle(text) {
    if (!text || text.length > 120) {
      return false;
    }

    const normalized = text.toLowerCase();
    return [
      "engineer",
      "developer",
      "scientist",
      "analyst",
      "manager",
      "architect",
      "consultant",
      "specialist",
      "lead"
    ].some((token) => normalized.includes(token));
  }

  function looksLikeLocation(text) {
    if (!text) {
      return false;
    }

    return (
      text.includes("United States") ||
      text.includes("Remote") ||
      text.includes("On-site") ||
      /\b[A-Z]{2}\b/.test(text) ||
      /^[A-Za-z .'-]+,\s?[A-Z]{2}/.test(text)
    );
  }

  function isNoise(text) {
    const normalized = text.toLowerCase();
    return [
      "selected",
      "apply",
      "save",
      "people clicked",
      "responses managed",
      "how promoted jobs are ranked",
      "full-time",
      "contract",
      "easy apply",
      "under 10 applicants",
      "in my network",
      "job match summary"
    ].some((token) => normalized.includes(token));
  }

  function getDetailRoot() {
    return document.querySelector(
      [
        ".jobs-search__job-details--container",
        ".scaffold-layout__detail",
        ".job-view-layout",
        ".job-details-jobs-unified-top-card__container--two-pane",
        ".job-details-jobs-unified-top-card__container",
        ".jobs-unified-top-card"
      ].join(", ")
    );
  }

  function getCurrentJobId() {
    return window.location.href.match(/currentJobId=(\d+)/)?.[1] ?? "";
  }

  function findSelectedCard() {
    const currentJobId = getCurrentJobId();
    const byId = Array.from(
      document.querySelectorAll(
        [
          `[data-job-id="${currentJobId}"]`,
          `[data-occludable-job-id="${currentJobId}"]`,
          `a[href*="${currentJobId}"]`,
          ".jobs-search-results__list-item",
          ".job-card-container"
        ].join(", ")
      )
    ).find((element) => {
      const root =
        element.closest("li, .jobs-search-results__list-item, .job-card-container") || element;
      return (root.outerHTML || "").includes(currentJobId);
    });

    return (
      byId?.closest("li, .jobs-search-results__list-item, .job-card-container") ||
      document.querySelector(
        '.jobs-search-results__list-item--active, li[aria-current="true"], .jobs-search-results-list__list-item--active'
      )
    );
  }

  function extractFromCard(card) {
    if (!card) {
      return null;
    }

    return {
      title: textFrom(
        card.querySelector(
          ".job-card-list__title--link, .job-card-list__title, .artdeco-entity-lockup__title a, a[href*='/jobs/view/'], strong"
        )
      ),
      company: textFrom(
        card.querySelector(
          ".artdeco-entity-lockup__subtitle, .job-card-container__company-name, h4, .artdeco-entity-lockup__subtitle span"
        )
      ),
      location: normalizeLocation(
        textFrom(card.querySelector(".job-card-container__metadata-wrapper, .artdeco-entity-lockup__caption"))
      )
    };
  }

  function extractFromMainPanel() {
    const panel = getDetailRoot();

    if (!panel) {
      return null;
    }

    return {
      title: textFrom(
        panel.querySelector(
          ".job-details-jobs-unified-top-card__job-title, .t-24.job-details-jobs-unified-top-card__job-title, h1"
        )
      ),
      company: normalizeCompany(
        textFrom(
        panel.querySelector(
          ".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__primary-description a"
        )
        )
      ),
      location: normalizeLocation(
        textFrom(
          panel.querySelector(
            ".job-details-jobs-unified-top-card__primary-description-container, .jobs-unified-top-card__primary-description-container, .job-details-jobs-unified-top-card__primary-description"
          )
        )
      )
    };
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const value = textFrom(document.querySelector(selector));
      if (value) {
        return value;
      }
    }
    return "";
  }

function stripJobDescriptionNoise(text) {
  return cleanText(
    (text || "")
      .replace(/^show match details beta\s*[•·]?\s*/i, "")
      .replace(/^is this information helpful\?\s*/i, "")
      .replace(/^get personalized tips to stand out to hirers\s*/i, "")
      .replace(/^find jobs where you(?:'|’)re a top applicant and tailor your resume with the help of ai\.?\s*/i, "")
      .replace(/^reactivate premium:\s*\d+% off\s*/i, "")
      .replace(/^beta\s*[•·]?\s*/i, "")
  );
}

function stripJobDescriptionLabel(text) {
  const normalized = stripJobDescriptionNoise(text);
  const lower = normalized.toLowerCase();
  const aboutIndex = lower.indexOf("about the job");
  const fallbackMatch = normalized.match(
    /job description|responsibilities|what you'll do|minimum qualifications|preferred qualifications|qualifications/i
  );
  const sliced =
    aboutIndex >= 0
      ? normalized.slice(aboutIndex + "about the job".length)
      : fallbackMatch
        ? normalized.slice(fallbackMatch.index + fallbackMatch[0].length)
        : normalized;

  return cleanText(
    sliced
      .replace(/^[\s•·:;-]+/, "")
  );
}

  function extractGlobalDescriptionCandidates() {
    return Array.from(document.querySelectorAll("section, div, article"))
      .map((element) => ({
        text: textFrom(element),
        className: typeof element.className === "string" ? element.className : ""
      }))
      .filter(({ text }) => {
        return (
          text &&
          text.length > 120 &&
          /about the job|job description|responsibilities|qualifications|what you'll do|minimum qualifications|preferred qualifications/i.test(
            text
          )
        );
      })
      .sort((left, right) => right.text.length - left.text.length);
  }

  function extractGlobalDescriptionFallback() {
    const candidates = extractGlobalDescriptionCandidates();
    const aboutJobCandidates = candidates.filter(({ text }) => /about the job/i.test(text));
    const preferredCandidate =
      aboutJobCandidates.sort((left, right) => right.text.length - left.text.length)[0] ||
      candidates[0];
    const best = preferredCandidate?.text || "";
    return stripJobDescriptionLabel(best);
  }

  const fromPanel = extractFromMainPanel() || {};
  const fromCard = extractFromCard(findSelectedCard()) || {};
  const title = fromPanel.title || fromCard.title || firstText(["main h1", ".jobs-search__job-details--container h1"]);
  const company =
    fromPanel.company ||
    normalizeCompany(fromCard.company) ||
    normalizeCompany(
      firstText([
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name"
      ])
    );
  const location =
    fromPanel.location ||
    fromCard.location ||
    normalizeLocation(
      firstText([
        ".job-details-jobs-unified-top-card__primary-description-container",
        ".jobs-unified-top-card__primary-description-container"
      ])
    );
  const description = extractGlobalDescriptionFallback();
  const jobId = getCurrentJobId();

  return {
    id: jobId || `${company}`.toLowerCase().replace(/\s+/g, "-"),
    title: "",
    company: isNoise(company) ? "" : company,
    location,
    description,
    url: window.location.href,
    capturedAt: new Date().toISOString()
  };
}

const ui = {
  heroTitle: document.getElementById("heroTitle"),
  heroCopy: document.getElementById("heroCopy"),
  accountAnchor: document.querySelector(".account-anchor"),
  accountButton: document.getElementById("accountButton"),
  accountAvatar: document.getElementById("accountAvatar"),
  accountStatusDot: document.getElementById("accountStatusDot"),
  accountMenu: document.getElementById("accountMenu"),
  accountMenuLabel: document.getElementById("accountMenuLabel"),
  menuOpenAccountButton: document.getElementById("menuOpenAccountButton"),
  menuAuthButton: document.getElementById("menuAuthButton"),
  menuResumeButton: document.getElementById("menuResumeButton"),
  menuSignOutButton: document.getElementById("menuSignOutButton"),
  authBadge: document.getElementById("authBadge"),
  authStatus: document.getElementById("authStatus"),
  authStack: document.getElementById("authStack"),
  authEmailInput: document.getElementById("authEmailInput"),
  authPasswordInput: document.getElementById("authPasswordInput"),
  signUpButton: document.getElementById("signUpButton"),
  signInButton: document.getElementById("signInButton"),
  signOutButton: document.getElementById("signOutButton"),
  profileSummary: document.getElementById("profileSummary"),
  profileMeta: document.getElementById("profileMeta"),
  resumeFileName: document.getElementById("resumeFileName"),
  resumeUploadedAt: document.getElementById("resumeUploadedAt"),
  openAccountResumeButton: document.getElementById("openAccountResumeButton"),
  resumeInput: document.getElementById("resumeInput"),
  resumeKeywords: document.getElementById("resumeKeywords"),
  resumeSkills: document.getElementById("resumeSkills"),
  resumePreview: document.getElementById("resumePreview"),
  refreshButton: document.getElementById("refreshButton"),
  jobMeta: document.getElementById("jobMeta"),
  jobDescriptionHint: document.getElementById("jobDescriptionHint"),
  jobPreview: document.getElementById("jobPreview"),
  matchScore: document.getElementById("matchScore"),
  requirementsList: document.getElementById("requirementsList"),
  skillGapList: document.getElementById("skillGapList"),
  learningPathList: document.getElementById("learningPathList"),
  languageSummary: document.getElementById("languageSummary"),
  greenFlags: document.getElementById("greenFlags"),
  redFlags: document.getElementById("redFlags"),
  favoriteCompanyButton: document.getElementById("favoriteCompanyButton"),
  favoriteCountBadge: document.getElementById("favoriteCountBadge"),
  favoriteCompaniesHint: document.getElementById("favoriteCompaniesHint"),
  favoriteCompaniesWorkspace: document.getElementById("favoriteCompaniesWorkspace"),
  favoriteCompaniesList: document.getElementById("favoriteCompaniesList"),
  favoriteCompanyDetail: document.getElementById("favoriteCompanyDetail"),
  removeFavoriteCompanyButton: document.getElementById("removeFavoriteCompanyButton"),
  closeFavoriteModalButton: document.getElementById("closeFavoriteModalButton"),
  favoriteModalTitle: document.getElementById("favoriteModalTitle"),
  favoriteDetailRating: document.getElementById("favoriteDetailRating"),
  favoriteDetailCareer: document.getElementById("favoriteDetailCareer"),
  favoriteDetailComp: document.getElementById("favoriteDetailComp"),
  favoriteDetailWlb: document.getElementById("favoriteDetailWlb"),
  favoriteDetailMeta: document.getElementById("favoriteDetailMeta"),
  favoriteDetailPros: document.getElementById("favoriteDetailPros"),
  favoriteDetailCons: document.getElementById("favoriteDetailCons"),
  coverageBadge: document.getElementById("coverageBadge"),
  wlbValue: document.getElementById("wlbValue"),
  companySize: document.getElementById("companySize"),
  industry: document.getElementById("industry"),
  salaryHint: document.getElementById("salaryHint"),
  companyPros: document.getElementById("companyPros"),
  companyCons: document.getElementById("companyCons")
};

const runtimeState = {
  clerkUser: null,
  clerkSession: null,
  authError: "",
  authSnapshot: null,
  accountTabSyncStatus: "idle",
  currentView: new URLSearchParams(window.location.search).get("view") === "account" ? "account" : "popup",
  profileRefreshTimer: null,
  isUploadingResume: false,
  currentCompany: null,
  favoriteCompanies: [],
  selectedFavoriteCompany: null
};

function getAuthSnapshotMs(snapshot) {
  const timestamp = snapshot?.syncedAt ? Date.parse(snapshot.syncedAt) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDebugDate(value) {
  if (!value) {
    return "--";
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString();
}

async function loadAccountTabSyncState() {
  if (!ACCOUNT_APP_URL.trim()) {
    return { authSnapshot: null, profileState: null, status: "account-url-missing" };
  }

  const accountOrigin = new URL(ACCOUNT_APP_URL).origin;
  const tabs = await chrome.tabs.query({});
  const accountTabs = tabs.filter((tab) => {
    try {
      return tab.url && new URL(tab.url).origin === accountOrigin;
    } catch {
      return false;
    }
  });
  const accountTab = accountTabs.find((tab) => tab.active) ?? accountTabs[0] ?? null;

  if (!accountTab?.id) {
    return { authSnapshot: null, profileState: null, status: "account-tab-not-found" };
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: accountTab.id },
    func: () => {
      try {
        return {
          authSnapshot: JSON.parse(window.localStorage.getItem("workwise.accountAuthState") || "null"),
          profileState: JSON.parse(window.localStorage.getItem("workwise.accountProfileState") || "null")
        };
      } catch {
        return {
          authSnapshot: null,
          profileState: null
        };
      }
    }
  });

  return {
    ...(results?.[0]?.result ?? { authSnapshot: null, profileState: null }),
    status: "ok"
  };
}

async function hydrateFromAccountTab() {
  const accountTabState = await loadAccountTabSyncState().catch((error) => ({
    authSnapshot: null,
    profileState: null,
    status: error?.message || "account-tab-read-failed"
  }));
  if (!accountTabState) {
    return;
  }

  runtimeState.accountTabSyncStatus = accountTabState.status ?? "unknown";

  if (accountTabState.authSnapshot) {
    const latestAuthSnapshot = pickLatestAuthSnapshot(runtimeState.authSnapshot, accountTabState.authSnapshot);
    if (latestAuthSnapshot !== runtimeState.authSnapshot) {
      runtimeState.authSnapshot = latestAuthSnapshot;
      await saveAuthSnapshot(latestAuthSnapshot);
    }
  }

  const accountProfile = normalizeProfile(accountTabState.profileState?.profile ?? null);
  if (accountProfile) {
    const localProfile = normalizeProfile(await loadProfile());
    const latestProfile = pickLatestProfile(localProfile, accountProfile);
    if (latestProfile && latestProfile !== localProfile) {
      await saveProfile(latestProfile);
      await saveUserScopedProfile(latestProfile);
    }
  }
}

function pickLatestAuthSnapshot(firstSnapshot, secondSnapshot) {
  if (!firstSnapshot) {
    return secondSnapshot ?? null;
  }

  if (!secondSnapshot) {
    return firstSnapshot;
  }

  return getAuthSnapshotMs(secondSnapshot) > getAuthSnapshotMs(firstSnapshot)
    ? secondSnapshot
    : firstSnapshot;
}

function isAccountView() {
  return runtimeState.currentView === "account";
}

function isSignedIn() {
  return Boolean(runtimeState.clerkSession || runtimeState.authSnapshot?.signedIn);
}

function getAccountPageUrl(hash = "") {
  if (ACCOUNT_APP_URL.trim()) {
    const url = new URL(ACCOUNT_APP_URL);
    if (hash) {
      url.hash = hash.replace(/^#/, "");
    }
    return url.toString();
  }

  const url = new URL(chrome.runtime.getURL("src/panel/panel.html"));
  url.searchParams.set("view", "account");
  if (hash) {
    url.hash = hash;
  }
  return url.toString();
}

async function openAccountPage(hash = "") {
  await chrome.tabs.create({ url: getAccountPageUrl(hash) });
}

function closeAccountMenu() {
  ui.accountMenu.hidden = true;
  ui.accountButton.setAttribute("aria-expanded", "false");
}

function openAccountMenu() {
  ui.accountMenu.hidden = false;
  ui.accountButton.setAttribute("aria-expanded", "true");
}

function toggleAccountMenu() {
  if (ui.accountMenu.hidden) {
    openAccountMenu();
    return;
  }

  closeAccountMenu();
}

function scrollToProfileCard() {
  ui.authStack?.closest(".card")?.scrollIntoView({ behavior: "auto", block: "start" });
}

function updateViewMode() {
  const body = document.body;
  body.classList.toggle("account-view", isAccountView());
  body.classList.toggle("popup-view", !isAccountView());

  ui.heroTitle.textContent = isAccountView()
    ? "Manage your WorkWise account and resume."
    : "LinkedIn job fit, without tab switching.";
  ui.heroCopy.textContent = isAccountView()
    ? "Sign in once, keep the session across job posts, and update the latest resume that WorkWise reuses in every JD."
    : "Open a LinkedIn job, keep your session signed in, and reuse the same resume across every job post.";
}

function getAvatarLabel(email) {
  const normalized = (email || "").trim();
  return normalized ? normalized[0].toUpperCase() : "G";
}

function getActiveUserStorageKey() {
  return getActiveUserStorageKeys()[0] ?? "";
}

function getActiveUserStorageKeys() {
  return [...new Set([
    runtimeState.clerkUser?.id,
    getClerkEmail(runtimeState.clerkUser)?.trim().toLowerCase(),
    runtimeState.authSnapshot?.email?.trim().toLowerCase()
  ].filter(Boolean))];
}

function attachFavoriteCompaniesToProfile(profile, favoriteCompanies = runtimeState.favoriteCompanies) {
  const normalizedProfile = normalizeProfile(profile);
  if (!normalizedProfile) {
    return null;
  }

  return {
    ...normalizedProfile,
    favoriteCompanies: Array.isArray(favoriteCompanies) ? favoriteCompanies : []
  };
}

function getProfileFavoriteCompanies(profile) {
  return Array.isArray(profile?.favoriteCompanies) ? profile.favoriteCompanies : [];
}

async function loadUserScopedArchive() {
  const userKeys = getActiveUserStorageKeys();
  if (!userKeys.length) {
    return { profile: null, favoriteCompanies: [] };
  }

  const archives = await Promise.all(
    userKeys.map(async (userKey) => ({
      profile: await loadUserProfile(userKey),
      favoriteCompanies: await loadUserFavoriteCompanies(userKey)
    }))
  );

  let resolvedProfile = null;
  let resolvedFavorites = [];

  archives.forEach(({ profile, favoriteCompanies }) => {
    resolvedProfile = pickLatestProfile(resolvedProfile, profile);
    if (!resolvedFavorites.length && favoriteCompanies?.length) {
      resolvedFavorites = favoriteCompanies;
    }
  });

  const profileFavorites = getProfileFavoriteCompanies(resolvedProfile);
  if (profileFavorites.length) {
    resolvedFavorites = profileFavorites;
  }

  return {
    profile: resolvedProfile,
    favoriteCompanies: resolvedFavorites
  };
}

async function saveUserScopedProfile(profile) {
  const archiveProfile = attachFavoriteCompaniesToProfile(profile);
  const userKeys = getActiveUserStorageKeys();
  if (!archiveProfile || !userKeys.length) {
    return;
  }

  await Promise.all(userKeys.map((userKey) => saveUserProfile(userKey, archiveProfile)));
}

async function saveUserScopedFavoriteCompanies(favoriteCompanies) {
  const userKeys = getActiveUserStorageKeys();
  if (!userKeys.length) {
    return;
  }

  await Promise.all(userKeys.map((userKey) => saveUserFavoriteCompanies(userKey, favoriteCompanies)));

  const activeProfile = normalizeProfile(await loadProfile());
  if (!activeProfile) {
    return;
  }

  await saveUserScopedProfile(activeProfile);

  if (runtimeState.clerkSession) {
    syncProfileToSupabase(activeProfile).catch(() => {});
  }
}

function createTag(label, className = "chip") {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = label;
  return element;
}

function createCommentCard(label, tone = "neutral") {
  const element = document.createElement("article");
  element.className = `comment-card ${tone}`;
  element.textContent = label;
  return element;
}

function toMetricDisplay(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function buildFavoriteCompany(company = {}) {
  const name = (company.name || "").trim();
  if (!name) {
    return null;
  }

  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name,
    totalRating: toMetricDisplay(company.workLifeBalance),
    careerOpportunities: toMetricDisplay(company.companySize),
    compensationAndBenefits: toMetricDisplay(company.industry),
    workLifeBalance: toMetricDisplay(company.salaryHint),
    pros: Array.isArray(company.pros) ? company.pros.slice(0, 3) : [],
    cons: Array.isArray(company.cons) ? company.cons.slice(0, 3) : [],
    allPros: Array.isArray(company.allPros) ? company.allPros : (Array.isArray(company.pros) ? company.pros : []),
    allCons: Array.isArray(company.allCons) ? company.allCons : (Array.isArray(company.cons) ? company.cons : []),
    source: company.source || "unknown",
    savedAt: company.savedAt || new Date().toISOString()
  };
}

function getCompanyInitials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "CO";
}

function updateFavoriteButton() {
  const favorite = buildFavoriteCompany(runtimeState.currentCompany);
  const isFavorited = favorite
    ? runtimeState.favoriteCompanies.some((item) => item.id === favorite.id)
    : false;

  ui.favoriteCompanyButton.disabled = !favorite;
  ui.favoriteCompanyButton.textContent = isFavorited ? "Favorited" : "Favorite";
  ui.favoriteCompanyButton.classList.toggle("is-favorited", isFavorited);
}

function openFavoriteCompanyModal(company) {
  runtimeState.selectedFavoriteCompany = company;
  ui.favoriteModalTitle.textContent = company.name;
  ui.favoriteDetailMeta.textContent = `Saved ${new Date(company.savedAt).toLocaleString()}. Source: ${company.source}.`;
  renderList(ui.favoriteDetailPros, company.allPros ?? company.pros, (item) => createCommentCard(item, "positive"));
  renderList(ui.favoriteDetailCons, company.allCons ?? company.cons, (item) => createCommentCard(item, "negative"));
  ui.favoriteCompanyDetail.hidden = false;
  ui.favoriteCompaniesWorkspace.classList.add("has-selection");
  renderFavoriteCompanies();
}

function closeFavoriteCompanyModal() {
  runtimeState.selectedFavoriteCompany = null;
  ui.favoriteCompanyDetail.hidden = true;
  ui.favoriteCompaniesWorkspace.classList.remove("has-selection");
  renderFavoriteCompanies();
}

async function removeFavoriteCompany(companyId = runtimeState.selectedFavoriteCompany?.id) {
  if (!companyId) {
    return;
  }

  const nextFavorites = runtimeState.favoriteCompanies.filter((item) => item.id !== companyId);
  runtimeState.favoriteCompanies = nextFavorites;
  await saveFavoriteCompanies(nextFavorites);
  await saveUserScopedFavoriteCompanies(nextFavorites);

  if (runtimeState.selectedFavoriteCompany?.id === companyId) {
    closeFavoriteCompanyModal();
  } else {
    renderFavoriteCompanies();
  }

  updateFavoriteButton();
}

function renderFavoriteCompanies() {
  const favorites = runtimeState.favoriteCompanies;
  ui.favoriteCountBadge.textContent = `${favorites.length} saved`;
  ui.favoriteCompaniesHint.textContent = favorites.length
    ? "Open a card to see company ratings and comments."
    : "Favorite a company from the extension to see it here.";

  ui.favoriteCompaniesList.innerHTML = "";
  if (!favorites.length) {
    ui.favoriteCompaniesList.appendChild(createTag("No favorite companies yet.", "chip"));
    return;
  }

  favorites.forEach((company) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "favorite-card";
    card.classList.toggle("is-selected", runtimeState.selectedFavoriteCompany?.id === company.id);

    const head = document.createElement("div");
    head.className = "favorite-card-head";

    const logo = document.createElement("div");
    logo.className = "favorite-card-logo";
    logo.textContent = getCompanyInitials(company.name);

    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "favorite-card-title";
    title.textContent = company.name;

    const meta = document.createElement("p");
    meta.className = "favorite-card-meta";
    meta.textContent = `Saved ${new Date(company.savedAt).toLocaleDateString()}`;

    const subtitle = document.createElement("p");
    subtitle.className = "favorite-card-subtitle";
    subtitle.textContent = `Source: ${company.source}`;

    const stats = document.createElement("div");
    stats.className = "favorite-card-stats";

    [
      ["Total Rating", company.totalRating],
      ["Career Opps", company.careerOpportunities],
      ["Comp & Benefits", company.compensationAndBenefits],
      ["WLB", company.workLifeBalance]
    ].forEach(([label, value]) => {
      const stat = document.createElement("div");
      stat.className = "favorite-stat";

      const statLabel = document.createElement("span");
      statLabel.className = "favorite-stat-label";
      statLabel.textContent = label;

      const statValue = document.createElement("span");
      statValue.className = "favorite-stat-value";
      statValue.textContent = value;

      stat.appendChild(statLabel);
      stat.appendChild(statValue);
      stats.appendChild(stat);
    });

    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    titleWrap.appendChild(subtitle);
    head.appendChild(logo);
    head.appendChild(titleWrap);
    card.appendChild(head);
    card.appendChild(stats);
    card.addEventListener("click", () => openFavoriteCompanyModal(company));
    ui.favoriteCompaniesList.appendChild(card);
  });
}

async function toggleFavoriteCompany() {
  const favorite = buildFavoriteCompany(runtimeState.currentCompany);
  if (!favorite) {
    return;
  }

  const nextFavorites = runtimeState.favoriteCompanies.some((item) => item.id === favorite.id)
    ? runtimeState.favoriteCompanies.filter((item) => item.id !== favorite.id)
    : [favorite, ...runtimeState.favoriteCompanies.filter((item) => item.id !== favorite.id)];

  runtimeState.favoriteCompanies = nextFavorites;
  await saveFavoriteCompanies(nextFavorites);
  await saveUserScopedFavoriteCompanies(nextFavorites);
  renderFavoriteCompanies();
  updateFavoriteButton();
}

function createLearningResourceCard(item) {
  const link = document.createElement("a");
  link.className = "resource-card";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noreferrer noopener";

  const title = document.createElement("span");
  title.className = "resource-title";
  title.textContent = `${item.skill}: ${item.title}`;

  const meta = document.createElement("span");
  meta.className = "resource-meta";
  meta.textContent = item.provider;

  const coursera = document.createElement("a");
  coursera.className = "resource-sub-link";
  coursera.href = item.courseraUrl;
  coursera.target = "_blank";
  coursera.rel = "noreferrer noopener";
  coursera.textContent = "Search on Coursera";
  coursera.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  link.appendChild(title);
  link.appendChild(meta);
  link.appendChild(coursera);
  return link;
}

function normalizeDisplayTitle(rawTitle) {
  const text = (rawTitle || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  const match = text.match(
    /[A-Z][A-Za-z0-9/&(),.+\- ]*(Engineer|Developer|Scientist|Analyst|Manager|Architect|Consultant|Specialist|Lead)/i
  );

  return match ? match[0].trim() : text.split("•")[0].trim();
}

function normalizeDisplayCompany(rawCompany) {
  const text = (rawCompany || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  return text
    .split("•")[0]
    .split("|")[0]
    .replace(/\b(reposted|posted|viewed)\b.*$/i, "")
    .replace(/\b(remote|on-site|hybrid)\b.*$/i, "")
    .replace(/\bOver \d+ applicants?\b.*$/i, "")
    .replace(/\b\d+\+?\s*(benefit|benefits|applicants?)\b.*$/i, "")
    .trim();
}

function stripCompanyPrefixFromTitle(title, company) {
  const normalizedTitle = (title || "").replace(/\s+/g, " ").trim();
  const normalizedCompany = (company || "").replace(/\s+/g, " ").trim();

  if (!normalizedTitle || !normalizedCompany) {
    return normalizedTitle;
  }

  if (normalizedTitle.toLowerCase().startsWith(`${normalizedCompany.toLowerCase()} `)) {
    return normalizedTitle.slice(normalizedCompany.length).trim();
  }

  return normalizedTitle;
}

const SUPPORTED_RESUME_EXTENSIONS = new Set(["txt", "docx"]);

function getFileExtension(fileName = "") {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function normalizeExtractedText(text) {
  return (text || "")
    .replace(/\u0000/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}

function ensureExtractedText(text, fileName) {
  const normalized = normalizeExtractedText(text);
  if (normalized.length < 20) {
    throw new Error(`Could not read enough text from ${fileName}. Try a text-based TXT or DOCX file.`);
  }

  return normalized;
}

function toHexBytes(hex) {
  const normalized = hex.replace(/\s+/g, "");
  if (!normalized) {
    return new Uint8Array();
  }

  const padded = normalized.length % 2 === 0 ? normalized : `${normalized}0`;
  const bytes = new Uint8Array(padded.length / 2);
  for (let index = 0; index < padded.length; index += 2) {
    bytes[index / 2] = Number.parseInt(padded.slice(index, index + 2), 16);
  }

  return bytes;
}

function decodeUtf16Bytes(bytes, littleEndian = false) {
  if (!bytes.length || bytes.length % 2 !== 0) {
    return "";
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const codeUnits = new Uint16Array(bytes.length / 2);
  for (let index = 0; index < codeUnits.length; index += 1) {
    codeUnits[index] = view.getUint16(index * 2, littleEndian);
  }

  return String.fromCharCode(...codeUnits);
}

function scoreDecodedText(text) {
  const normalized = normalizeExtractedText(text);
  const readableChars = (normalized.match(/[A-Za-z0-9][A-Za-z0-9 ,./:+()\-]/g) || []).length;
  return normalized.length + readableChars * 2;
}

function pickBestDecodedText(candidates) {
  return candidates
    .map((text) => normalizeExtractedText(text))
    .filter(Boolean)
    .sort((left, right) => scoreDecodedText(right) - scoreDecodedText(left))[0] ?? "";
}

async function inflateDeflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const inflated = await new Response(stream).arrayBuffer();
  return new Uint8Array(inflated);
}

async function tryInflateDeflateRaw(bytes) {
  try {
    return await inflateDeflateRaw(bytes);
  } catch {
    return null;
  }
}

function findZipEndOfCentralDirectory(bytes) {
  const minOffset = Math.max(0, bytes.length - 22 - 65535);
  for (let index = bytes.length - 22; index >= minOffset; index -= 1) {
    if (
      bytes[index] === 0x50 &&
      bytes[index + 1] === 0x4b &&
      bytes[index + 2] === 0x05 &&
      bytes[index + 3] === 0x06
    ) {
      return index;
    }
  }

  return -1;
}

function decodeZipString(bytes, useUtf8) {
  return new TextDecoder(useUtf8 ? "utf-8" : "latin1").decode(bytes);
}

async function readZipEntry(arrayBuffer, targetPath) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocdOffset = findZipEndOfCentralDirectory(bytes);

  if (eocdOffset === -1) {
    throw new Error("ZIP container is invalid.");
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("ZIP central directory is corrupted.");
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const entryPath = decodeZipString(bytes.slice(fileNameStart, fileNameEnd), Boolean(flags & 0x0800));

    if (entryPath === targetPath) {
      if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
        throw new Error("ZIP local header is corrupted.");
      }

      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressedData = bytes.slice(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        return compressedData;
      }

      if (compressionMethod === 8) {
        return inflateDeflateRaw(compressedData);
      }

      throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
    }

    cursor = fileNameEnd + extraLength + commentLength;
  }

  return null;
}

function listZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const eocdOffset = findZipEndOfCentralDirectory(bytes);

  if (eocdOffset === -1) {
    throw new Error("ZIP container is invalid.");
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries = [];
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("ZIP central directory is corrupted.");
    }

    const flags = view.getUint16(cursor + 8, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const fileNameStart = cursor + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const entryPath = decodeZipString(bytes.slice(fileNameStart, fileNameEnd), Boolean(flags & 0x0800));

    entries.push(entryPath);
    cursor = fileNameEnd + extraLength + commentLength;
  }

  return entries;
}

function extractDocxTextFromXml(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  const parts = [];

  function walk(node) {
    if (!node || node.nodeType !== 1) {
      return;
    }

    if (node.localName === "t") {
      parts.push(node.textContent ?? "");
      return;
    }

    if (node.localName === "tab") {
      parts.push("\t");
      return;
    }

    if (node.localName === "br" || node.localName === "cr") {
      parts.push("\n");
      return;
    }

    Array.from(node.childNodes).forEach(walk);

    if (node.localName === "p") {
      parts.push("\n");
    }
  }

  walk(xml.documentElement);
  return parts.join("");
}

async function readDocxFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const entries = listZipEntries(arrayBuffer);
  const preferredEntries = entries.filter((entryPath) =>
    /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(entryPath)
  );

  if (!preferredEntries.includes("word/document.xml")) {
    throw new Error("DOCX content was not found.");
  }

  const extractedSections = [];
  for (const entryPath of preferredEntries) {
    const xmlBytes = await readZipEntry(arrayBuffer, entryPath);
    if (!xmlBytes) {
      continue;
    }

    const xmlText = new TextDecoder("utf-8").decode(xmlBytes);
    const extractedText = extractDocxTextFromXml(xmlText);
    if (normalizeExtractedText(extractedText)) {
      extractedSections.push(extractedText);
    }
  }

  return ensureExtractedText(extractedSections.join("\n\n"), file.name);
}

function extractPrintableRuns(text) {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line) => line.length >= 4 && /[A-Za-z]/.test(line));
}

function extractPrintablePdfFallback(text) {
  return extractPrintableRuns(text)
    .filter((line) => {
      const normalized = line.toLowerCase();
      return !(
        normalized.startsWith("%pdf") ||
        normalized === "obj" ||
        normalized === "endobj" ||
        normalized === "stream" ||
        normalized === "endstream" ||
        normalized === "xref" ||
        normalized === "trailer" ||
        normalized === "startxref" ||
        /^<<.*>>$/.test(normalized) ||
        /^\/[a-z0-9]+/.test(normalized)
      );
    })
    .join("\n");
}

async function readDocFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const utf16Text = new TextDecoder("utf-16le", { fatal: false }).decode(bytes);
  const ansiText = new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
  const candidates = [utf16Text, ansiText]
    .map((text) => extractPrintableRuns(text).join("\n"))
    .sort((left, right) => right.length - left.length);

  return ensureExtractedText(candidates[0], file.name);
}

function decodePdfEscapeSequence(sequence) {
  return sequence.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (match, token) => {
    if (token === "n") {
      return "\n";
    }

    if (token === "r") {
      return "\r";
    }

    if (token === "t") {
      return "\t";
    }

    if (token === "b") {
      return "\b";
    }

    if (token === "f") {
      return "\f";
    }

    if (token === "(" || token === ")" || token === "\\") {
      return token;
    }

    if (/^[0-7]{1,3}$/.test(token)) {
      return String.fromCharCode(Number.parseInt(token, 8));
    }

    return match;
  });
}

function decodePdfHexString(hex) {
  const bytes = toHexBytes(hex);
  if (!bytes.length) {
    return "";
  }

  const utf8Bom =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const utf16BeBom = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
  const utf16LeBom = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;

  if (utf8Bom) {
    return normalizeExtractedText(new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(3)));
  }

  if (utf16BeBom) {
    return normalizeExtractedText(decodeUtf16Bytes(bytes.slice(2), false));
  }

  if (utf16LeBom) {
    return normalizeExtractedText(decodeUtf16Bytes(bytes.slice(2), true));
  }

  const utf16Be = decodeUtf16Bytes(bytes, false);
  const utf16Le = decodeUtf16Bytes(bytes, true);
  const latin1 = new TextDecoder("latin1").decode(bytes);
  return pickBestDecodedText([utf16Be, utf16Le, latin1]);
}

function extractPdfStringsFromBlock(block) {
  const strings = [];
  let index = 0;

  while (index < block.length) {
    const char = block[index];

    if (char === "(") {
      let depth = 1;
      let cursor = index + 1;
      let buffer = "";

      while (cursor < block.length && depth > 0) {
        const current = block[cursor];

        if (current === "\\" && cursor + 1 < block.length) {
          buffer += current + block[cursor + 1];
          cursor += 2;
          continue;
        }

        if (current === "(") {
          depth += 1;
          buffer += current;
          cursor += 1;
          continue;
        }

        if (current === ")") {
          depth -= 1;
          if (depth > 0) {
            buffer += current;
          }
          cursor += 1;
          continue;
        }

        buffer += current;
        cursor += 1;
      }

      strings.push(decodePdfEscapeSequence(buffer));
      index = cursor;
      continue;
    }

    if (char === "<" && block[index + 1] !== "<") {
      const end = block.indexOf(">", index + 1);
      if (end !== -1) {
        strings.push(decodePdfHexString(block.slice(index + 1, end)));
        index = end + 1;
        continue;
      }
    }

    index += 1;
  }

  return strings;
}

async function decodePdfStream(streamBytes, dictionary) {
  if (/\/FlateDecode/.test(dictionary)) {
    return tryInflateDeflateRaw(streamBytes);
  }

  if (/\/(ASCII85Decode|ASCIIHexDecode|LZWDecode|DCTDecode|JPXDecode)/.test(dictionary)) {
    return null;
  }

  return streamBytes;
}

function renderList(container, items, mapFn) {
  container.innerHTML = "";
  if (!items?.length) {
    container.appendChild(createTag("No data yet", "chip"));
    return;
  }

  items.forEach((item) => container.appendChild(mapFn(item)));
}

function getAuthCredentials() {
  return {
    email: ui.authEmailInput.value.trim(),
    password: ui.authPasswordInput.value
  };
}

async function persistNormalizedProfile(profile, { syncRemote = false } = {}) {
  const normalizedProfile = normalizeProfile(profile);
  if (!normalizedProfile) {
    return null;
  }

  await saveProfile(normalizedProfile);
  if (syncRemote) {
    const syncedProfile = normalizeProfile(await syncProfileToSupabase(normalizedProfile));
    if (syncedProfile) {
      const resolvedProfile = pickLatestProfile(normalizedProfile, syncedProfile);
      await saveProfile(resolvedProfile);
      return resolvedProfile;
    }
  }

  return normalizedProfile;
}

function getProfileUploadedAtMs(profile) {
  const value = profile?.resume?.uploadedAt;
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function pickLatestProfile(localProfile, remoteProfile) {
  const normalizedLocal = normalizeProfile(localProfile);
  const normalizedRemote = normalizeProfile(remoteProfile);

  if (!normalizedLocal) {
    return normalizedRemote;
  }

  if (!normalizedRemote) {
    return normalizedLocal;
  }

  return getProfileUploadedAtMs(normalizedRemote) > getProfileUploadedAtMs(normalizedLocal)
    ? normalizedRemote
    : normalizedLocal;
}

async function reconcileProfiles(localProfile, remoteProfile) {
  const latestProfile = pickLatestProfile(localProfile, remoteProfile);
  if (!latestProfile) {
    return null;
  }

  const latestUploadedAt = getProfileUploadedAtMs(latestProfile);
  const localUploadedAt = getProfileUploadedAtMs(localProfile);
  const remoteUploadedAt = getProfileUploadedAtMs(remoteProfile);

  if (latestUploadedAt !== localUploadedAt) {
    await saveProfile(latestProfile);
  }

  if (runtimeState.clerkSession && latestUploadedAt !== remoteUploadedAt) {
    await syncProfileToSupabase(latestProfile);
  }

  return latestProfile;
}

async function refreshResolvedProfile({ reanalyze = true } = {}) {
  if (!isSignedIn()) {
    renderProfile(null);
    renderAnalysis(null);
    return null;
  }

  const localProfile = normalizeProfile(await loadProfile());
  let resolvedProfile = localProfile;

  if (runtimeState.clerkSession) {
    const remoteProfile = await hydrateProfileFromSupabase().catch(() => null);
    resolvedProfile = await reconcileProfiles(localProfile, remoteProfile);
    if (resolvedProfile) {
      await saveUserScopedProfile(resolvedProfile);
    }
  } else if (!resolvedProfile) {
    const remoteProfile = await hydrateProfileFromSupabase().catch(() => null);
    resolvedProfile = normalizeProfile(remoteProfile);
    if (resolvedProfile) {
      await saveProfile(resolvedProfile);
    }
  }

  renderProfile(resolvedProfile);

  if (reanalyze && resolvedProfile?.parsedResume) {
    const currentAnalysis = await loadCurrentAnalysis();
    if (analysisNeedsRefresh(currentAnalysis, resolvedProfile)) {
      await recomputeAnalysisForProfile(resolvedProfile, currentAnalysis?.job ?? null);
    }
  }

  return resolvedProfile;
}

function scheduleProfileRefresh() {
  if (runtimeState.isUploadingResume) {
    return;
  }

  if (runtimeState.profileRefreshTimer) {
    window.clearTimeout(runtimeState.profileRefreshTimer);
  }

  runtimeState.profileRefreshTimer = window.setTimeout(() => {
    refreshAuthAndProfile({ reanalyze: true }).catch(() => {});
  }, 250);
}

async function refreshAuthAndProfile({ reanalyze = true } = {}) {
  try {
    await hydrateFromAccountTab();
    const authState = await getClerkAuthState();
    runtimeState.authError = "";
    setRuntimeAuthState(authState);
    if (runtimeState.clerkSession) {
      await saveAuthSnapshot(runtimeState.authSnapshot);
    }
  } catch (error) {
    runtimeState.authError = error?.message || "Clerk failed to initialize.";
  }

  renderAuthState();
  return refreshResolvedProfile({ reanalyze });
}

function setRuntimeAuthState(authState) {
  runtimeState.clerkUser = authState?.user ?? null;
  runtimeState.clerkSession = authState?.session ?? null;
  const email = getClerkEmail(authState?.user) || runtimeState.authSnapshot?.email || "";

  if (authState?.session) {
    runtimeState.authSnapshot = pickLatestAuthSnapshot(runtimeState.authSnapshot, {
      email,
      signedIn: true,
      source: "extension-session",
      syncedAt: new Date().toISOString()
    });
    return;
  }

  if (authState?.user && runtimeState.authSnapshot?.signedIn) {
    runtimeState.authSnapshot = {
      email,
      signedIn: true,
      source: runtimeState.authSnapshot?.source ?? "extension-session",
      syncedAt: runtimeState.authSnapshot?.syncedAt ?? new Date().toISOString()
    };
  }
}

function applySavedAuthSnapshot(snapshot) {
  runtimeState.authSnapshot = snapshot ?? null;

  if (runtimeState.clerkSession || runtimeState.clerkUser || !snapshot) {
    return;
  }

  runtimeState.clerkUser = {
    emailAddress: snapshot.email
  };
}

function renderAuthState() {
  if (runtimeState.authError) {
    ui.authBadge.textContent = "Auth: setup error";
    ui.authStatus.textContent = runtimeState.authError;
    ui.accountMenuLabel.textContent = "Authentication unavailable";
    ui.accountStatusDot.classList.remove("is-signed-in");
    ui.authStack?.classList.remove("auth-signed-in");
    ui.refreshButton.disabled = true;
    return;
  }

  const configured = isSupabaseConfigured();
  const signedInEmail = getClerkEmail(runtimeState.clerkUser) || runtimeState.authSnapshot?.email || "";
  const signedIn = isSignedIn();
  const webLinked = !runtimeState.clerkSession && runtimeState.authSnapshot?.signedIn && runtimeState.authSnapshot?.source === "account-web";
  const hasCachedEmail = !signedIn && Boolean(signedInEmail);
  ui.authStack?.classList.toggle("auth-signed-in", signedIn);
  ui.signOutButton.hidden = !runtimeState.clerkSession;
  ui.accountAvatar.textContent = getAvatarLabel(signedInEmail);
  ui.accountStatusDot.classList.toggle("is-signed-in", signedIn);
  ui.refreshButton.disabled = !signedIn;
  ui.accountMenuLabel.textContent = signedIn
    ? `Signed in as ${signedInEmail}`
    : "Not signed in";
  ui.menuAuthButton.textContent = "Log in / Sign up";
  ui.menuOpenAccountButton.hidden = !signedIn || isAccountView();
  ui.menuAuthButton.hidden = signedIn;
  ui.menuResumeButton.hidden = true;
  ui.menuSignOutButton.hidden = !runtimeState.clerkSession;

  if (runtimeState.clerkSession && signedInEmail) {
    ui.authBadge.textContent = "Auth: Clerk connected";
    ui.authStatus.textContent = `Signed in as ${signedInEmail}. Switching to the next JD will keep this login and restore the latest uploaded resume + keywords.`;
  } else if (webLinked && signedInEmail) {
    ui.authBadge.textContent = "Auth: account page connected";
    ui.authStatus.textContent = `Signed in on the WorkWise account page as ${signedInEmail}. Resume sync is available, but popup-only actions still require an extension session.`;
  } else if (hasCachedEmail) {
    ui.authBadge.textContent = "Auth: session expired";
    ui.authStatus.textContent = `Saved account ${signedInEmail} was found, but this popup is not currently signed in. Log in here again to pull the latest resume from your web account.`;
  } else if (configured) {
    ui.authBadge.textContent = "Auth: Clerk ready";
    ui.authStatus.textContent = "Log in with Clerk to sync your resume profile via Supabase.";
  } else {
    ui.authBadge.textContent = "Auth: config missing";
    ui.authStatus.textContent = "Clerk or Supabase configuration is missing.";
  }
}

function renderProfile(profile) {
  if (!isSignedIn()) {
    ui.profileSummary.textContent = "Log in to load your synced resume.";
    ui.resumeFileName.textContent = "Latest resume: none";
    ui.resumeUploadedAt.textContent = "Uploaded at: --";
    ui.resumePreview.textContent = "Resume data is hidden until you sign in.";
    renderList(ui.resumeKeywords, [], () => createTag(""));
    renderList(ui.resumeSkills, [], () => createTag(""));
    return;
  }

  const normalizedProfile = normalizeProfile(profile);
  if (!normalizedProfile?.parsedResume) {
    ui.profileSummary.textContent = isAccountView()
      ? "No resume uploaded yet."
      : "No resume uploaded yet. Sign in on the account page and upload a resume there.";
    ui.resumeFileName.textContent = "Latest resume: none";
    ui.resumeUploadedAt.textContent = "Uploaded at: --";
    ui.resumePreview.textContent = "No extracted resume text yet.";
    renderList(ui.resumeKeywords, [], () => createTag(""));
    renderList(ui.resumeSkills, [], () => createTag(""));
    return;
  }

  const uploadedAt = normalizedProfile.resume?.uploadedAt
    ? new Date(normalizedProfile.resume.uploadedAt).toLocaleString()
    : "--";
  const fileName = normalizedProfile.resume?.fileName || "Unknown file";
  const keywords = normalizedProfile.parsedResume.skills ?? [];

  ui.profileSummary.textContent = `${normalizedProfile.parsedResume.experienceLevel} profile. ${keywords.length} parsed keywords restored for this account.`;
  ui.resumeFileName.textContent = `Latest resume: ${fileName}`;
  ui.resumeUploadedAt.textContent = `Uploaded at: ${uploadedAt}`;
  ui.resumePreview.textContent = normalizedProfile.parsedResume.preview || "No extracted resume text preview available.";
  renderList(ui.resumeKeywords, keywords, (skill) => createTag(skill));
  renderList(ui.resumeSkills, keywords, (skill) => createTag(skill));
}

function renderAnalysis(analysis) {
  if (!isSignedIn()) {
    runtimeState.currentCompany = null;
    ui.jobMeta.textContent = "Log in to unlock job fit analysis.";
    ui.jobDescriptionHint.textContent = "";
    ui.jobPreview.textContent = "Job analysis is hidden until you sign in.";
    ui.matchScore.textContent = "--";
    ui.languageSummary.textContent = "Language signals are hidden until you sign in.";
    ui.coverageBadge.textContent = "Sign in required";
    ui.wlbValue.textContent = "--";
    ui.companySize.textContent = "--";
    ui.industry.textContent = "--";
    ui.salaryHint.textContent = "--";
    renderList(ui.requirementsList, [], () => createTag(""));
    renderList(ui.skillGapList, [], () => createTag(""));
    renderList(ui.greenFlags, [], () => createTag(""));
    renderList(ui.redFlags, [], () => createTag(""));
    renderList(ui.companyPros, [], () => createTag(""));
    renderList(ui.companyCons, [], () => createTag(""));
    ui.learningPathList.innerHTML = "";
    ui.learningPathList.appendChild(createTag("Log in to get learning recommendations.", "chip"));
    updateFavoriteButton();
    return;
  }

  if (!analysis) {
    runtimeState.currentCompany = null;
    ui.jobMeta.textContent = "Open a LinkedIn job posting, then click refresh.";
    ui.jobDescriptionHint.textContent = "";
    ui.jobPreview.textContent = "No captured job data yet.";
    ui.matchScore.textContent = "--";
    ui.languageSummary.textContent = "No analysis yet.";
    ui.coverageBadge.textContent = "Awaiting lookup";
    ui.wlbValue.textContent = "--";
    ui.companySize.textContent = "--";
    ui.industry.textContent = "--";
    ui.salaryHint.textContent = "--";
    renderList(ui.requirementsList, [], () => createTag(""));
    renderList(ui.skillGapList, [], () => createTag(""));
    renderList(ui.greenFlags, [], () => createTag(""));
    renderList(ui.redFlags, [], () => createTag(""));
    renderList(ui.companyPros, [], () => createTag(""));
    renderList(ui.companyCons, [], () => createTag(""));
    ui.learningPathList.innerHTML = "";
    ui.learningPathList.appendChild(createTag("No learning recommendations yet.", "chip"));
    updateFavoriteButton();
    return;
  }

  const { job, match, languageSignals, company } = analysis;
  runtimeState.currentCompany = company?.name ? company : { ...company, name: job.company || company?.name || "" };
  const displayCompany = normalizeDisplayCompany(job.company);

  ui.jobMeta.textContent = displayCompany || "Unknown company";
  ui.jobDescriptionHint.textContent = job.description
    ? `${job.description.slice(0, 140)}${job.description.length > 140 ? "..." : ""}`
    : "No job description captured.";
  ui.jobPreview.textContent = [
    `Company: ${job.company || "Unavailable"}`,
    `Location: ${job.location || "Unavailable"}`,
    "",
    job.description || "No job description captured."
  ].join("\n");

  ui.matchScore.textContent = `${match.score}% match`;
  renderList(ui.requirementsList, match.requirements, (item) =>
    createTag(item.label, `requirement ${item.matched ? "matched" : "missing"}`)
  );
  renderList(ui.skillGapList, match.missingSkills, (skill) => createTag(skill, "requirement missing"));
  ui.learningPathList.innerHTML = "";
  if (match.learningPath?.length) {
    match.learningPath.forEach((item) => ui.learningPathList.appendChild(createLearningResourceCard(item)));
  } else {
    ui.learningPathList.appendChild(createTag("No learning recommendations yet.", "chip"));
  }

  ui.languageSummary.textContent = languageSignals.summary;
  renderList(ui.greenFlags, languageSignals.greenFlags, (flag) =>
    createTag(flag.label, "signal positive")
  );
  renderList(ui.redFlags, languageSignals.redFlags, (flag) =>
    createTag(flag.label, "signal negative")
  );

  ui.coverageBadge.textContent =
    company.source === "glassdoor-csv" ? "Glassdoor CSV coverage" : "No dataset coverage";
  ui.wlbValue.textContent = company.workLifeBalance ?? "--";
  ui.companySize.textContent = company.companySize;
  ui.industry.textContent = company.industry;
  ui.salaryHint.textContent = company.salaryHint;
  renderList(ui.companyPros, company.pros?.slice(0, 3) ?? [], (item) => createCommentCard(item, "positive"));
  renderList(ui.companyCons, company.cons?.slice(0, 3) ?? [], (item) => createCommentCard(item, "negative"));
  updateFavoriteButton();
}

function getProfileAnalysisKey(profile) {
  if (!profile?.parsedResume) {
    return "no-profile";
  }

  const uploadedAt = profile.resume?.uploadedAt ?? "";
  const skills = [...(profile.parsedResume.skills ?? [])].sort().join("|");
  const summary = profile.parsedResume.summary ?? "";
  return [uploadedAt, skills, summary].join("::");
}

function getJobAnalysisKey(job) {
  if (!job) {
    return "no-job";
  }

  return [
    job.company ?? "",
    job.location ?? "",
    job.description ?? ""
  ].join("::");
}

function mergeJobData(primaryJob = {}, fallbackJob = {}) {
  return {
    ...fallbackJob,
    ...primaryJob,
    title: "",
    company: fallbackJob.company || primaryJob.company || "",
    location: fallbackJob.location || primaryJob.location || "",
    description: primaryJob.description || fallbackJob.description || ""
  };
}

async function analyzeAndRenderJob(job, profile) {
  const [jobAnalysis, company] = await Promise.all([
    providerRegistry.jobAnalyzer.analyzeJob({ job, profile }),
    providerRegistry.companyInsights.lookupCompany(job.company)
  ]);

  const analysis = {
    job,
    ...jobAnalysis,
    company,
    profileAnalysisKey: getProfileAnalysisKey(profile),
    jobAnalysisKey: getJobAnalysisKey(job)
  };

  await saveCurrentAnalysis(analysis);
  renderAnalysis(analysis);
}

async function syncProfileToSupabase(profile) {
  if (!isSupabaseConfigured() || !runtimeState.clerkUser?.id || !runtimeState.clerkSession) {
    return profile;
  }

  const token = await getClerkSessionToken();
  if (!token) {
    return profile;
  }

  return saveRemoteProfile({
    token,
    clerkUserId: runtimeState.clerkUser.id,
    email: getClerkEmail(runtimeState.clerkUser),
    profile: attachFavoriteCompaniesToProfile(profile)
  });
}

async function recomputeAnalysisForProfile(profile, fallbackJob = null) {
  if (!isSignedIn()) {
    return;
  }

  if (!profile?.parsedResume) {
    return;
  }

  const [cachedJob, currentAnalysis] = await Promise.all([loadDetectedJob(), loadCurrentAnalysis()]);
  const jobToRefresh =
    currentAnalysis?.job ??
    cachedJob ??
    fallbackJob ??
    null;

  if (!jobToRefresh || (!jobToRefresh.title && !jobToRefresh.company && !jobToRefresh.description)) {
    return;
  }

  ui.jobMeta.textContent = "Resume updated. Recalculating match...";
  try {
    await analyzeAndRenderJob(jobToRefresh, profile);
  } catch (error) {
    ui.jobMeta.textContent = error?.message || "Could not recalculate match after updating resume.";
  }
}

async function recomputeAnalysisForJob(job, fallbackProfile = null) {
  if (!isSignedIn()) {
    return;
  }

  const profile = fallbackProfile ?? await loadProfile();
  if (!profile?.parsedResume) {
    return;
  }

  if (!job || (!job.title && !job.company && !job.description)) {
    return;
  }

  ui.jobMeta.textContent = "Job updated. Recalculating match...";
  try {
    await analyzeAndRenderJob(job, profile);
  } catch (error) {
    ui.jobMeta.textContent = error?.message || "Could not recalculate match after job update.";
  }
}

async function readTextFile(file) {
  const extension = getFileExtension(file.name);

  if (!SUPPORTED_RESUME_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported file type. Use TXT or DOCX.");
  }

  if (extension === "txt") {
    return ensureExtractedText(await file.text(), file.name);
  }

  if (extension === "docx") {
    return readDocxFile(file);
  }

  return readDocxFile(file);
}

async function handleResumeUpload(event) {
  if (!isAccountView()) {
    event.target.value = "";
    await openAccountPage("#profile");
    return;
  }

  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  runtimeState.isUploadingResume = true;
  try {
    const previousAnalysis = await loadCurrentAnalysis();
    ui.profileSummary.textContent = `Reading ${file.name}...`;
    const fileText = await readTextFile(file);
    const profile = await providerRegistry.resumeParser.parseResume(fileText, { fileName: file.name });
    const normalizedProfile = await persistNormalizedProfile(profile, { syncRemote: true });
    renderProfile(normalizedProfile);
    await recomputeAnalysisForProfile(normalizedProfile, previousAnalysis?.job ?? null);
  } catch (error) {
    ui.profileSummary.textContent =
      error?.message || "Resume upload failed. Use a text-based TXT or DOCX file.";
  } finally {
    runtimeState.isUploadingResume = false;
    event.target.value = "";
  }
}

async function readLinkedInJobFromActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const [tab] = tabs;

  if (!tab?.id) {
    return { ok: false, error: "No active tab found." };
  }

  if (!tab.url?.includes("linkedin.com/jobs")) {
    return { ok: false, error: "Open a LinkedIn Jobs tab before refreshing." };
  }

  try {
    const timeout = new Promise((resolve) => {
      window.setTimeout(() => {
        resolve({ ok: false, error: "Timed out while reading the LinkedIn page." });
      }, 8000);
    });

    const injected = chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: extractJobFromLinkedInPage
      })
      .then((results) => {
        const job = results?.[0]?.result ?? null;
        if (!job || (!job.company && !job.description)) {
          return { ok: false, error: "Job details were not found on the current page layout." };
        }

        return { ok: true, job };
      })
      .catch((error) => ({
        ok: false,
        error: error?.message || "WorkWise could not read this LinkedIn tab."
      }));

    return Promise.race([injected, timeout]);
  } catch (error) {
    return { ok: false, error: error?.message || "WorkWise could not read this LinkedIn tab." };
  }
}

async function refreshAnalysis() {
  if (!isSignedIn()) {
    ui.jobMeta.textContent = "Log in before refreshing job analysis.";
    return;
  }

  const profile = await loadProfile();
  if (!profile?.parsedResume) {
    ui.jobMeta.textContent = "Upload a resume before refreshing job analysis.";
    return;
  }

  ui.jobMeta.textContent = "Reading LinkedIn job...";
  const cachedJob = await loadDetectedJob();
  const liveResponse = await readLinkedInJobFromActiveTab();
  const response =
    liveResponse?.ok && (liveResponse.job?.company || liveResponse.job?.description)
      ? liveResponse
      : cachedJob && (cachedJob.company || cachedJob.description)
        ? { ok: true, job: cachedJob }
        : liveResponse;
  if (!response?.ok || !response?.job) {
    ui.jobMeta.textContent = response?.error || "Could not read the current LinkedIn job.";
    return;
  }

  const job = mergeJobData(response.job, cachedJob);
  await analyzeAndRenderJob(job, profile);
}

function analysisNeedsRefresh(analysis, profile) {
  if (!analysis) {
    return true;
  }

  if (analysis.schemaVersion !== ANALYSIS_SCHEMA_VERSION) {
    return true;
  }

  if (!analysis.match?.requirements?.length) {
    return true;
  }

  if (!analysis.languageSignals?.greenFlags?.length || !analysis.languageSignals?.redFlags?.length) {
    return true;
  }

  if (analysis.profileAnalysisKey !== getProfileAnalysisKey(profile)) {
    return true;
  }

  return false;
}

function analysisNeedsRefreshForJob(analysis, job) {
  if (!analysis) {
    return true;
  }

  return analysis.jobAnalysisKey !== getJobAnalysisKey(job);
}

async function hydrateProfileFromSupabase() {
  if (!isSupabaseConfigured() || !runtimeState.clerkUser?.id || !runtimeState.clerkSession) {
    return null;
  }

  const token = await getClerkSessionToken();
  if (!token) {
    return null;
  }

  renderAuthState();

  const remoteProfile = await loadRemoteProfile({
    token,
    clerkUserId: runtimeState.clerkUser.id
  });
  return normalizeProfile(remoteProfile);
}

async function handleSignUp() {
  if (!isSupabaseConfigured()) {
    ui.authStatus.textContent = "Clerk or Supabase configuration is missing.";
    return;
  }

  const credentials = getAuthCredentials();
  if (!credentials.email || !credentials.password) {
    ui.authStatus.textContent = "Enter email and password first.";
    return;
  }

  ui.authStatus.textContent = "Creating account...";
  try {
    const result = await signUpWithClerk(credentials);
    runtimeState.authError = "";
    setRuntimeAuthState(result);
    await saveAuthSnapshot(runtimeState.authSnapshot);
    renderAuthState();

    if (runtimeState.clerkSession) {
      const localProfile = normalizeProfile(await loadProfile());
      if (localProfile) {
        await syncProfileToSupabase(localProfile);
      }
    }

    ui.authStatus.textContent = runtimeState.clerkSession
      ? `Signed up as ${credentials.email}.`
      : "Account created. Verify your email in Clerk, then log in.";
  } catch (error) {
    ui.authStatus.textContent = error?.message || "Sign-up failed.";
  }
}

async function handleSignIn() {
  if (!isSupabaseConfigured()) {
    ui.authStatus.textContent = "Clerk or Supabase configuration is missing.";
    return;
  }

  const credentials = getAuthCredentials();
  if (!credentials.email || !credentials.password) {
    ui.authStatus.textContent = "Enter email and password first.";
    return;
  }

  ui.authStatus.textContent = "Signing in...";
  try {
    const result = await signInWithClerk(credentials);
    runtimeState.authError = "";
    setRuntimeAuthState(result);
    await saveAuthSnapshot(runtimeState.authSnapshot);
    renderAuthState();

    if (!runtimeState.clerkSession) {
      ui.authStatus.textContent = "Sign-in needs an additional step that this popup does not currently support.";
      return;
    }

    const userArchive = await loadUserScopedArchive();
    runtimeState.favoriteCompanies = userArchive.favoriteCompanies;
    await saveFavoriteCompanies(userArchive.favoriteCompanies);
    renderFavoriteCompanies();

    const localProfile = normalizeProfile(userArchive.profile ?? await loadProfile());
    const remoteProfile = await hydrateProfileFromSupabase();
    const resolvedProfile = await reconcileProfiles(localProfile, remoteProfile);

    if (resolvedProfile) {
      await saveUserScopedProfile(resolvedProfile);
      renderProfile(resolvedProfile);
      await recomputeAnalysisForProfile(resolvedProfile);
    }

    ui.authStatus.textContent = `Signed in as ${credentials.email}.`;
  } catch (error) {
    ui.authStatus.textContent = error?.message || "Sign-in failed.";
  }
}

async function handleSignOut() {
  try {
    const activeProfile = normalizeProfile(await loadProfile());
    if (activeProfile) {
      await saveUserScopedProfile(activeProfile);
    }

    const authState = await signOutFromClerk();
    runtimeState.authError = "";
    setRuntimeAuthState(authState);
    runtimeState.authSnapshot = {
      email: runtimeState.authSnapshot?.email || "",
      signedIn: false,
      source: "extension-session",
      syncedAt: new Date().toISOString()
    };
    await saveAuthSnapshot(runtimeState.authSnapshot);
    runtimeState.favoriteCompanies = [];
    runtimeState.currentCompany = null;
    closeFavoriteCompanyModal();
    await Promise.all([
      saveProfile(null),
      saveFavoriteCompanies([]),
      saveCurrentAnalysis(null)
    ]);
    renderAuthState();
    renderProfile(null);
    renderFavoriteCompanies();
    updateFavoriteButton();
    renderAnalysis(null);
    closeAccountMenu();
    ui.authStatus.textContent = "Signed out.";
  } catch (error) {
    ui.authStatus.textContent = error?.message || "Sign-out failed.";
  }
}

async function boot() {
  updateViewMode();
  const savedAuthSnapshot = await loadAuthSnapshot().catch(() => null);
  applySavedAuthSnapshot(savedAuthSnapshot);

  const [resolvedProfile, analysis, cachedJob, favoriteCompanies] = await Promise.all([
    refreshAuthAndProfile({ reanalyze: false }).catch(() => null),
    loadCurrentAnalysis(),
    loadDetectedJob(),
    loadFavoriteCompanies()
  ]);
  runtimeState.favoriteCompanies = favoriteCompanies;
  renderFavoriteCompanies();
  updateFavoriteButton();

  if (cachedJob) {
    ui.jobPreview.textContent = [
      `Company: ${cachedJob.company || "Unavailable"}`,
      `Location: ${cachedJob.location || "Unavailable"}`,
      "",
      cachedJob.description || "No job description captured."
    ].join("\n");
  }

  if (
    resolvedProfile?.parsedResume &&
    cachedJob &&
    (cachedJob.company || cachedJob.description) &&
    analysisNeedsRefresh(analysis, resolvedProfile)
  ) {
    await analyzeAndRenderJob(cachedJob, resolvedProfile);
    return;
  }

  renderAnalysis(analysis);

  if (isAccountView() && window.location.hash === "#profile") {
    scrollToProfileCard();
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[STORAGE_KEYS.profile]) {
    const profile = isSignedIn() ? (changes[STORAGE_KEYS.profile].newValue ?? null) : null;
    renderProfile(profile);

    if (isSignedIn() && profile?.parsedResume) {
      recomputeAnalysisForProfile(profile, changes[STORAGE_KEYS.detectedJob]?.newValue ?? null).catch((error) => {
        ui.jobMeta.textContent = error?.message || "Could not recalculate match after updating resume.";
      });
    }
  }

  if (changes[STORAGE_KEYS.favoriteCompanies]) {
    runtimeState.favoriteCompanies = changes[STORAGE_KEYS.favoriteCompanies].newValue ?? [];
    renderFavoriteCompanies();
    updateFavoriteButton();
  }

  if (changes[STORAGE_KEYS.authSnapshot]) {
    applySavedAuthSnapshot(changes[STORAGE_KEYS.authSnapshot].newValue ?? null);
    renderAuthState();
  }

  if (changes[STORAGE_KEYS.currentAnalysis]) {
    renderAnalysis(isSignedIn() ? (changes[STORAGE_KEYS.currentAnalysis].newValue ?? null) : null);
  }

  if (changes[STORAGE_KEYS.detectedJob]) {
    const job = changes[STORAGE_KEYS.detectedJob].newValue ?? null;
    if (isSignedIn() && job) {
      ui.jobPreview.textContent = [
        `Company: ${job.company || "Unavailable"}`,
        `Location: ${job.location || "Unavailable"}`,
        "",
        job.description || "No job description captured."
      ].join("\n");

      loadProfile().then((profile) => {
        if (profile?.parsedResume) {
          loadCurrentAnalysis().then((analysis) => {
            if (analysisNeedsRefreshForJob(analysis, job) || analysisNeedsRefresh(analysis, profile)) {
              recomputeAnalysisForJob(job, profile).catch((error) => {
                ui.jobMeta.textContent = error?.message || "Could not recalculate match after job update.";
              });
            }
          });
        }
      });
    }
  }
});

ui.resumeInput.addEventListener("change", handleResumeUpload);
ui.refreshButton.addEventListener("click", refreshAnalysis);
ui.favoriteCompanyButton.addEventListener("click", toggleFavoriteCompany);
ui.removeFavoriteCompanyButton.addEventListener("click", () => removeFavoriteCompany());
ui.closeFavoriteModalButton.addEventListener("click", closeFavoriteCompanyModal);
ui.openAccountResumeButton.addEventListener("click", () => openAccountPage("#profile"));
ui.signUpButton.addEventListener("click", handleSignUp);
ui.signInButton.addEventListener("click", handleSignIn);
ui.signOutButton.addEventListener("click", handleSignOut);
ui.accountButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleAccountMenu();
});
ui.menuOpenAccountButton.addEventListener("click", async () => {
  closeAccountMenu();
  if (isAccountView()) {
    scrollToProfileCard();
    return;
  }

  await openAccountPage("#profile");
});
ui.menuAuthButton.addEventListener("click", async () => {
  closeAccountMenu();
  if (isAccountView()) {
    scrollToProfileCard();
    return;
  }

  await openAccountPage("#profile");
});
ui.menuResumeButton.addEventListener("click", async () => {
  closeAccountMenu();
  if (isAccountView()) {
    scrollToProfileCard();
    return;
  }

  await openAccountPage("#profile");
});
ui.menuSignOutButton.addEventListener("click", handleSignOut);
document.addEventListener("click", (event) => {
  if (!ui.accountAnchor?.contains?.(event.target)) {
    closeAccountMenu();
  }
});
window.addEventListener("focus", scheduleProfileRefresh);
window.addEventListener("pageshow", scheduleProfileRefresh);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    scheduleProfileRefresh();
  }
});

boot();
