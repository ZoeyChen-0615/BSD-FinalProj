import mammoth from "mammoth";
import PizZip from "pizzip";
import { jsPDF } from "jspdf";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PLACEHOLDERS = {
  company: "[company]",
  title: "[title]"
};

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function replaceAll(text, searchValue, replacement) {
  return text.split(searchValue).join(replacement);
}

function sanitizeFileSegment(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function buildDownloadFileName(company, title, extension) {
  const companyPart = sanitizeFileSegment(company) || "company";
  const titlePart = sanitizeFileSegment(title) || "cover-letter";
  return `cover-letter-${companyPart}-${titlePart}.${extension}`;
}

function triggerDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function sanitizeCoverLetterField(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function getCoverLetterTemplate(profile) {
  const template = profile?.coverLetterTemplate;
  if (!template?.documentBase64) {
    return null;
  }

  return {
    fileName: template.fileName || "cover-letter-template.docx",
    uploadedAt: template.uploadedAt || "",
    mimeType: template.mimeType || DOCX_MIME_TYPE,
    documentBase64: template.documentBase64
  };
}

export function buildCoverLetterDraftKey(job) {
  if (!job) {
    return "";
  }

  return [job.url || "", job.company || "", job.title || ""]
    .map((value) => sanitizeCoverLetterField(value))
    .filter(Boolean)
    .join("::");
}

export function getCoverLetterDefaults(job) {
  return {
    company: sanitizeCoverLetterField(job?.company),
    title: sanitizeCoverLetterField(job?.title)
  };
}

export async function renderCoverLetterDocx(template, replacements) {
  const resolvedTemplate = getCoverLetterTemplate({ coverLetterTemplate: template });
  if (!resolvedTemplate) {
    throw new Error("No cover letter template uploaded yet.");
  }

  const company = sanitizeCoverLetterField(replacements?.company);
  const title = sanitizeCoverLetterField(replacements?.title);
  if (!company || !title) {
    throw new Error("Company and job title are required.");
  }

  const zip = new PizZip(base64ToUint8Array(resolvedTemplate.documentBase64));
  let replacedXmlFiles = 0;

  Object.keys(zip.files)
    .filter((name) => name.endsWith(".xml") && !zip.files[name].dir)
    .forEach((name) => {
      const original = zip.file(name)?.asText?.();
      if (!original) {
        return;
      }

      const next = replaceAll(
        replaceAll(original, PLACEHOLDERS.company, company),
        PLACEHOLDERS.title,
        title
      );

      if (next !== original) {
        replacedXmlFiles += 1;
        zip.file(name, next);
      }
    });

  if (!replacedXmlFiles) {
    throw new Error("Template placeholders [company] and [title] were not found.");
  }

  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

export async function downloadCoverLetterDocx({ template, company, title }) {
  const renderedDocx = await renderCoverLetterDocx(template, { company, title });
  triggerDownload(
    new Blob([renderedDocx], { type: DOCX_MIME_TYPE }),
    buildDownloadFileName(company, title, "docx")
  );
}

export async function downloadCoverLetterPdf({ template, company, title }) {
  const renderedDocx = await renderCoverLetterDocx(template, { company, title });
  const { value } = await mammoth.extractRawText({ arrayBuffer: toArrayBuffer(renderedDocx) });
  const text = sanitizeCoverLetterField(value?.replace(/\n{3,}/g, "\n\n")) || `${company}\n${title}`;
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 54;
  const maxWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = pdf.internal.pageSize.getHeight();
  const lineHeight = 18;
  const lines = pdf.splitTextToSize(text, maxWidth);
  let y = margin;

  pdf.setFont("times", "normal");
  pdf.setFontSize(12);

  lines.forEach((line) => {
    if (y > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }

    pdf.text(line, margin, y);
    y += lineHeight;
  });

  pdf.save(buildDownloadFileName(company, title, "pdf"));
}
