const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_TEMPLATE_BYTES = 1_000_000;

function getFileExtension(fileName = "") {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return btoa(binary);
}

export async function readCoverLetterTemplate(file) {
  const extension = getFileExtension(file?.name);
  if (extension !== "docx") {
    throw new Error("Cover letter template must be a DOCX file.");
  }

  if ((file?.size ?? 0) > MAX_TEMPLATE_BYTES) {
    throw new Error("Cover letter template is too large. Keep it under 1 MB.");
  }

  const documentBase64 = arrayBufferToBase64(await file.arrayBuffer());

  return {
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    mimeType: DOCX_MIME_TYPE,
    documentBase64,
    placeholders: ["[company]", "[title]"]
  };
}
