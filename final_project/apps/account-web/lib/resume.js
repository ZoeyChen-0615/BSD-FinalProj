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

async function inflateDeflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const inflated = await new Response(stream).arrayBuffer();
  return new Uint8Array(inflated);
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

export async function readResumeText(file) {
  const extension = getFileExtension(file.name);

  if (!SUPPORTED_RESUME_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported file type. Use TXT or DOCX.");
  }

  if (extension === "txt") {
    return ensureExtractedText(await file.text(), file.name);
  }

  return readDocxFile(file);
}
