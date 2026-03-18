const pdfParse = require("pdf-parse");
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

async function readPdfText(fileBuffer, options = {}) {
  const password = typeof options.password === "string" ? options.password.trim() : "";
  if (!Buffer.isBuffer(fileBuffer) || !fileBuffer.length) {
    throw new Error("Invalid PDF upload.");
  }

  try {
    const result = await pdfParse(fileBuffer);
    const text = String(result?.text || "").trim();
    if (!text) {
      throw new Error("PDF has no extractable text.");
    }
    return text;
  } catch (error) {
    const errorMessage = String(error?.message || "");
    const needsPassword =
      /password|encrypted|PasswordException|No password given/i.test(errorMessage);

    if (needsPassword || password) {
      return readEncryptedPdfText(fileBuffer, password);
    }

    if (errorMessage.includes("extractable text")) {
      throw error;
    }
    throw new Error("Unable to parse PDF. File may be corrupted, encrypted, or image-only.");
  }
}

async function readEncryptedPdfText(fileBuffer, password) {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(fileBuffer),
      password: password || undefined
    });
    const pdfDocument = await loadingTask.promise;
    const pages = [];

    for (let pageNo = 1; pageNo <= pdfDocument.numPages; pageNo += 1) {
      const page = await pdfDocument.getPage(pageNo);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      pages.push(pageText);
    }

    const text = pages.join("\n").trim();
    if (!text) {
      throw new Error("PDF has no extractable text.");
    }
    return text;
  } catch (error) {
    const name = String(error?.name || "");
    const message = String(error?.message || "");
    if (/PasswordException/i.test(name) || /password/i.test(message)) {
      throw new Error(
        "PDF is password-protected. Please provide the correct password in the `password` field."
      );
    }
    throw new Error("Unable to parse PDF. File may be corrupted, encrypted, or image-only.");
  }
}

module.exports = {
  readPdfText
};
