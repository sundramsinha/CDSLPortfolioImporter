const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

async function buildAiRmMeetingPrep({ reportData, context = {} }) {
  const normalizedContext = normalizeContext(context);
  const snapshot = buildReportSnapshot(reportData);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      ...buildFallbackMeetingPrep(snapshot, normalizedContext),
      source: "fallback:no_api_key"
    };
  }

  try {
    const aiResult = await fetchMeetingPrepFromOpenAI({
      apiKey,
      model: process.env.OPENAI_RM_PREP_MODEL || "gpt-4.1-mini",
      snapshot,
      context: normalizedContext
    });
    if (aiResult) {
      return {
        ...aiResult,
        source: "openai"
      };
    }
  } catch (error) {
    return {
      ...buildFallbackMeetingPrep(snapshot, normalizedContext),
      source: `fallback:error:${error?.message || "unknown"}`
    };
  }

  return {
    ...buildFallbackMeetingPrep(snapshot, normalizedContext),
    source: "fallback:empty_ai_result"
  };
}

async function fetchMeetingPrepFromOpenAI({ apiKey, model, snapshot, context }) {
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
              "You are a senior wealth Relationship Manager (RM) copilot for an Indian wealth platform.",
              "",
              "Your job is to prepare highly contextual, insight-driven meeting prep using actual portfolio data.",
              "",
              "STYLE:",
              "- Be sharp, practical, and specific",
              "- Avoid generic RM templates",
              "- Focus on what matters for THIS client",
              "",
              "STRICT RULES:",
              "- Use ONLY provided data",
              "- No return guarantees",
              "- If risk profile or goals missing, explicitly highlight as gap",
              "",
              "INTELLIGENCE LAYER:",
              "- Identify real signals from data (for example high demat %, no SIP, concentration, asset imbalance)",
              "- Convert signals into talking points, not generic advice",
              "",
              "OUTPUT RULES:",
              "- Return strict JSON only",
              "- No extra explanation",
              "",
              "CONTENT RULES:",
              "1) meetingAgenda: 5-7 items, insight-driven, must reference actual portfolio data, avoid generic phrases.",
              "2) questionsToAsk: 5-7 context-aware questions to uncover missing data (risk, goals, SIP intent).",
              "3) objectionHandling: exactly 3 realistic objections based on this portfolio, natural responses.",
              "4) decisionChecklist: 5-7 clear decisions RM needs from client, not generic steps.",
              "5) disclaimer: short, compliant, no promises."
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "Create RM meeting prep from parsed CAS data.",
              context,
              output_schema: {
                meetingAgenda: ["string"],
                questionsToAsk: ["string"],
                objectionHandling: [
                  {
                    likelyObjection: "string",
                    response: "string"
                  }
                ],
                decisionChecklist: ["string"],
                disclaimer: "string"
              },
              constraints: [
                "Use only provided data and context.",
                "No return guarantees or performance promises.",
                "meetingAgenda must be 5 to 7 items.",
                "questionsToAsk must be 5 to 7 items.",
                "decisionChecklist must be 5 to 7 items.",
                "objectionHandling must contain exactly 3 pairs."
              ],
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
    return sanitizeMeetingPrepOutput(parsed);
  } finally {
    clearTimeout(timeout);
  }
}

function buildFallbackMeetingPrep(snapshot, context) {
  const totalValue = Number(snapshot?.summary?.totalPortfolioValue || 0);
  const allocation = snapshot?.summary?.allocation || {};
  const topHolding = snapshot?.topHoldings?.[0];
  const riskProfile = context.riskProfile || "unknown";

  return {
    meetingAgenda: [
      `Confirm client profile details and risk appetite (current: ${riskProfile}).`,
      `Review current portfolio value (INR ${formatNumber(totalValue)}) and allocation split.`,
      `Discuss concentration and diversification, starting with top holdings.`,
      "Validate near-term liquidity needs and emergency corpus requirements.",
      "Agree on action priorities for next 30 days and communication cadence."
    ],
    questionsToAsk: [
      "What are your top financial goals and target timelines?",
      "How much temporary downside are you comfortable with?",
      "Any cash-flow needs expected in the next 6 to 12 months?",
      "Do you want growth focus, stability focus, or a balanced path?",
      "Do you prefer phased changes or immediate portfolio adjustments?",
      "Any holdings you do not want to exit for personal reasons?"
    ],
    objectionHandling: [
      {
        likelyObjection: "I do not want to change current holdings now.",
        response:
          "Suggest a phased approach with small rebalancing steps and periodic review instead of abrupt changes."
      },
      {
        likelyObjection: "I am worried about market timing.",
        response:
          "Focus on allocation discipline and staged execution rather than predicting short-term market moves."
      },
      {
        likelyObjection: "I only want high-return options.",
        response:
          "Explain trade-off between return and risk, then align recommendations with suitability and goal timeline."
      }
    ],
    decisionChecklist: [
      "Risk profile and goals confirmed with client.",
      `Allocation reviewed (demat ${formatPercent(allocation.dematPercentage)}, MF ${formatPercent(
        allocation.mutualFundPercentage
      )}).`,
      topHolding
        ? `Concentration review completed for top holding: ${topHolding.name}.`
        : "Concentration review completed for top holdings.",
      "Client approved preferred execution style (phased or immediate).",
      "RM final recommendation documented and compliance disclaimer communicated."
    ],
    disclaimer:
      "This is an AI-assisted RM preparation draft. Final discussion and advice must follow RM suitability and compliance review."
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
  const topHoldings = allHoldings.slice(0, 10).map((row) => ({
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
      statementSummary: summary?.statementSummary || null
    },
    topHoldings
  };
}

function sanitizeMeetingPrepOutput(value) {
  if (!value || typeof value !== "object") return null;
  const meetingAgenda = sanitizeStringArray(value.meetingAgenda, 8);
  const questionsToAsk = sanitizeStringArray(value.questionsToAsk, 8);
  const decisionChecklist = sanitizeStringArray(value.decisionChecklist, 8);
  const objectionHandling = sanitizeObjectionHandling(value.objectionHandling, 3);

  if (!meetingAgenda.length || !questionsToAsk.length || !decisionChecklist.length || !objectionHandling.length) {
    return null;
  }

  return {
    meetingAgenda,
    questionsToAsk,
    objectionHandling,
    decisionChecklist,
    disclaimer:
      String(value.disclaimer || "").trim() ||
      "AI-assisted RM prep draft. RM suitability review required before advice."
  };
}

function sanitizeStringArray(items, maxItems) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeObjectionHandling(items, maxItems) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      likelyObjection: String(item?.likelyObjection || "").trim(),
      response: String(item?.response || "").trim()
    }))
    .filter((item) => item.likelyObjection && item.response)
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
  buildAiRmMeetingPrep
};
