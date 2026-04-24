const DETECTED_JOB_KEY = "workwise.detectedJob";

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

function pickJobFields(primary, secondary, tertiary, fallback = {}) {
  return {
    title: primary.title || secondary.title || tertiary.title || fallback.title || "",
    company: primary.company || secondary.company || tertiary.company || fallback.company || "",
    location: primary.location || secondary.location || tertiary.location || fallback.location || ""
  };
}

function getViewportWidth() {
  return window.innerWidth || document.documentElement.clientWidth || 0;
}

function collectRightSideNodes() {
  const minX = Math.floor(getViewportWidth() * 0.35);
  return Array.from(document.querySelectorAll("span,a,strong,h1,h2,h3,h4,p,div"))
    .map((element) => {
      const text = textFrom(element);
      if (!text || text.length > 120) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      if (rect.x < minX || rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      return {
        element,
        text,
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height
      };
    })
    .filter(Boolean);
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

function extractFromRightSideNodes() {
  const nodes = collectRightSideNodes();
  const titleNode = nodes
    .filter((node) => isLikelyJobTitle(node.text))
    .sort((a, b) => a.x - b.x || a.y - b.y)[0];

  if (!titleNode) {
    return null;
  }

  const companyNode = nodes
    .filter((node) => {
      return (
        node.text !== titleNode.text &&
        !isLikelyJobTitle(node.text) &&
        !looksLikeLocation(node.text) &&
        !isNoise(node.text) &&
        node.text.length < 80 &&
        Math.abs(node.x - titleNode.x) < 140 &&
        node.y >= titleNode.y - 90 &&
        node.y <= titleNode.y + 30
      );
    })
    .sort((a, b) => Math.abs(a.y - (titleNode.y - 24)) - Math.abs(b.y - (titleNode.y - 24)))[0];

  const locationNode = nodes
    .filter((node) => {
      return (
        node.text !== titleNode.text &&
        looksLikeLocation(node.text) &&
        !isNoise(node.text) &&
        Math.abs(node.x - titleNode.x) < 180 &&
        node.y >= titleNode.y - 20 &&
        node.y <= titleNode.y + 120
      );
    })
    .sort((a, b) => a.y - b.y)[0];

  return {
    title: titleNode.text,
    company: normalizeCompany(companyNode?.text || ""),
    location: normalizeLocation(locationNode?.text || "")
  };
}

function findLikelyTitleElement(root = document) {
  return Array.from(root.querySelectorAll("h1, h2, h3, a, strong, span"))
    .map((element) => ({ element, text: textFrom(element) }))
    .find(({ text }) => isLikelyJobTitle(text))?.element || null;
}

function collectNearbyText(element) {
  if (!element) {
    return [];
  }

  const containers = [
    element,
    element.parentElement,
    element.parentElement?.parentElement,
    element.closest("section, article, main, div")
  ].filter(Boolean);

  return containers.flatMap((container) =>
    Array.from(container.querySelectorAll("a, span, div, strong, h1, h2, h3"))
      .map((node) => textFrom(node))
      .filter(Boolean)
  );
}

function extractNearTitle(root = document) {
  const titleElement = findLikelyTitleElement(root);
  const title = textFrom(titleElement);
  if (!titleElement || !isLikelyJobTitle(title)) {
    return null;
  }

  const nearbyText = collectNearbyText(titleElement);
  const company =
    nearbyText.find((text) => text !== title && !looksLikeLocation(text) && !isNoise(text) && text.length < 80) || "";
  const location =
    nearbyText.find((text) => text !== title && looksLikeLocation(text) && !isNoise(text)) || "";

  return {
    title,
    company,
    location: normalizeLocation(location)
  };
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

  const headingCandidates = Array.from(panel.querySelectorAll("h1, h2"))
    .map((element) => textFrom(element))
    .filter(Boolean);
  const titleCandidate =
    headingCandidates.find((text) => isLikelyJobTitle(text)) ||
    headingCandidates[0] ||
    "";

  const titleElement = Array.from(panel.querySelectorAll("h1, h2, h3"))
    .find((element) => textFrom(element) === titleCandidate) || null;

  const nearbyCompanyCandidates = titleElement
    ? [
        textFrom(titleElement.previousElementSibling),
        ...Array.from(titleElement.parentElement?.children || [])
          .map((element) => textFrom(element))
          .filter(Boolean),
        ...Array.from(titleElement.parentElement?.parentElement?.children || [])
          .map((element) => textFrom(element))
          .filter(Boolean),
        textFrom(panel.querySelector("img[alt]"))
      ]
    : [];

  const companyCandidate = Array.from(panel.querySelectorAll("a, span, div"))
    .map((element) => textFrom(element))
    .filter(Boolean)
    .concat(nearbyCompanyCandidates)
    .find((text) => {
      const normalized = text.toLowerCase();
      return (
        text !== titleCandidate &&
        text.length > 2 &&
        text.length < 80 &&
        !isLikelyJobTitle(text) &&
        !looksLikeLocation(text) &&
        !normalized.includes("apply") &&
        !normalized.includes("save") &&
        !normalized.includes("people clicked") &&
        !normalized.includes("responses managed") &&
        !normalized.includes("how promoted jobs are ranked") &&
        !normalized.includes("on-site") &&
        !normalized.includes("remote") &&
        !normalized.includes("full-time") &&
        !normalized.includes("contract")
      );
    }) || "";

  const locationCandidate = Array.from(panel.querySelectorAll("span, div"))
    .map((element) => textFrom(element))
    .filter(Boolean)
    .find((text) => {
      return (
        text.includes(",") &&
        (text.includes("United States") ||
          /\b[A-Z]{2}\b/.test(text) ||
          text.includes("Remote") ||
          text.includes("On-site"))
      );
    }) || "";

  return {
    title: textFrom(
      panel.querySelector(
        ".job-details-jobs-unified-top-card__job-title, .t-24.job-details-jobs-unified-top-card__job-title, h1"
      )
    ) || titleCandidate,
    company: textFrom(
      panel.querySelector(
        ".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__primary-description a"
      )
    ) || normalizeCompany(companyCandidate),
    location: normalizeLocation(
      textFrom(
        panel.querySelector(
          ".job-details-jobs-unified-top-card__primary-description-container, .jobs-unified-top-card__primary-description-container, .job-details-jobs-unified-top-card__primary-description"
        )
      )
    ) || normalizeLocation(locationCandidate)
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

function extractDescriptionFallback() {
  return extractGlobalDescriptionFallback();
}

function extractDescriptionBelowTopCard(detailRoot) {
  if (!detailRoot) {
    return "";
  }

  const topCard = detailRoot.querySelector(
    [
      ".job-details-jobs-unified-top-card__container--two-pane",
      ".job-details-jobs-unified-top-card__container",
      ".jobs-unified-top-card",
      ".job-details-jobs-unified-top-card"
    ].join(", ")
  );

  const thresholdY = topCard ? topCard.getBoundingClientRect().bottom + 24 : 0;
  const candidates = Array.from(detailRoot.querySelectorAll("section, div, article"))
    .map((element) => {
      const text = textFrom(element);
      const rect = element.getBoundingClientRect();
      return { text, rect };
    })
    .filter(({ text, rect }) => {
      const normalized = text.toLowerCase();
      return (
        text &&
        text.length > 180 &&
        rect.height > 80 &&
        rect.top >= thresholdY &&
        !normalized.includes("show match details") &&
        !normalized.includes("match details beta") &&
        !normalized.includes("get personalized tips to stand out to hirers") &&
        !normalized.includes("reactivate premium") &&
        !normalized.includes("is this information helpful")
      );
    })
    .sort((left, right) => right.text.length - left.text.length);

  const best = candidates[0]?.text || "";
  return stripJobDescriptionLabel(best);
}

function extractDetailRootText(detailRoot) {
  if (!detailRoot) {
    return "";
  }

  const text = textFrom(detailRoot);
  if (!text) {
    return "";
  }

  const lines = text
    .split(/\n|•/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .filter((line) => {
      const normalized = line.toLowerCase();
      return ![
        "apply",
        "save",
        "show match details",
        "match details beta",
        "is this information helpful",
        "get personalized tips to stand out to hirers",
        "reactivate premium",
        "responses managed off linkedin",
        "people clicked apply",
        "under 10 applicants",
        "easy apply"
      ].some((noise) => normalized.includes(noise));
    });

  const joined = lines.join("\n");
  if (joined.length < 120) {
    return "";
  }

  return stripJobDescriptionLabel(joined);
}

function extractJobFromPage() {
  const detailRoot = getDetailRoot();
  const fromRightNodes = extractFromRightSideNodes() || {};
  const fromPanel = extractFromMainPanel() || {};
  const fromCard = extractFromCard(findSelectedCard()) || {};
  const fromHeuristic = detailRoot ? extractNearTitle(detailRoot) || {} : {};
  const fallback = {
    title: detailRoot ? textFrom(detailRoot.querySelector("h1, h2")) : firstText(["main h1"]),
    company: firstText([
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name"
    ]),
    location: normalizeLocation(
      firstText([
        ".job-details-jobs-unified-top-card__primary-description-container",
        ".jobs-unified-top-card__primary-description-container"
      ])
    )
  };
  const jobFields =
    fromRightNodes.title || fromPanel.title || fromHeuristic.title
      ? pickJobFields(fromRightNodes, fromPanel, fromHeuristic, fallback)
      : pickJobFields(fromHeuristic, fromPanel, fromCard, fallback);
  const description = extractGlobalDescriptionFallback();
  const jobId = getCurrentJobId();

  if (!jobId && !jobFields.title && !jobFields.company && !description) {
    return null;
  }

  return {
    id: jobId || `${jobFields.company}-${jobFields.title}`.toLowerCase().replace(/\s+/g, "-"),
    title: isLikelyJobTitle(jobFields.title) ? jobFields.title : "",
    company: isNoise(jobFields.company) ? "" : normalizeCompany(jobFields.company),
    location: jobFields.location,
    description,
    url: window.location.href,
    capturedAt: new Date().toISOString()
  };
}

let lastSignature = "";

function syncJobToStorage() {
  const extractedJob = extractJobFromPage();
  if (!extractedJob || (!extractedJob.title && !extractedJob.company && !extractedJob.description)) {
    return;
  }

  chrome.storage.local.get([DETECTED_JOB_KEY], (result) => {
    const existingJob = result?.[DETECTED_JOB_KEY] || null;
    const sameJob =
      existingJob &&
      ((extractedJob.id && existingJob.id === extractedJob.id) ||
        (existingJob.url && extractedJob.url && existingJob.url === extractedJob.url));

    const job =
      sameJob && existingJob?.description && !extractedJob.description
        ? {
            ...extractedJob,
            description: stripJobDescriptionLabel(existingJob.description)
          }
        : {
            ...extractedJob,
            description: stripJobDescriptionLabel(extractedJob.description)
          };

    const signature = JSON.stringify([
      job.id,
      job.title,
      job.company,
      job.location,
      job.url,
      job.description?.length || 0
    ]);

    if (signature === lastSignature) {
      return;
    }

    lastSignature = signature;
    window.__WORKWISE_LAST_JOB = job;
    console.log("[WorkWise] Captured LinkedIn job", job);
    chrome.storage.local.set({ [DETECTED_JOB_KEY]: job });
  });
}

const observer = new MutationObserver(() => {
  window.clearTimeout(syncJobToStorage._timer);
  syncJobToStorage._timer = window.setTimeout(syncJobToStorage, 250);
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener("load", syncJobToStorage);
window.addEventListener("popstate", syncJobToStorage);
window.setInterval(syncJobToStorage, 1500);
syncJobToStorage();
