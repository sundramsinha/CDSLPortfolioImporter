const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");

const REPORT_DIR = path.join(__dirname, "..", "data", "reports");

async function saveParsedReport(payload) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const reportId = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}`;
  const filename = `${reportId}.json`;
  const absolutePath = path.join(REPORT_DIR, filename);
  await fs.writeFile(absolutePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    reportId,
    filename,
    absolutePath
  };
}

async function readParsedReport(reportId) {
  const safeId = String(reportId || "").replace(/[^a-zA-Z0-9\-]/g, "");
  if (!safeId) {
    throw new Error("Invalid report id.");
  }
  const filename = `${safeId}.json`;
  const absolutePath = path.join(REPORT_DIR, filename);
  const raw = await fs.readFile(absolutePath, "utf8");
  return {
    filename,
    absolutePath,
    data: JSON.parse(raw)
  };
}

module.exports = {
  saveParsedReport,
  readParsedReport
};
