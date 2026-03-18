const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

async function buildAiClientFriendlySummary({ reportData, context = {} }) {
  const normalizedContext = normalizeContext(context);
  const snapshot = buildReportSnapshot(reportData);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      ...withDeterministicSections(buildFallbackClientSummary(snapshot, normalizedContext), snapshot, normalizedContext),
      source: "fallback:no_api_key"
    };
  }

  try {
    const aiResult = await fetchClientSummaryFromOpenAI({
      apiKey,
      model: process.env.OPENAI_CLIENT_SUMMARY_MODEL || "gpt-4.1-mini",
      snapshot,
      context: normalizedContext
    });
    if (aiResult) {
      return {
        ...withDeterministicSections(aiResult, snapshot, normalizedContext),
        source: "openai"
      };
    }
  } catch (error) {
    return {
      ...withDeterministicSections(buildFallbackClientSummary(snapshot, normalizedContext), snapshot, normalizedContext),
      source: `fallback:error:${error?.message || "unknown"}`
    };
  }

  return {
    ...withDeterministicSections(buildFallbackClientSummary(snapshot, normalizedContext), snapshot, normalizedContext),
    source: "fallback:empty_ai_result"
  };
}

async function fetchClientSummaryFromOpenAI({ apiKey, model, snapshot, context }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a Relationship Manager (RM) assistant for an Indian wealth platform.",
              "Your job is to convert raw portfolio data into a clean, structured, and highly readable summary for clients.",
              "",
              "WRITING STYLE:",
              "- Use simple, clear Indian investor-friendly English",
              "- Avoid jargon, avoid technical complexity",
              "- Keep sentences short and direct",
              "- Sound professional but conversational",
              "",
              "STRICT RULES:",
              "- DO NOT give any return guarantees",
              "- DO NOT hallucinate missing data",
              "- ONLY use the provided input",
              "- If risk profile, goals, or SIP is missing, explicitly mention assumption",
              "",
              "UI FORMAT REQUIREMENTS:",
              "- Content will be displayed in cards: Summary, Analytics, Risks, Actions, RM Plan",
              "- Keep text concise and scannable",
              "- Avoid long paragraphs",
              "",
              "OUTPUT RULES:",
              "- Return ONLY valid JSON",
              "- No markdown, no explanation, no extra text",
              "",
              "CONTENT RULES:",
              "1) onePageSummary: 120-180 words max. Include total portfolio value, MF vs Demat allocation, 2-3 example holdings, and mention missing risk profile/goals if absent.",
              "2) analyticsInsights: exactly 5 bullets, each <= 18 words, numbers/data-backed only (allocation, concentration, breadth, transactions, data gaps).",
              "3) topRisks: exactly 4 bullets, each <= 18 words, data-backed only.",
              "4) topActions: exactly 4 bullets, practical and actionable.",
              "5) rmNext30Days: exactly 4 bullets, RM actions only.",
              "6) disclaimer: 1-2 lines, no performance promises."
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Generate client-friendly portfolio summary and RM next steps.",
              context,
              output_schema: {
                onePageSummary: "string",
                analyticsInsights: ["string"],
                topRisks: ["string"],
                topActions: ["string"],
                rmNext30Days: ["string"],
                disclaimer: "string"
              },
              input: snapshot
            })
          }
        ]
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`openai_http_${response.status}:${text.slice(0, 180)}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return sanitizeSummaryOutput(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

function buildFallbackClientSummary(snapshot, context) {
  const allocation = snapshot?.summary?.allocation || {};
  const totalValue = snapshot?.summary?.totalPortfolioValue || 0;
  const topHolding = snapshot?.topHoldings?.[0];
  const riskProfile = context.riskProfile || "not provided";
  const goals = context.goals?.length ? context.goals.join(", ") : "not provided";
  const horizon = context.horizonYears ? `${context.horizonYears} years` : "not provided";
  const txCount = snapshot?.summary?.totalTransactions || 0;

  const onePageSummary = [
    `Current portfolio value is INR ${formatNumber(totalValue)} as per the uploaded CAS statement.`,
    `Allocation is approximately ${formatPercent(allocation.dematPercentage)} demat and ${formatPercent(
      allocation.mutualFundPercentage
    )} mutual funds, which indicates a demat-heavy structure.`,
    topHolding
      ? `Largest visible holding is ${topHolding.name} at about ${formatPercent(topHolding.weightPct)} of total value.`
      : "Top holding concentration could not be fully derived from current data.",
    `Recorded transaction count in this period is ${txCount}.`,
    `Provided client context: risk profile (${riskProfile}), goals (${goals}), horizon (${horizon}).`
  ].join(" ");

  return {
    onePageSummary,
    analyticsInsights: buildFallbackAnalyticsInsights(snapshot, context),
    topRisks: [
      "Demat exposure is high versus mutual funds, increasing concentration sensitivity.",
      "Single holding concentration needs review against client suitability limits.",
      "Missing risk profile or goals can weaken recommendation suitability.",
      "Recent transaction pattern should be checked for short-term churn behavior."
    ],
    topActions: [
      "Confirm risk profile, goals, and horizon before final advisory discussion.",
      "Review issuer concentration and set acceptable exposure limits.",
      "Define phased rebalance priorities aligned to liquidity needs.",
      "Document suitability notes before sharing final recommendation draft."
    ],
    rmNext30Days: [
      "Conduct client profiling call and capture missing suitability details.",
      "Share concise summary and discuss concentration observations.",
      "Present phased action plan and confirm execution preference.",
      "Schedule follow-up review and track progress on agreed actions."
    ],
    disclaimer:
      "This is an AI-assisted draft for RM discussion. It is not final investment advice and requires RM review and suitability checks."
  };
}

function buildReportSnapshot(reportData) {
  const summary = reportData?.summary || {};
  const allHoldings = [
    ...(reportData?.mutualFundHoldings || []).map((row) => ({
      type: "MF",
      name: row?.scheme_name || row?.amc || "Mutual Fund Holding",
      value: Number(row?.value || 0)
    })),
    ...(reportData?.dematHoldings || []).map((row) => ({
      type: "DEMAT",
      name: row?.security_name || row?.isin || "Demat Holding",
      value: Number(row?.value || 0)
    }))
  ]
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalValue = Number(summary?.totalPortfolioValue || 0);
  const top1Pct = totalValue > 0 && allHoldings[0] ? Number(((allHoldings[0].value / totalValue) * 100).toFixed(2)) : 0;
  const top3Value = allHoldings.slice(0, 3).reduce((sum, row) => sum + row.value, 0);
  const top5Value = allHoldings.slice(0, 5).reduce((sum, row) => sum + row.value, 0);
  const top10Value = allHoldings.slice(0, 10).reduce((sum, row) => sum + row.value, 0);
  const top3Pct = totalValue > 0 ? Number(((top3Value / totalValue) * 100).toFixed(2)) : 0;
  const top5Pct = totalValue > 0 ? Number(((top5Value / totalValue) * 100).toFixed(2)) : 0;
  const top10Pct = totalValue > 0 ? Number(((top10Value / totalValue) * 100).toFixed(2)) : 0;
  const holdingCount = allHoldings.length;
  const mfHoldingCount = allHoldings.filter((row) => row.type === "MF").length;
  const dematHoldingCount = allHoldings.filter((row) => row.type === "DEMAT").length;
  const hhi = totalValue
    ? Number(
        allHoldings
          .map((row) => row.value / totalValue)
          .reduce((sum, weight) => sum + weight * weight, 0)
          .toFixed(4)
      )
    : 0;
  const assetClassAggregation = buildAssetClassAggregation(summary, totalValue);
  const topHoldings = allHoldings.slice(0, 12).map((row) => ({
    ...row,
    weightPct: totalValue > 0 ? Number(((row.value / totalValue) * 100).toFixed(2)) : 0
  }));

  return {
    generatedAt: reportData?.generatedAt || null,
    fileMeta: reportData?.fileMeta || null,
    summary: {
      totalPortfolioValue: Number(summary?.totalPortfolioValue || 0),
      totalMutualFundValue: Number(summary?.totalMutualFundValue || 0),
      totalDematValue: Number(summary?.totalDematValue || 0),
      totalTransactions: Number(summary?.totalTransactions || 0),
      allocation: summary?.allocation || null,
      statementSummary: summary?.statementSummary || null,
      assetClassBreakup: summary?.assetClassBreakup || null
    },
    analytics: {
      holdingCount,
      mfHoldingCount,
      dematHoldingCount,
      top1Pct,
      top3Pct,
      top5Pct,
      top10Pct,
      concentrationHhi: hhi,
      assetClassAggregation
    },
    topHoldings
  };
}

function sanitizeSummaryOutput(value) {
  if (!value || typeof value !== "object") return null;
  const analyticsInsights = sanitizeStringArray(value.analyticsInsights, 5);
  const topRisks = sanitizeStringArray(value.topRisks, 4);
  const topActions = sanitizeStringArray(value.topActions, 4);
  const rmNext30Days = sanitizeStringArray(value.rmNext30Days, 4);
  const onePageSummary = String(value.onePageSummary || "").trim();

  if (
    !onePageSummary ||
    analyticsInsights.length < 4 ||
    topRisks.length < 4 ||
    topActions.length < 4 ||
    rmNext30Days.length < 4
  ) {
    return null;
  }

  return {
    onePageSummary,
    analyticsInsights: analyticsInsights.slice(0, 5),
    topRisks,
    topActions,
    rmNext30Days,
    disclaimer:
      String(value.disclaimer || "").trim() ||
      "This is an AI-assisted draft and requires RM suitability review."
  };
}

function withDeterministicSections(summaryResult, snapshot, context) {
  const fallbackSummary = buildFallbackClientSummary(snapshot, context);
  const analyticsInsights = sanitizeStringArray(summaryResult?.analyticsInsights, 5);
  const assetClassAggregation = Array.isArray(summaryResult?.assetClassAggregation)
    ? summaryResult.assetClassAggregation
    : [];

  return {
    onePageSummary: String(summaryResult?.onePageSummary || "").trim() || fallbackSummary.onePageSummary,
    analyticsInsights:
      analyticsInsights.length >= 4 ? analyticsInsights.slice(0, 5) : buildFallbackAnalyticsInsights(snapshot, context),
    assetClassAggregation:
      assetClassAggregation.length > 0 ? assetClassAggregation : snapshot?.analytics?.assetClassAggregation || [],
    topRisks: sanitizeStringArray(summaryResult?.topRisks, 4).length >= 4 ? sanitizeStringArray(summaryResult?.topRisks, 4) : fallbackSummary.topRisks,
    topActions:
      sanitizeStringArray(summaryResult?.topActions, 4).length >= 4
        ? sanitizeStringArray(summaryResult?.topActions, 4)
        : fallbackSummary.topActions,
    rmNext30Days:
      sanitizeStringArray(summaryResult?.rmNext30Days, 4).length >= 4
        ? sanitizeStringArray(summaryResult?.rmNext30Days, 4)
        : fallbackSummary.rmNext30Days,
    disclaimer:
      String(summaryResult?.disclaimer || "").trim() ||
      "This is an AI-assisted draft and requires RM suitability review."
  };
}

function buildFallbackAnalyticsInsights(snapshot, context = {}) {
  const allocation = snapshot?.summary?.allocation || {};
  const analytics = snapshot?.analytics || {};
  const topAssetClass = analytics?.assetClassAggregation?.[0];
  const totalTransactions = Number(snapshot?.summary?.totalTransactions || 0);
  const missingProfile = !context?.riskProfile || context.riskProfile === "unknown";
  const missingGoals = !Array.isArray(context?.goals) || context.goals.length === 0;

  return [
    `Allocation split is ${formatPercent(allocation.dematPercentage)} demat and ${formatPercent(allocation.mutualFundPercentage)} mutual funds.`,
    `Top 3 holdings contribute ${formatPercent(analytics.top3Pct)} and top 10 contribute ${formatPercent(analytics.top10Pct)} of portfolio value.`,
    `Portfolio breadth is ${Number(analytics.holdingCount || 0)} holdings (${Number(analytics.mfHoldingCount || 0)} MF, ${Number(analytics.dematHoldingCount || 0)} demat).`,
    topAssetClass
      ? `Largest asset class is ${topAssetClass.label} at ${formatPercent(topAssetClass.percentage)} of total value.`
      : `Concentration indicator (HHI) is ${Number(analytics.concentrationHhi || 0).toFixed(4)}; higher values indicate more concentration risk.`,
    `Observed transactions in period: ${totalTransactions}. Missing profile/goals: ${missingProfile || missingGoals ? "yes" : "no"}.`
  ];
}

function buildAssetClassAggregation(summary, totalValue) {
  const rows = Array.isArray(summary?.assetClassBreakup?.rows) ? summary.assetClassBreakup.rows : [];
  const buckets = new Map();
  const denominator = totalValue > 0 ? totalValue : Number(summary?.totalPortfolioValue || 0);

  for (const row of rows) {
    const value = Number(row?.value || 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    const label = normalizeAssetClassLabel(row?.label || row?.key || "Other");
    const current = buckets.get(label) || 0;
    buckets.set(label, current + value);
  }

  let aggregated = [...buckets.entries()].map(([label, value]) => ({
    label,
    value: Number(value.toFixed(2)),
    percentage: denominator > 0 ? Number(((value / denominator) * 100).toFixed(2)) : 0
  }));

  if (!aggregated.length && denominator > 0) {
    const mfValue = Number(summary?.totalMutualFundValue || 0);
    const dematValue = Number(summary?.totalDematValue || 0);
    aggregated = [
      {
        label: "Demat Holdings",
        value: dematValue,
        percentage: denominator > 0 ? Number(((dematValue / denominator) * 100).toFixed(2)) : 0
      },
      {
        label: "Mutual Funds",
        value: mfValue,
        percentage: denominator > 0 ? Number(((mfValue / denominator) * 100).toFixed(2)) : 0
      }
    ].filter((row) => row.value > 0);
  }

  return aggregated.sort((a, b) => b.value - a.value);
}

function normalizeAssetClassLabel(rawLabel) {
  const cleaned = String(rawLabel || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Other";
  if (cleaned.includes("mutual funds held in demat")) return "Mutual Funds in Demat";
  if (cleaned.includes("mutual fund")) return "Mutual Funds";
  if (cleaned.includes("equity")) return "Equity";
  if (cleaned.includes("debt")) return "Debt";
  if (cleaned.includes("gold")) return "Gold";
  if (cleaned.includes("cash")) return "Cash / Liquid";
  return toTitleCase(cleaned);
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sanitizeStringArray(items, maxItems) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeContext(context) {
  const goalsRaw = String(context?.goals || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const dedupedGoals = [...new Set(goalsRaw)];
  const horizonYears = Number(context?.horizonYears);
  const sipCapacityMonthly = Number(context?.sipCapacityMonthly);

  return {
    riskProfile: String(context?.riskProfile || "").trim() || "unknown",
    goals: dedupedGoals,
    horizonYears: Number.isFinite(horizonYears) && horizonYears > 0 ? horizonYears : null,
    sipCapacityMonthly:
      Number.isFinite(sipCapacityMonthly) && sipCapacityMonthly >= 0 ? Number(sipCapacityMonthly.toFixed(2)) : null
  };
}

function formatPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00%";
  return `${num.toFixed(2)}%`;
}

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

module.exports = {
  buildAiClientFriendlySummary
};
