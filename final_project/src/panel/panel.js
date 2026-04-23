import { ANALYSIS_SCHEMA_VERSION, providerRegistry } from "../shared/providers.js";
import {
  STORAGE_KEYS,
  loadCurrentAnalysis,
  loadDetectedJob,
  loadProfile,
  saveCurrentAnalysis,
  saveProfile
} from "../shared/storage.js";

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

  function stripJobDescriptionLabel(text) {
    const normalized = text || "";
    const markerMatch = normalized.match(
      /about the job|job description|responsibilities|what you'll do|minimum qualifications|preferred qualifications|qualifications/i
    );
    const sliced = markerMatch ? normalized.slice(markerMatch.index) : normalized;

    return cleanText(
      sliced
        .replace(/^about the job\s*/i, "")
        .replace(/^job description\s*/i, "")
        .replace(/^responsibilities\s*/i, "")
        .replace(/^what you'll do\s*/i, "")
        .replace(/^minimum qualifications\s*/i, "")
        .replace(/^preferred qualifications\s*/i, "")
        .replace(/^qualifications\s*/i, "")
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

const ui = {
  authBadge: document.getElementById("authBadge"),
  profileSummary: document.getElementById("profileSummary"),
  resumeInput: document.getElementById("resumeInput"),
  resumeSkills: document.getElementById("resumeSkills"),
  resumePreview: document.getElementById("resumePreview"),
  refreshButton: document.getElementById("refreshButton"),
  jobMeta: document.getElementById("jobMeta"),
  jobDescriptionHint: document.getElementById("jobDescriptionHint"),
  jobPreview: document.getElementById("jobPreview"),
  matchScore: document.getElementById("matchScore"),
  requirementsList: document.getElementById("requirementsList"),
  languageSummary: document.getElementById("languageSummary"),
  greenFlags: document.getElementById("greenFlags"),
  redFlags: document.getElementById("redFlags"),
  coverageBadge: document.getElementById("coverageBadge"),
  wlbValue: document.getElementById("wlbValue"),
  companySize: document.getElementById("companySize"),
  industry: document.getElementById("industry"),
  salaryHint: document.getElementById("salaryHint"),
  companyPros: document.getElementById("companyPros"),
  companyCons: document.getElementById("companyCons")
};

function createTag(label, className = "chip") {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = label;
  return element;
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

function renderProfile(profile) {
  ui.authBadge.textContent = `Auth: ${providerRegistry.authStore.futureProvider} ready`;

  if (!profile?.parsedResume) {
    ui.profileSummary.textContent = "No resume uploaded yet.";
    ui.resumePreview.textContent = "No extracted resume text yet.";
    renderList(ui.resumeSkills, [], () => createTag(""));
    return;
  }

  ui.profileSummary.textContent = `${profile.parsedResume.experienceLevel} profile. ${profile.parsedResume.skills.length} parsed skills stored locally for demo persistence.`;
  ui.resumePreview.textContent = profile.parsedResume.preview || "No extracted resume text preview available.";
  renderList(ui.resumeSkills, profile.parsedResume.skills, (skill) => createTag(skill));
}

function renderAnalysis(analysis) {
  if (!analysis) {
    return;
  }

  const { job, match, languageSignals, company } = analysis;
  const displayCompany = normalizeDisplayCompany(job.company);
  const displayTitle = stripCompanyPrefixFromTitle(normalizeDisplayTitle(job.title), displayCompany);

  ui.jobMeta.textContent = `${displayTitle || "Unknown title"} • ${displayCompany || "Unknown company"}`;
  ui.jobDescriptionHint.textContent = job.description
    ? `${job.description.slice(0, 140)}${job.description.length > 140 ? "..." : ""}`
    : "No job description captured.";
  ui.jobPreview.textContent = [
    `Title: ${job.title || "Unavailable"}`,
    `Company: ${job.company || "Unavailable"}`,
    `Location: ${job.location || "Unavailable"}`,
    "",
    job.description || "No job description captured."
  ].join("\n");

  ui.matchScore.textContent = `${match.score}% match`;
  renderList(ui.requirementsList, match.requirements, (item) =>
    createTag(item.label, `requirement ${item.matched ? "matched" : "missing"}`)
  );

  ui.languageSummary.textContent = languageSignals.summary;
  renderList(ui.greenFlags, languageSignals.greenFlags, (flag) =>
    createTag(flag.label, "signal positive")
  );
  renderList(ui.redFlags, languageSignals.redFlags, (flag) =>
    createTag(flag.label, "signal negative")
  );

  ui.coverageBadge.textContent =
    company.source === "demo-glassdoor-seed" ? "Major-tech coverage" : "No dataset coverage";
  ui.wlbValue.textContent = company.workLifeBalance ?? "--";
  ui.companySize.textContent = company.companySize;
  ui.industry.textContent = company.industry;
  ui.salaryHint.textContent = company.salaryHint;
  renderList(ui.companyPros, company.pros, (item) => createTag(item, "signal positive"));
  renderList(ui.companyCons, company.cons, (item) => createTag(item, "signal negative"));
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

async function analyzeAndRenderJob(job, profile) {
  const [jobAnalysis, company] = await Promise.all([
    providerRegistry.jobAnalyzer.analyzeJob({ job, profile }),
    providerRegistry.companyInsights.lookupCompany(job.company)
  ]);

  const analysis = {
    job,
    ...jobAnalysis,
    company,
    profileAnalysisKey: getProfileAnalysisKey(profile)
  };

  await saveCurrentAnalysis(analysis);
  renderAnalysis(analysis);
}

async function recomputeAnalysisForProfile(profile, fallbackJob = null) {
  if (!profile?.parsedResume) {
    return;
  }

  const [cachedJob, currentAnalysis] = await Promise.all([loadDetectedJob(), loadCurrentAnalysis()]);
  const jobToRefresh = cachedJob ?? currentAnalysis?.job ?? fallbackJob ?? null;

  if (!jobToRefresh || (!jobToRefresh.title && !jobToRefresh.company && !jobToRefresh.description)) {
    return;
  }

  ui.jobMeta.textContent = "Resume updated. Recalculating match...";
  await analyzeAndRenderJob(jobToRefresh, profile);
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
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    ui.profileSummary.textContent = `Reading ${file.name}...`;
    const fileText = await readTextFile(file);
    const profile = await providerRegistry.resumeParser.parseResume(fileText, { fileName: file.name });
    await saveProfile(profile);
    renderProfile(profile);
    await recomputeAnalysisForProfile(profile);
  } catch (error) {
    ui.profileSummary.textContent =
      error?.message || "Resume upload failed. Use a text-based TXT or DOCX file.";
  } finally {
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
        if (!job || (!job.title && !job.company && !job.description)) {
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
  const profile = await loadProfile();
  if (!profile?.parsedResume) {
    ui.jobMeta.textContent = "Upload a resume before refreshing job analysis.";
    return;
  }

  ui.jobMeta.textContent = "Reading LinkedIn job...";
  const cachedJob = await loadDetectedJob();
  const liveResponse = await readLinkedInJobFromActiveTab();
  const response =
    liveResponse?.ok && (liveResponse.job?.title || liveResponse.job?.company || liveResponse.job?.description)
      ? liveResponse
      : cachedJob && (cachedJob.title || cachedJob.company || cachedJob.description)
        ? { ok: true, job: cachedJob }
        : liveResponse;
  if (!response?.ok || !response?.job) {
    ui.jobMeta.textContent = response?.error || "Could not read the current LinkedIn job.";
    return;
  }

  const job = response.job;
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

async function boot() {
  const [profile, analysis, cachedJob] = await Promise.all([
    loadProfile(),
    loadCurrentAnalysis(),
    loadDetectedJob()
  ]);
  renderProfile(profile);

  if (cachedJob) {
    ui.jobPreview.textContent = [
      `Title: ${cachedJob.title || "Unavailable"}`,
      `Company: ${cachedJob.company || "Unavailable"}`,
      `Location: ${cachedJob.location || "Unavailable"}`,
      "",
      cachedJob.description || "No job description captured."
    ].join("\n");
  }

  if (
    profile?.parsedResume &&
    cachedJob &&
    (cachedJob.title || cachedJob.company || cachedJob.description) &&
    analysisNeedsRefresh(analysis, profile)
  ) {
    await analyzeAndRenderJob(cachedJob, profile);
    return;
  }

  renderAnalysis(analysis);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[STORAGE_KEYS.profile]) {
    const profile = changes[STORAGE_KEYS.profile].newValue ?? null;
    renderProfile(profile);

    if (profile?.parsedResume) {
      recomputeAnalysisForProfile(profile, changes[STORAGE_KEYS.detectedJob]?.newValue ?? null).catch(() => {});
    }
  }

  if (changes[STORAGE_KEYS.currentAnalysis]) {
    renderAnalysis(changes[STORAGE_KEYS.currentAnalysis].newValue ?? null);
  }

  if (changes[STORAGE_KEYS.detectedJob]) {
    const job = changes[STORAGE_KEYS.detectedJob].newValue ?? null;
    if (job) {
      ui.jobPreview.textContent = [
        `Title: ${job.title || "Unavailable"}`,
        `Company: ${job.company || "Unavailable"}`,
        `Location: ${job.location || "Unavailable"}`,
        "",
        job.description || "No job description captured."
      ].join("\n");
    }
  }
});

ui.resumeInput.addEventListener("change", handleResumeUpload);
ui.refreshButton.addEventListener("click", refreshAnalysis);

boot();
