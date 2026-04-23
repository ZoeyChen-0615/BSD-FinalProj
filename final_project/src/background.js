chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

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

  function isLikelyJobTitle(text) {
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

    const title = textFrom(
      card.querySelector(
        ".job-card-list__title--link, .job-card-list__title, .artdeco-entity-lockup__title a, a[href*='/jobs/view/'], strong"
      )
    );
    const company = textFrom(
      card.querySelector(
        ".artdeco-entity-lockup__subtitle, .job-card-container__company-name, h4, .artdeco-entity-lockup__subtitle span"
      )
    );
    const location = normalizeLocation(
      textFrom(card.querySelector(".job-card-container__metadata-wrapper, .artdeco-entity-lockup__caption"))
    );

    return { title, company, location };
  }

  function extractFromMainPanel() {
    const panel = document.querySelector(
      [
        ".job-details-jobs-unified-top-card__container--two-pane",
        ".job-details-jobs-unified-top-card__container",
        ".jobs-unified-top-card",
        ".jobs-search__job-details--container"
      ].join(", ")
    );

    if (!panel) {
      return null;
    }

    const title = textFrom(
      panel.querySelector(
        ".job-details-jobs-unified-top-card__job-title, .t-24.job-details-jobs-unified-top-card__job-title, h1"
      )
    );
    const company = textFrom(
      panel.querySelector(
        ".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__primary-description a"
      )
    );
    const location = normalizeLocation(
      textFrom(
        panel.querySelector(
          ".job-details-jobs-unified-top-card__primary-description-container, .jobs-unified-top-card__primary-description-container, .job-details-jobs-unified-top-card__primary-description"
        )
      )
    );

    return { title, company, location };
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

  const fromPanel = extractFromMainPanel() || {};
  const fromCard = extractFromCard(findSelectedCard()) || {};
  const title = fromPanel.title || fromCard.title || firstText(["main h1", ".jobs-search__job-details--container h1"]);
  const company =
    fromPanel.company ||
    fromCard.company ||
    firstText([
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name"
    ]);
  const location =
    fromPanel.location ||
    fromCard.location ||
    normalizeLocation(
      firstText([
        ".job-details-jobs-unified-top-card__primary-description-container",
        ".jobs-unified-top-card__primary-description-container"
      ])
    );
  const description = firstText([
    ".jobs-description__content .jobs-box__html-content",
    ".jobs-description-content__text",
    ".jobs-box__html-content",
    ".jobs-description",
    ".jobs-description__container"
  ]);
  const jobId = getCurrentJobId();

  const safeTitle = isLikelyJobTitle(title) ? title : "";

  return {
    id: jobId || `${company}-${safeTitle}`.toLowerCase().replace(/\s+/g, "-"),
    title: safeTitle,
    company,
    location,
    description,
    url: window.location.href,
    capturedAt: new Date().toISOString(),
    debug: {
      fromPanel,
      fromCard,
      headings: Array.from(document.querySelectorAll("h1, h2"))
        .map((element) => textFrom(element))
        .filter(Boolean)
        .slice(0, 10)
    }
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "workwise:get-active-job") {
    return false;
  }

  (async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const [tab] = tabs;
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab found." });
        return;
      }

      if (!tab.url?.includes("linkedin.com/jobs")) {
        sendResponse({ ok: false, error: "Open a LinkedIn Jobs tab before refreshing." });
        return;
      }

      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractJobFromLinkedInPage
      });

      const job = injectionResults?.[0]?.result ?? null;
      if (!job || (!job.id && !job.title && !job.company && !job.description)) {
        sendResponse({
          ok: false,
          error: "Job details were not found on the current page layout."
        });
        return;
      }

      sendResponse({ ok: true, job });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error?.message || "WorkWise could not read this LinkedIn tab."
      });
    }
  })();

  return true;
});
