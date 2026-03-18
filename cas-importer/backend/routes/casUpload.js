const express = require("express");
const multer = require("multer");
const path = require("path");
const { readPdfText } = require("../services/pdfReader");
const { cleanCasText } = require("../utils/textCleaner");
const { parseCasPortfolio } = require("../services/casParser");
const { saveParsedReport, readParsedReport } = require("../services/reportStore");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const validMime = file.mimetype === "application/pdf";
    const validName = (file.originalname || "").toLowerCase().endsWith(".pdf");
    if (!validMime && !validName) {
      return cb(new Error("Only PDF files are supported."));
    }
    return cb(null, true);
  }
});

router.post("/upload-cas", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "Missing file. Upload using form-data key: file" });
    }

    const rawPassword = typeof req.body?.password === "string" ? req.body.password.trim() : "";
    if (rawPassword && rawPassword !== rawPassword.toUpperCase()) {
      return res.status(400).json({
        error: "Password must be uppercase."
      });
    }
    const password = rawPassword.toUpperCase();
    const rawText = await readPdfText(req.file.buffer, { password });
    const cleanedText = cleanCasText(rawText);
    const parsed = parseCasPortfolio(cleanedText);
    const mutualFundHoldings = parsed.mutualFundHoldings || [];
    const dematHoldings = parsed.dematHoldings || [];
    const transactions = parsed.transactions || [];
    const dematTransactions = parsed.dematTransactions || [];
    const statementSummary = parsed.statementSummary || null;
    const yearlyValuation = parsed.yearlyValuation || [];
    const accountDetails = parsed.accountDetails || null;

    if (!mutualFundHoldings.length && !dematHoldings.length) {
      return res.status(422).json({
        error: "No holdings found in the uploaded CAS PDF."
      });
    }

    const totalMutualFundValue = mutualFundHoldings.reduce((acc, item) => acc + (item.value || 0), 0);
    const totalDematValue = dematHoldings.reduce((acc, item) => acc + (item.value || 0), 0);
    const totalPortfolioValue = totalMutualFundValue + totalDematValue;
    const mfPercentage = totalPortfolioValue ? (totalMutualFundValue / totalPortfolioValue) * 100 : 0;
    const dematPercentage = totalPortfolioValue ? (totalDematValue / totalPortfolioValue) * 100 : 0;
    const summary = {
      totalFunds: mutualFundHoldings.length,
      totalMutualFunds: mutualFundHoldings.length,
      totalDematSecurities: dematHoldings.length,
      totalTransactions: transactions.length + dematTransactions.length,
      totalMutualFundValue: Number(totalMutualFundValue.toFixed(2)),
      totalDematValue: Number(totalDematValue.toFixed(2)),
      totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
      allocation: {
        mutualFundPercentage: Number(mfPercentage.toFixed(2)),
        dematPercentage: Number(dematPercentage.toFixed(2))
      },
      statementSummary,
      yearlyValuation,
      accountDetails
    };
    const generatedAt = new Date().toISOString();
    const reportPayload = {
      generatedAt,
      fileMeta: {
        filename: req.file.originalname || "uploaded-cas.pdf",
        sizeBytes: req.file.size || 0
      },
      summary,
      mutualFundHoldings,
      dematHoldings,
      transactions,
      dematTransactions
    };
    const savedReport = await saveParsedReport(reportPayload);

    return res.json({
      rawText,
      // Backward-compatible field used by existing UI for MF view.
      portfolio: mutualFundHoldings,
      mutualFundHoldings,
      dematHoldings,
      transactions,
      dematTransactions,
      yearlyValuation,
      accountDetails,
      summary,
      statementSummary,
      report: {
        reportId: savedReport.reportId,
        filename: savedReport.filename,
        generatedAt,
        fetchUrl: `/api/reports/${savedReport.reportId}`,
        downloadUrl: `/api/reports/${savedReport.reportId}/download`
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/reports/:reportId", async (req, res, next) => {
  try {
    const report = await readParsedReport(req.params.reportId);
    return res.json(report.data);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({ error: "Report not found." });
    }
    return next(error);
  }
});

router.get("/reports/:reportId/download", async (req, res, next) => {
  try {
    const report = await readParsedReport(req.params.reportId);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${path.basename(report.filename)}"`
    );
    return res.send(JSON.stringify(report.data, null, 2));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return res.status(404).json({ error: "Report not found." });
    }
    return next(error);
  }
});

module.exports = router;
