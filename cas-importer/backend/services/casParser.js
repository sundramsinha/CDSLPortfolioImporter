function parseCasPortfolio(text) {
  if (!text) {
    return {
      mutualFundHoldings: [],
      dematHoldings: [],
      transactions: [],
      dematTransactions: [],
      statementSummary: null,
      assetClassBreakup: null,
      consolidatedPortfolioSummary: null,
      yearlyValuation: [],
      accountDetails: null
    };
  }

  const compactText = normalize(text);
  const mutualFundHoldings = dedupeMutualHoldings(parseCdslCasMutualHoldings(compactText));
  const dematHoldings = dedupeDematHoldings(parseCdslDematHoldings(compactText));
  const transactions = dedupeTransactions(parseCdslMutualFundTransactions(text));
  const dematTransactions = dedupeDematTransactions(
    applyDematTransactionCarryForward(parseCdslDematTransactions(text))
  );
  const statementSummary = parseCdslStatementSummary(compactText);
  const assetClassBreakup = parseCdslAssetClassBreakup(compactText);
  const consolidatedPortfolioSummary = parseCdslConsolidatedPortfolioSummary(compactText);
  const yearlyValuation = parseCdslYearlyValuation(compactText);
  const accountDetails = parseCdslAccountDetails(compactText);

  if (mutualFundHoldings.length || dematHoldings.length || transactions.length || dematTransactions.length) {
    return {
      mutualFundHoldings,
      dematHoldings,
      transactions,
      dematTransactions,
      statementSummary,
      assetClassBreakup,
      consolidatedPortfolioSummary,
      yearlyValuation,
      accountDetails
    };
  }

  // Fallback parser for non-CDSL (or line-friendly) CAS formats.
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const fallbackHoldings = [];
  const blockSize = 18;

  for (let i = 0; i < lines.length; i += 1) {
    const blockLines = lines.slice(i, i + blockSize);
    if (!blockLines.length) continue;
    const blockText = blockLines.join("\n");

    const folioMatch = blockText.match(/Folio\s*No[:\s\-]*([A-Za-z0-9\/\-]+)/i);
    const unitsMatch = blockText.match(/Units\s*[:\s\-]*([0-9,]+(?:\.[0-9]+)?)/i);
    const navMatch = blockText.match(/NAV\s*[:\s\-]*([0-9,]+(?:\.[0-9]+)?)/i);
    const valueMatch = blockText.match(/(?:Current\s*Value|Value)\s*[:\s\-]*₹?\s*([0-9,]+(?:\.[0-9]+)?)/i);

    if (!folioMatch || !unitsMatch || !navMatch || !valueMatch) continue;

    fallbackHoldings.push({
      amc: extractAmc(blockLines),
      scheme_name: extractSchemeName(blockLines, ""),
      folio_number: folioMatch[1].trim(),
      units: toNumber(unitsMatch[1]),
      nav: toNumber(navMatch[1]),
      value: toNumber(valueMatch[1])
    });
  }

  return {
    mutualFundHoldings: dedupeMutualHoldings(fallbackHoldings),
    dematHoldings: [],
    transactions: [],
    dematTransactions: [],
    statementSummary,
    assetClassBreakup,
    consolidatedPortfolioSummary,
    yearlyValuation,
    accountDetails
  };
}

function parseCdslConsolidatedPortfolioSummary(compactText) {
  const start = compactText.search(/Your Demat Account and Mutual Fund Folios/i);
  if (start < 0) return null;

  const tail = compactText.slice(start);
  const endRelative = tail.search(
    /Consolidated Portfolio Valuation for Year|Summary of Investments|MUTUAL FUND UNITS HELD WITH MF\/RTA/i
  );
  const section = endRelative > 0 ? tail.slice(0, endRelative) : tail.slice(0, 2200);
  const normalizedSection = normalize(section);
  if (!/Account Type\s+Account Details\s+No\. of ISINs\/ Schemes\s+Value in/i.test(normalizedSection)) {
    return null;
  }

  const holderMatch = normalizedSection.match(/In the single name of\s+(.+?)\s+\(\s*PAN\s*:\s*([A-Z0-9]+)\s*\)/i);
  const holderName = holderMatch ? normalize(holderMatch[1]) : null;
  const pan = holderMatch ? normalize(holderMatch[2]).toUpperCase() : null;

  const rows = [];
  const accountRowRegex =
    /(CDSL Demat Account|NSDL Demat Account)\s+(.+?)\s+([0-9]+)\s+([0-9,]+(?:\.[0-9]+)?)(?=\s+(?:CDSL Demat Account|NSDL Demat Account|Mutual Fund Folios|Total|Grand Total)\b)/gi;
  let accountMatch;
  while ((accountMatch = accountRowRegex.exec(normalizedSection)) !== null) {
    rows.push({
      accountType: normalize(accountMatch[1]),
      accountDetails: normalize(accountMatch[2]),
      schemesCount: toNumber(accountMatch[3]),
      value: toNumber(accountMatch[4])
    });
  }

  const mfRowMatch = normalizedSection.match(
    /Mutual Fund Folios\s+([0-9]+)\s+Folios\s+([0-9]+)\s+([0-9,]+(?:\.[0-9]+)?)(?=\s+(?:Total|Grand Total)\b)/i
  );
  if (mfRowMatch) {
    rows.push({
      accountType: "Mutual Fund Folios",
      accountDetails: `${normalize(mfRowMatch[1])} Folios`,
      schemesCount: toNumber(mfRowMatch[2]),
      value: toNumber(mfRowMatch[3])
    });
  } else {
    const mfSimpleMatch = normalizedSection.match(
      /Mutual Fund Folios\s+([0-9]+)\s+([0-9,]+(?:\.[0-9]+)?)(?=\s+(?:Total|Grand Total)\b)/i
    );
    if (mfSimpleMatch) {
      rows.push({
        accountType: "Mutual Fund Folios",
        accountDetails: `${normalize(mfSimpleMatch[1])} Folios`,
        schemesCount: toNumber(mfSimpleMatch[1]),
        value: toNumber(mfSimpleMatch[2])
      });
    }
  }

  const totalMatch = normalizedSection.match(/\bTotal\s+([0-9,]+(?:\.[0-9]+)?)/i);
  const grandTotalMatch = normalizedSection.match(/\bGrand Total\s+([0-9,]+(?:\.[0-9]+)?)/i);
  const totalValue = totalMatch ? toNumber(totalMatch[1]) : null;
  const grandTotalValue = grandTotalMatch ? toNumber(grandTotalMatch[1]) : null;

  if (!rows.length && totalValue === null && grandTotalValue === null) return null;

  return {
    holderName,
    pan,
    rows,
    totalValue,
    grandTotalValue
  };
}

function parseCdslAssetClassBreakup(compactText) {
  const sectionMatch = compactText.match(
    /Asset Class\s+Value\s+Percentage\s+(.{0,600}?)\s+Total\s+([0-9,]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)/i
  );
  if (!sectionMatch) return null;

  const body = normalize(sectionMatch[1]);
  const totalPortfolioValue = toNumber(sectionMatch[2]);
  const totalPercentage = toNumber(sectionMatch[3]);
  const rows = [
    parseAssetClassRow(body, "Equity", "equity"),
    parseAssetClassRow(body, "Mutual Fund Folios", "mutualFundFolios"),
    parseAssetClassRow(body, "Mutual Funds Held in Demat Form", "mutualFundsHeldInDematForm")
  ].filter(Boolean);

  if (!rows.length && totalPortfolioValue === null) return null;

  return {
    rows,
    totalPortfolioValue,
    totalPercentage
  };
}

function parseAssetClassRow(sectionBody, label, key) {
  const regex = new RegExp(
    `${escapeRegex(label)}\\s+([0-9,]+(?:\\.[0-9]+)?)\\s+([0-9]+(?:\\.[0-9]+)?)`,
    "i"
  );
  const match = sectionBody.match(regex);
  if (!match) return null;

  return {
    key,
    label,
    value: toNumber(match[1]),
    percentage: toNumber(match[2])
  };
}

function parseCdslYearlyValuation(compactText) {
  const start = compactText.search(/Consolidated Portfolio Valuation for Year|Portfolio Valuation for Year/i);
  if (start < 0) return [];

  const tail = compactText.slice(start);
  const endRelative = tail.search(/Summary of Investments|MUTUAL FUND UNITS HELD|AMC Name\s*:/i);
  const section = endRelative > 0 ? tail.slice(0, endRelative) : tail.slice(0, 5000);

  const rowRegex =
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+([0-9]{4})\s+(-?[0-9,]+(?:\.[0-9]+)?)(?:\s+(-?[0-9,]+(?:\.[0-9]+)?))?(?:\s+(-?[0-9]+(?:\.[0-9]+)?))?/gi;

  const rowsByMonth = new Map();
  let match;
  while ((match = rowRegex.exec(section)) !== null) {
    const month = normalize(match[1]);
    const year = Number(match[2]);
    const portfolioValue = toNumber(match[3]);
    const changeValue = toNumber(match[4]);
    const changePercent = toNumber(match[5]);

    if (!month || !year || portfolioValue === null || portfolioValue <= 0) continue;
    if (year < 2000 || year > 2100) continue;

    const key = `${month} ${year}`;
    const candidate = {
      month,
      year,
      monthYear: key,
      portfolioValue,
      changeValue,
      changePercent
    };
    const richness = (changeValue !== null ? 1 : 0) + (changePercent !== null ? 1 : 0);

    const existing = rowsByMonth.get(key);
    if (!existing || richness >= existing.__richness) {
      rowsByMonth.set(key, { ...candidate, __richness: richness });
    }
  }

  const monthOrder = {
    Jan: 1,
    Feb: 2,
    Mar: 3,
    Apr: 4,
    May: 5,
    Jun: 6,
    Jul: 7,
    Aug: 8,
    Sep: 9,
    Oct: 10,
    Nov: 11,
    Dec: 12
  };

  return [...rowsByMonth.values()]
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return (monthOrder[a.month] || 0) - (monthOrder[b.month] || 0);
    })
    .map(({ __richness, ...row }) => row);
}

function parseCdslAccountDetails(compactText) {
  const hasAccountSection = /Account Details/i.test(compactText);
  if (!hasAccountSection) return null;

  const panMatch = compactText.match(/\bPAN\s*:\s*([A-Z0-9]{10})\b/i);
  const holderMatch = compactText.match(/Account Details\s+([A-Z][A-Z .]{2,}?)\s+PAN\s*:/i);
  const primaryHolderName = holderMatch
    ? normalize(holderMatch[1]).replace(/^Account Details\s+/i, "").trim()
    : null;
  const pan = panMatch ? normalize(panMatch[1]).toUpperCase() : null;

  const dematAccounts = [];
  const dematSectionStart = compactText.search(/CDSL Demat Accounts/i);
  const dematTail = dematSectionStart >= 0 ? compactText.slice(dematSectionStart) : compactText;
  const dematSectionEnd = dematTail.search(/\s+MF Folios\b/i);
  const dematSection = dematSectionEnd > 0 ? dematTail.slice(0, dematSectionEnd) : dematTail;
  const dematBlockRegex = /DP Name\s*:\s*.+?(?=\s+DP Name\s*:|\s+MF Folios\b|$)/gi;
  let dematBlockMatch;
  while ((dematBlockMatch = dematBlockRegex.exec(dematSection)) !== null) {
    const block = normalize(dematBlockMatch[0]);
    const dpName = cleanExtractedValue(extractLabelValue(block, "DP Name", ["DP ID", "CLIENT ID"]));
    const dpId = cleanExtractedValue(extractLabelValue(block, "DP ID", ["CLIENT ID"]));
    const clientId = cleanExtractedValue(extractLabelValue(block, "CLIENT ID", ["Email Id"]));
    const email = cleanExtractedValue(extractLabelValue(block, "Email Id", ["Mobile No"]));
    const mobile = cleanExtractedValue(extractLabelValue(block, "Mobile No", ["BO Sub Status"]));
    const boSubStatus = cleanExtractedValue(extractLabelValue(block, "BO Sub Status", ["BSDA"]));
    const bsda = cleanExtractedValue(extractLabelValue(block, "BSDA", ["Nominee"]));
    const nominee = cleanExtractedValue(
      extractLabelValue(block, "Nominee", ["RGESS", "Account Status", "Frozen Status", "BO Status"])
    );
    const rgess = cleanExtractedValue(extractLabelValue(block, "RGESS", ["Account Status"]));
    const accountStatus = cleanExtractedValue(
      extractLabelValue(block, "Account Status", ["BO Status", "Frozen Status", "Nominee"])
    );
    const frozenStatus = cleanExtractedValue(
      extractLabelValue(block, "Frozen Status", ["BO Status", "Nominee", "Account Status"])
    );
    const boStatus = cleanExtractedValue(extractLabelValue(block, "BO Status", ["Frozen Status", "Nominee"]));

    if (!dpName && !dpId && !clientId) continue;

    dematAccounts.push({
      dpName,
      dpId,
      clientId,
      email,
      mobile,
      boSubStatus,
      bsda,
      nominee,
      rgess,
      accountStatus,
      frozenStatus,
      boStatus
    });
  }

  const mutualFundFolios = [];
  const mfBlockRegex =
    /AMC Name\s*:\s*.+?(?=\s+AMC Name\s*:|\s+Consolidated Portfolio Valuation for Year|\s+MUTUAL FUND UNITS HELD WITH MF\/RTA|\s+Central Depository Services\s*\(India\)\s*Limited|\s+\(CAS\)\s+FOR\s+SECURITIES\s+HELD\s+IN\s+DEMAT\s+FORM|\s+CONSOLIDATED ACCOUNT STATEMENT|$)/gi;
  let mfBlockMatch;
  while ((mfBlockMatch = mfBlockRegex.exec(compactText)) !== null) {
    const block = normalize(mfBlockMatch[0]);
    const amcName = cleanExtractedValue(extractLabelValue(block, "AMC Name", ["Scheme Name"]));
    const schemeName = cleanExtractedValue(extractLabelValue(block, "Scheme Name", ["Scheme Code"]));
    const schemeCode = extractLabelValue(block, "Scheme Code", ["Folio No"]);
    const folioNo = extractLabelValue(block, "Folio No", ["Mode of Holding"]);
    const modeOfHolding = extractLabelValue(block, "Mode of Holding", ["Email id"]);
    const email = extractLabelValue(block, "Email id", ["KYC of Investor/s"]);
    const kycStatus = extractLabelValue(block, "KYC of Investor/s", ["Mobile No"]);
    const mobile = extractLabelValue(block, "Mobile No", ["Nominee"]);
    const nominee = extractLabelValue(block, "Nominee", ["ISIN"]);
    const isin = extractLabelValue(block, "ISIN", ["UCC"]);
    const ucc = extractLabelValue(block, "UCC", ["RTA"]);
    const rta = extractLabelValue(block, "RTA");

    if (!schemeCode && !folioNo && !isin) continue;

    mutualFundFolios.push({
      amcName,
      schemeName,
      schemeCode,
      folioNo,
      modeOfHolding,
      email,
      kycStatus,
      mobile,
      nominee,
      isin,
      ucc,
      rta
    });
  }

  if (!pan && !dematAccounts.length && !mutualFundFolios.length) return null;

  return {
    primaryHolderName,
    pan,
    dematAccounts,
    mutualFundFolios,
    totals: {
      dematAccounts: dematAccounts.length,
      mutualFundFolios: mutualFundFolios.length
    }
  };
}

function extractLabelValue(block, label, nextLabels = []) {
  const boundary = nextLabels.length
    ? `(?=(?:\\s+)?(?:${nextLabels.map((item) => escapeRegex(item)).join("|")})\\s*:|$)`
    : "(?=$)";
  const regex = new RegExp(`${escapeRegex(label)}\\s*:\\s*(.*?)${boundary}`, "i");
  const match = String(block || "").match(regex);
  if (!match) return "";
  return normalize(match[1]);
}

function cleanExtractedValue(value) {
  let cleaned = normalize(value);
  if (!cleaned) return "";
  cleaned = cleaned.replace(/\|/g, " ").replace(/\s+/g, " ").trim();

  const noiseRegex =
    /(Central Depository Services\s*\(India\)\s*Limited|CONSOLIDATED ACCOUNT STATEMENT|\(CAS\)\s+FOR\s+SECURITIES\s+HELD\s+IN\s+DEMAT\s+FORM|स)/i;
  const noiseIndex = cleaned.search(noiseRegex);
  if (noiseIndex > 0) {
    cleaned = cleaned.slice(0, noiseIndex).trim();
  }

  return cleaned;
}

function parseCdslStatementSummary(compactText) {
  const summarySection = getSummarySection(compactText);
  const hasSummarySection = /summary of investments/i.test(compactText);
  const tableValues = extractSummaryTableValues(summarySection);
  const entries = extractSummaryEntries(summarySection);
  const cdslDemat =
    tableValues?.cdslDematAccounts || extractSummaryValue(summarySection, "CDSL Demat Accounts");
  const nsdlDemat =
    tableValues?.nsdlDematAccounts || extractSummaryValue(summarySection, "NSDL Demat Accounts");
  const mutualFundFolios =
    tableValues?.mutualFundFolios || extractSummaryValue(summarySection, "Mutual Fund Folios");
  const totalPortfolio =
    tableValues?.totalPortfolioValue || extractSummaryValue(summarySection, "Total Portfolio Value");
  const asOnDateMatch = compactText.match(/\bTO\s+([0-9]{2}-[0-9]{2}-[0-9]{4})\b/i);

  if (
    !hasSummarySection &&
    cdslDemat.raw === null &&
    nsdlDemat.raw === null &&
    mutualFundFolios.raw === null &&
    totalPortfolio.raw === null &&
    !asOnDateMatch
  ) {
    return null;
  }

  return {
    statementAsOnDate: asOnDateMatch ? normalize(asOnDateMatch[1]) : null,
    values: {
      cdslDematAccounts: cdslDemat.value,
      nsdlDematAccounts: nsdlDemat.value,
      mutualFundFolios: mutualFundFolios.value,
      totalPortfolioValue: totalPortfolio.value
    },
    entries,
    rawTokens: {
      cdslDematAccounts: cdslDemat.raw,
      nsdlDematAccounts: nsdlDemat.raw,
      mutualFundFolios: mutualFundFolios.raw,
      totalPortfolioValue: totalPortfolio.raw
    }
  };
}

function getSummarySection(compactText) {
  const start = compactText.search(/Summary of Investments/i);
  if (start < 0) return compactText;
  const tail = compactText.slice(start);
  const endRelative = tail.search(/\*\s*No Demat Account|AMC Name\s*:|Scheme Name\s*:/i);
  return endRelative > 0 ? tail.slice(0, endRelative) : tail.slice(0, 1800);
}

function extractSummaryTableValues(summarySection) {
  const valueToken = "(N\\.?A\\.?|--|[0-9,]+(?:\\.[0-9]+)?)";
  const labelBlock = "CDSL Demat Accounts\\s+NSDL Demat Accounts\\s*\\*?\\s+Mutual Fund Folios";
  const strictTableRegex = new RegExp(
    `${labelBlock}\\s+${valueToken}\\s+${valueToken}\\s+${valueToken}(?:\\s+Click Here)?\\s+Total Portfolio Value\\s+${valueToken}`,
    "i"
  );
  const strictMatch = summarySection.match(strictTableRegex);
  if (strictMatch) {
    return {
      cdslDematAccounts: tokenToSummaryValue(strictMatch[1]),
      nsdlDematAccounts: tokenToSummaryValue(strictMatch[2]),
      mutualFundFolios: tokenToSummaryValue(strictMatch[3]),
      totalPortfolioValue: tokenToSummaryValue(strictMatch[4])
    };
  }

  const relaxedRegex = new RegExp(
    `${labelBlock}\\s+(.{0,260}?)\\s+Total Portfolio Value\\s+${valueToken}`,
    "i"
  );
  const relaxedMatch = summarySection.match(relaxedRegex);
  if (!relaxedMatch) return null;
  const tokens = (relaxedMatch[1].match(new RegExp(valueToken, "gi")) || []).slice(0, 3);
  if (tokens.length < 3) return null;

  return {
    cdslDematAccounts: tokenToSummaryValue(tokens[0]),
    nsdlDematAccounts: tokenToSummaryValue(tokens[1]),
    mutualFundFolios: tokenToSummaryValue(tokens[2]),
    totalPortfolioValue: tokenToSummaryValue(relaxedMatch[2])
  };
}

function extractSummaryEntries(summarySection) {
  const section = normalize(summarySection);
  if (!section) return [];

  const valueToken = "(N\\.?A\\.?|--|[0-9,]+(?:\\.[0-9]+)?)";
  const entryRegex = new RegExp(
    `([A-Za-z][A-Za-z .,'&\\/-]{2,}?)\\s+CDSL Demat Accounts\\s+NSDL Demat Accounts\\s*\\*?\\s+Mutual Fund Folios\\s+${valueToken}\\s+${valueToken}\\s+${valueToken}(?:\\s+Click Here)?`,
    "gi"
  );

  const output = [];
  const seen = new Set();
  let match;
  while ((match = entryRegex.exec(section)) !== null) {
    const holderName = cleanSummaryHolderName(match[1]);
    const cdslDemat = tokenToSummaryValue(match[2]);
    const nsdlDemat = tokenToSummaryValue(match[3]);
    const mutualFundFolios = tokenToSummaryValue(match[4]);
    const dedupeKey = `${holderName}|${cdslDemat.raw}|${nsdlDemat.raw}|${mutualFundFolios.raw}`;
    if (!holderName || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    output.push({
      holderName,
      values: {
        cdslDematAccounts: cdslDemat.value,
        nsdlDematAccounts: nsdlDemat.value,
        mutualFundFolios: mutualFundFolios.value
      },
      rawTokens: {
        cdslDematAccounts: cdslDemat.raw,
        nsdlDematAccounts: nsdlDemat.raw,
        mutualFundFolios: mutualFundFolios.raw
      }
    });
  }
  return output;
}

function cleanSummaryHolderName(value) {
  return normalize(value)
    .replace(/^View Statement\s+/i, "")
    .replace(/^Name\/Joint Name\s*\(s\)\s*/i, "")
    .replace(/\s+Portfolio Valuation.*$/i, "")
    .trim();
}

function extractSummaryValue(compactText, label) {
  const pattern = new RegExp(
    `${escapeRegex(label)}\\*?\\s*[:\\-]?\\s*(?:₹\\s*)?(N\\.?A\\.?|--|[0-9,]+(?:\\.[0-9]+)?)`,
    "i"
  );
  const match = compactText.match(pattern);
  if (!match) {
    return { raw: null, value: null };
  }

  return tokenToSummaryValue(match[1]);
}

function tokenToSummaryValue(token) {
  const raw = normalize(token);
  if (!raw || /^N\\.?A\\.?$/i.test(raw) || raw === "--") {
    return { raw: raw || null, value: null };
  }
  return { raw, value: toNumber(raw) };
}

function extractAmc(blockLines) {
  const amcLine = blockLines.find((line) => /mutual fund/i.test(line));
  return amcLine ? normalize(amcLine) : "";
}

function extractSchemeName(blockLines, amc) {
  const candidates = blockLines.filter((line) => {
    const lower = line.toLowerCase();
    const noisy = /(folio|units|nav|value|current value|pan|isin)/i.test(line);
    const schemeSignal = /(fund|scheme|direct|regular|growth|plan)/i.test(lower);
    return !noisy && schemeSignal;
  });

  const best = candidates.find((line) => normalize(line) !== normalize(amc)) || candidates[0];
  return best ? normalize(best) : "";
}

function toNumber(value) {
  if (!value) return null;
  const num = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

function normalize(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeMutualHoldings(holdings) {
  const seen = new Set();
  const output = [];

  holdings.forEach((item) => {
    const key = `${item.amc}|${item.scheme_name}|${item.folio_number}|${item.units}|${item.nav}|${item.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });

  return output;
}

function parseCdslCasMutualHoldings(compactText) {
  const amcMap = extractAmcSchemeFolioMap(compactText);
  const holdings = [];

  // Parse only the valuation table area to avoid accidental matches from
  // statement headers (which may contain date patterns like 01-02-2026).
  const sectionStart = compactText.search(/Scheme Name\s+ISIN\s+Folio No\.?\s+Closing Bal/i);
  const sectionEnd = compactText.search(/Grand Total\s+[0-9,]+\.[0-9]+/i);
  const tableSection =
    sectionStart >= 0
      ? compactText.slice(sectionStart, sectionEnd > sectionStart ? sectionEnd : undefined)
      : compactText;

  const rowRegex =
    /([A-Z0-9]{2,6})\s*-\s*(.+?)\s+INF[0-9A-Z ]{9,16}\s+([0-9A-Za-z\/]+)\s+([0-9,]*\.?[0-9]+)\s+([0-9,]*\.?[0-9]+)\s+([0-9,]*\.?[0-9]+)\s+([0-9,]*\.?[0-9]+)/g;

  let match;
  while ((match = rowRegex.exec(tableSection)) !== null) {
    const schemeCode = normalize(match[1]);
    const schemeName = normalize(match[2]);
    const folio = normalize(match[3]);
    const units = toNumber(match[4]);
    const nav = toNumber(match[5]);
    const value = toNumber(match[7]);

    // Filters table-like false positives from non-holding sections.
    if (!schemeName || !folio || units === null || nav === null || value === null) continue;
    if (!/[A-Z]/.test(schemeCode)) continue;
    if (schemeName.length > 180) continue;
    if (/central depository|summary of investments|statement of transactions/i.test(schemeName)) continue;
    if (value <= 0 || units < 0) continue;

    const mapping = amcMap.get(`${schemeCode}|${folio}`);
    holdings.push({
      amc: mapping?.amc || "",
      scheme_name: mapping?.schemeName || schemeName,
      folio_number: folio,
      units,
      nav,
      value
    });
  }

  // Second deterministic pass:
  // some rows are skipped in the generic table scan when PDF text merging
  // introduces subtle token breakpoints. Anchor by schemeCode + folio to recover.
  const existingKeys = new Set(holdings.map((item) => `${item.scheme_name}|${item.folio_number}`));
  for (const [, mapping] of amcMap.entries()) {
    const schemeName = mapping.schemeName;
    const folio = mapping.folio;
    if (!schemeName || !folio) continue;
    const lookupKey = `${schemeName}|${folio}`;
    if (existingKeys.has(lookupKey)) continue;

    const recovered = extractHoldingByFolioAndSchemeName(tableSection, schemeName, folio);
    if (!recovered) continue;

    holdings.push({
      amc: mapping.amc || "",
      scheme_name: schemeName,
      folio_number: folio,
      units: recovered.units,
      nav: recovered.nav,
      value: recovered.value
    });
  }

  return holdings;
}

function parseCdslDematHoldings(compactText) {
  const sections = extractDematHoldingSections(compactText);
  if (!sections.length) return [];
  const holdings = [];
  for (const section of sections) {
    const rows = parseDematHoldingRows(section.text, section.accountKey);
    for (const row of rows) holdings.push(row);
  }
  return holdings;
}

function extractDematHoldingSections(compactText) {
  const sections = [];
  const blockRegex = /HOLDING STATEMENT AS ON\s+[0-9]{2}-[0-9]{2}-[0-9]{4}/gi;
  let blockMatch;
  let accountIndex = 0;
  while ((blockMatch = blockRegex.exec(compactText)) !== null) {
    const tail = compactText.slice(blockMatch.index);
    const tableStartRelative = tail.search(/ISIN\s+Security\s+Current Bal\s+Frozen Bal/i);
    if (tableStartRelative < 0) continue;
    const rowsStart = blockMatch.index + tableStartRelative;
    const rowsTail = compactText.slice(rowsStart);
    const tableEndRelative = rowsTail.search(/Portfolio Value\s*`?\s*[0-9,]+\.[0-9]+/i);
    if (tableEndRelative < 0) continue;
    const section = normalize(rowsTail.slice(0, tableEndRelative));
    if (!section) continue;
    accountIndex += 1;
    sections.push({ text: section, accountKey: `dp-${accountIndex}` });
  }

  if (sections.length) return sections;
  const start = compactText.search(/ISIN\s+Security\s+Current Bal\s+Frozen Bal/i);
  if (start < 0) return [];
  return [{ text: compactText.slice(start), accountKey: "dp-1" }];
}

function parseDematHoldingRows(section, accountKey = "dp-1") {
  const holdings = [];
  const rowBlockRegex = /\b(IN[EF][0-9A-Z]{9,10})\b([\s\S]*?)(?=\bIN[EF][0-9A-Z]{9,10}\b|$)/gi;
  let blockMatch;
  while ((blockMatch = rowBlockRegex.exec(section)) !== null) {
    const isin = normalize(blockMatch[1]);
    const blockText = normalize(blockMatch[2]);
    if (!isin || !blockText) continue;
    const tailMatch = blockText.match(
      /^(.+?)\s+(--|[0-9,]*\.?[0-9]+)\s+(--|[0-9,]*\.?[0-9]+)\s+(--|[0-9,]*\.?[0-9]+)\s+(--|[0-9,]*\.?[0-9]+)\s+(--|[0-9,]*\.?[0-9]+)\s+([0-9,]*\.?[0-9]+)\s+([0-9,]*\.?[0-9]+)(?:\s|$)/
    );
    if (!tailMatch) continue;

    const securityName = cleanDematSecurityName(tailMatch[1], isin);
    const inferredAmc = inferInfDematAmcName(securityName, isin);
    const currentBalanceToken = normalize(tailMatch[2]);
    const freeBalance = toNumber(tailMatch[6]);
    const marketPrice = toNumber(tailMatch[7]);
    const value = toNumber(tailMatch[8]);
    const quantity =
      toNumber(tailMatch[2]) ??
      freeBalance ??
      (currentBalanceToken === "--" && value !== null && value === 0 ? 0 : null);

    if (!securityName || !isin) continue;
    if (quantity === null || quantity < 0) continue;
    if (marketPrice === null || value === null || value < 0) continue;

    holdings.push({
      isin,
      security_name: securityName,
      amc: inferredAmc,
      account_key: accountKey,
      quantity,
      free_balance: freeBalance,
      market_price: marketPrice,
      value
    });
  }
  return holdings;
}

function cleanDematSecurityName(rawSecurityName, isin = "") {
  const isInfIsin = /^INF/i.test(String(isin || ""));
  let name = normalize(rawSecurityName);
  if (!isInfIsin) {
    name = name.replace(/#/g, "");
  }
  if (!name) return "";

  name = name.split(/\bIN[EF][0-9A-Z]{9,10}\b/i)[0];
  name = name.split(/\bISIN\b/i)[0];
  name = name.replace(/\s+--\s+--\s+--\s+--\s+--.*$/i, "");

  return normalize(name);
}

function inferInfDematAmcName(securityName, isin) {
  if (!/^INF/i.test(String(isin || ""))) return null;
  const text = normalize(securityName);
  if (!text) return null;
  const hashPrefix = normalize(text.split("#")[0]);
  if (hashPrefix) return hashPrefix;
  const mfSplit = text.split(/\bMF\b/i);
  const mfPrefix = normalize(mfSplit[0]);
  return mfPrefix || null;
}

function parseCdslMutualFundTransactions(text) {
  const compactText = normalize(text);
  const txStart = compactText.search(/MUTUAL FUND UNITS HELD WITH MF\/RTA/i);
  const txEnd = compactText.search(/MUTUAL FUND UNITS HELD AS ON/i);
  if (txStart < 0 || txEnd <= txStart) return [];

  const txSection = compactText.slice(txStart, txEnd);
  const amcAnchors = [];
  const amcRegex = /([A-Za-z&. ]+Mutual Fund)/gi;
  let amcMatch;
  while ((amcMatch = amcRegex.exec(txSection)) !== null) {
    amcAnchors.push({ index: amcMatch.index, amc: cleanAmcName(amcMatch[1]) });
  }

  const blocks = [];
  const subBlockRegex =
    /\b([A-Z0-9]{2,6})\b\s*-\s+((?:(?!\s+ISIN\s*:).)+?)\s+ISIN\s*:\s*([A-Z0-9]+)\s+UCC\s*:\s*.*?(?=(?:\s+\b[A-Z0-9]{2,6}\b\s*-\s+(?:(?!\s+ISIN\s*:).)+?\s+ISIN\s*:)|\s+MUTUAL FUND UNITS HELD AS ON|\s+CDSL Demat Accounts|\s+Account Details|$)/g;

  let subBlockMatch;
  while ((subBlockMatch = subBlockRegex.exec(txSection)) !== null) {
    blocks.push({
      amc: resolveAmcForIndex(amcAnchors, subBlockMatch.index),
      scheme_code: normalize(subBlockMatch[1]),
      scheme_name: normalize(subBlockMatch[2]),
      isin: normalize(subBlockMatch[3]).replace(/\s+/g, ""),
      opening_balance: extractTxnBalanceFromCompactBlock(subBlockMatch[0], "Opening Balance"),
      closing_balance: extractTxnBalanceFromCompactBlock(subBlockMatch[0], "Closing Balance"),
      stt: extractTxnSttFromCompactBlock(subBlockMatch[0]),
      block_text: normalize(subBlockMatch[0])
    });
  }

  const transactions = [];
  for (const block of blocks) {
    const txRegex =
      /([0-9]{2}-[0-9]{2}-[0-9]{4})\s+([A-Za-z*][A-Za-z0-9\-\/(). #:&']{2,220}?)\s+(?:[0-9]{6,}\s+)?(-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))\s+(-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))\s+(-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))\s+(-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))/g;

    let txMatch;
    while ((txMatch = txRegex.exec(block.block_text)) !== null) {
      const date = normalize(txMatch[1]);
      const description = normalize(txMatch[2]);
      const amount = toNumber(txMatch[3]);
      const nav = toNumber(txMatch[4]);
      const price = toNumber(txMatch[5]);
      const units = toNumber(txMatch[6]);

      if (!date || !description || amount === null || units === null) continue;

      transactions.push({
        amc: block.amc,
        scheme_code: block.scheme_code,
        scheme_name: block.scheme_name,
        isin: block.isin || null,
        date,
        description,
        amount,
        nav,
        price,
        units,
        opening_balance: block.opening_balance ?? null,
        closing_balance: block.closing_balance ?? null,
        stt: block.stt ?? null
      });
    }
  }

  if (transactions.length) return transactions;

  const metadataBySchemeCode = extractTransactionBlockMetaFromLines(text);
  return parseTransactionsFromLineBlocks(text, metadataBySchemeCode);
}

function parseCdslDematTransactions(text) {
  const compactBlockRows = parseCdslDematTransactionsFromCompactBlocks(text);
  if (compactBlockRows.length) return compactBlockRows;

  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const startIdx = lines.findIndex((line) => /STATEMENT OF TRANSACTIONS FOR THE PERIOD/i.test(line));
  if (startIdx < 0) return [];

  const endIdx = lines.findIndex(
    (line, index) =>
      index > startIdx &&
      /MUTUAL FUND UNITS HELD WITH MF\/RTA|MUTUAL FUND UNITS HELD AS ON/i.test(
        line
      )
  );
  const sectionLines = lines.slice(startIdx + 1, endIdx > startIdx ? endIdx : undefined);
  const compactText = normalize(text);
  const compactStart = compactText.search(/STATEMENT OF TRANSACTIONS FOR THE PERIOD/i);
  const compactTail = compactStart >= 0 ? compactText.slice(compactStart) : "";
  const compactEndRelative = compactTail.search(
    /MUTUAL FUND UNITS HELD WITH MF\/RTA|MUTUAL FUND UNITS HELD AS ON/i
  );
  const compactSection =
    compactStart >= 0
      ? compactEndRelative > 0
        ? compactTail.slice(0, compactEndRelative)
        : compactTail
      : "";
  const noiseLineRegex =
    /^(Page\s+\d+\s+of\s+\d+|Central Depository Services|CONSOLIDATED ACCOUNT STATEMENT|Summary of Investments|MF Details|Notes|About CDSL|A Wing,|Lower Parel|SUNDRAM SINHA|HOLDING STATEMENT AS ON|ISIN\s+Security\s+Transaction Particulars)/i;

  const transactions = [];
  let buffer = "";
  let lastIsin = "";
  let lastSecurity = "";
  const dematNoiseRegex =
    /(Central Depository Services|CONSOLIDATED ACCOUNT STATEMENT|Summary of Investments|Account Details|MF Details|Notes|About CDSL|HOLDING STATEMENT AS ON|ISIN\s+Security\s+Current Bal|STATEMENT OF TRANSACTIONS FOR THE PERIOD|BO ID\s*:|DP Name\s*:)/i;
  const rowRegex =
    /^(?:(IN[EF][0-9A-Z]{9,10})\s+)?(.+?)\s+([0-9]{2}-[0-9]{2}-[0-9]{4})\s+((?:-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+)|--)(?:\s+(?:-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+)|--)){3,4})$/;

  const flushBuffer = () => {
    const rowText = normalize(buffer);
    if (!rowText) {
      buffer = "";
      return;
    }
    if (dematNoiseRegex.test(rowText)) {
      buffer = "";
      return;
    }
    const rowMatch = rowText.match(rowRegex);
    if (!rowMatch) {
      buffer = "";
      return;
    }

    const isin = normalize(rowMatch[1]) || lastIsin;
    const preDateText = selectDematPreDateContext(rowMatch[2]);
    const date = normalize(rowMatch[3]);
    const { openingBalance, credit, debit, closingBalance, stampDuty } = parseDematNumericTail(rowMatch[4]);
    const { security, transactionParticulars } = splitDematPreDateText(preDateText, lastSecurity);

    if (!isin || !date || !security) return;
    if (isLikelyNoiseDematSecurity(security)) return;

    transactions.push({
      isin,
      security,
      transactionParticulars,
      date,
      openingBalance,
      credit,
      debit,
      closingBalance,
      stampDuty
    });
    lastIsin = isin;
    lastSecurity = security;
    buffer = "";
  };

  for (const line of sectionLines) {
    if (noiseLineRegex.test(line)) continue;

    if (buffer && /^IN[EF][0-9A-Z]{9,10}\b/.test(line)) {
      flushBuffer();
    }

    buffer = buffer ? `${buffer} ${line}` : line;
    if (rowRegex.test(normalize(buffer))) {
      flushBuffer();
    }
  }
  flushBuffer();
  const compactFallback = parseCdslDematTransactionsFromCompactSection(compactSection);
  return pickBestDematTransactions(transactions, compactFallback);
}

function parseCdslDematTransactionsFromCompactBlocks(text) {
  const compactText = normalize(text);
  if (!compactText) return [];

  const startMarker = /STATEMENT OF TRANSACTIONS FOR THE PERIOD/gi;
  const startIndexes = [];
  let startMatch;
  while ((startMatch = startMarker.exec(compactText)) !== null) {
    startIndexes.push(startMatch.index);
  }
  if (!startIndexes.length) return [];

  const rows = [];
  for (let i = 0; i < startIndexes.length; i += 1) {
    const start = startIndexes[i];
    const end = i + 1 < startIndexes.length ? startIndexes[i + 1] : compactText.length;
    const block = normalize(compactText.slice(start, end));
    if (!block) continue;
    if (/No Transaction during the period/i.test(block)) continue;
    if (!/ISIN\s+Security\s+Transaction Particulars\s+Date/i.test(block)) continue;
    const blockRows = parseCdslDematTransactionsFromCompactSection(block);
    for (const row of blockRows) rows.push(row);
  }

  return rows;
}

function splitDematPreDateText(preDateText, lastSecurity = "") {
  const text = normalize(preDateText);
  const markerMatch = text.match(
    /\b(EP-[A-Z]{2}|CA-[A-Za-z]+|PAYOUT-[A-Z]{2}|Txn:|Cr Current Balance|Db Current Balance|BSEDR|NSEDR|INTDEP)\b/i
  );
  if (!markerMatch) return { security: text || normalize(lastSecurity), transactionParticulars: "" };

  const idx = markerMatch.index || 0;
  const leading = normalize(text.slice(0, idx));
  const leadingLooksLikeHeaderNoise =
    !leading ||
    /(ISIN\s+Security|Transaction Particulars|Date\s+Op\.?\s*Bal|Summary of Investments|Account Details|About CDSL|Central Depository Services)/i.test(
      leading
    );
  if (leadingLooksLikeHeaderNoise) {
    return {
      security: normalize(lastSecurity),
      transactionParticulars: normalize(text.slice(idx))
    };
  }
  if (idx === 0) {
    return {
      security: normalize(lastSecurity),
      transactionParticulars: text
    };
  }
  return {
    security: normalize(text.slice(0, idx)),
    transactionParticulars: normalize(text.slice(idx))
  };
}

function parseCdslDematTransactionsFromCompactSection(section) {
  const text = normalize(section);
  if (!text) return [];

  const output = [];
  let lastIsin = "";
  let lastSecurity = "";
  const dematNoiseRegex =
    /(Central Depository Services|CONSOLIDATED ACCOUNT STATEMENT|Summary of Investments|Account Details|MF Details|Notes|About CDSL|HOLDING STATEMENT AS ON|ISIN\s+Security\s+Current Bal|STATEMENT OF TRANSACTIONS FOR THE PERIOD|BO ID\s*:|DP Name\s*:)/i;
  const rowTailRegex =
    /([0-9]{2}-[0-9]{2}-[0-9]{4})\s+((?:-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+)|--)(?:\s+(?:-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+)|--)){3,4})/g;

  let cursor = 0;
  let match;
  while ((match = rowTailRegex.exec(text)) !== null) {
    let preDateText = normalize(text.slice(cursor, match.index));
    cursor = rowTailRegex.lastIndex;
    preDateText = selectDematPreDateContext(preDateText);
    if (!preDateText || dematNoiseRegex.test(preDateText)) continue;

    const isinPrefixMatch = preDateText.match(/^(IN[EF][0-9A-Z]{9,10})\s+(.+)$/i);
    const isin = isinPrefixMatch ? normalize(isinPrefixMatch[1]) : lastIsin;
    const detailsText = isinPrefixMatch ? normalize(isinPrefixMatch[2]) : preDateText;

    const date = normalize(match[1]);
    const { openingBalance, credit, debit, closingBalance, stampDuty } = parseDematNumericTail(match[2]);
    const { security, transactionParticulars } = splitDematPreDateText(detailsText, lastSecurity);

    if (!isin || !date || !security) continue;
    if (isLikelyNoiseDematSecurity(security)) continue;

    output.push({
      isin,
      security,
      transactionParticulars,
      date,
      openingBalance,
      credit,
      debit,
      closingBalance,
      stampDuty
    });
    lastIsin = isin;
    lastSecurity = security;
  }

  return output;
}

function selectDematPreDateContext(rawText) {
  let text = sanitizeDematPreDateText(rawText);
  if (!text) return "";

  if (/STATEMENT OF TRANSACTIONS FOR THE PERIOD/i.test(text)) {
    const firstIsinPos = text.search(/\bIN[EF][0-9A-Z]{9,10}\b/i);
    if (firstIsinPos >= 0) {
      text = normalize(text.slice(firstIsinPos));
    } else {
      const firstTxnPos = text.search(
        /\b(BSEDR|NSEDR|INTDEP|EP-[A-Z]{2}|CA-[A-Za-z]+|PAYOUT-[A-Z]{2}|Txn:)\b/i
      );
      if (firstTxnPos >= 0) text = normalize(text.slice(firstTxnPos));
    }
  }

  const isinMatches = [...text.matchAll(/\bIN[EF][0-9A-Z]{9,10}\b/gi)];
  if (isinMatches.length > 1) {
    const lastMatch = isinMatches[isinMatches.length - 1];
    const leading = normalize(text.slice(0, lastMatch.index));
    const leadingHasTxnContext = /\b(BSEDR|NSEDR|INTDEP|EP-[A-Z]{2}|CA-[A-Za-z]+|PAYOUT-[A-Z]{2}|Txn:)\b/i.test(
      leading
    );
    if (!leadingHasTxnContext) {
      text = normalize(text.slice(lastMatch.index));
    }
  }

  return text;
}

function sanitizeDematPreDateText(value) {
  let text = normalize(value);
  if (!text) return "";
  const removablePatterns = [
    /Central Depository Services\s*\(India\)\s*Limited/gi,
    /CONSOLIDATED ACCOUNT STATEMENT/gi,
    /Summary of Investments/gi,
    /Account Details/gi,
    /MF Details/gi,
    /Notes/gi,
    /About CDSL/gi,
    /HOLDING STATEMENT AS ON/gi,
    /ISIN\s+ISIN\s+Security/gi,
    /ISIN\s+Security\s+Transaction Particulars/gi,
    /Transaction Particulars\s+Date\s+Op\.?\s*Bal/gi,
    /Stamp Duty\s*\(?`?\)?/gi,
    /BO ID\s*:\s*[0-9]+/gi
  ];
  for (const pattern of removablePatterns) {
    text = text.replace(pattern, " ");
  }
  return normalize(text);
}

function isLikelyNoiseDematSecurity(security) {
  const text = normalize(security);
  if (!text) return true;
  if (text.length > 260) return true;
  if (
    /(Central Depository Services|Summary of Investments|Account Details|ISIN\s+Security|HOLDING STATEMENT AS ON|MF Details|About CDSL)/i.test(
      text
    )
  ) {
    return true;
  }
  const isinMatches = text.match(/\bIN[EF][0-9A-Z]{9,10}\b/gi);
  if (isinMatches && isinMatches.length > 1) return true;
  return false;
}

function pickBestDematTransactions(primaryRows, fallbackRows) {
  const primaryScore = scoreDematTransactions(primaryRows);
  const fallbackScore = scoreDematTransactions(fallbackRows);
  if (fallbackScore > primaryScore) return fallbackRows;
  return primaryRows;
}

function scoreDematTransactions(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  let score = 0;
  for (const row of rows) {
    const isinOk = /^IN[EF][0-9A-Z]{9,10}$/i.test(String(row?.isin || "").trim());
    const dateOk = /^[0-9]{2}-[0-9]{2}-[0-9]{4}$/.test(String(row?.date || "").trim());
    const security = normalize(row?.security);
    const tx = normalize(row?.transactionParticulars);
    if (isinOk) score += 2;
    if (dateOk) score += 2;
    if (security && security.length <= 140 && !isLikelyNoiseDematSecurity(security)) score += 2;
    if (tx) score += 1;
  }
  return score;
}

function toNumberOrNull(value) {
  const normalized = normalize(value);
  if (!normalized || normalized === "--") return null;
  return toNumber(normalized);
}

function parseDematNumericTail(tailText) {
  const tokens = normalize(tailText)
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) {
    return {
      openingBalance: null,
      credit: null,
      debit: null,
      closingBalance: null,
      stampDuty: null
    };
  }

  // Normal rows have 5 values: OpBal, Credit, Debit, ClBal, Stamp.
  // Continuation rows can miss OpBal and arrive with 4 values.
  const normalizedTokens = tokens.length > 5 ? tokens.slice(-5) : tokens;
  const [opBal, credit, debit, closingBalance, stampDuty] =
    normalizedTokens.length === 5
      ? normalizedTokens
      : [null, normalizedTokens[0], normalizedTokens[1], normalizedTokens[2], normalizedTokens[3]];

  return {
    openingBalance: toNumberOrNull(opBal),
    credit: toNumberOrNull(credit),
    debit: toNumberOrNull(debit),
    closingBalance: toNumberOrNull(closingBalance),
    stampDuty: toNumberOrNull(stampDuty)
  };
}

function resolveAmcForIndex(amcAnchors, index) {
  if (!amcAnchors?.length) return "";
  let active = amcAnchors[0].amc;
  for (const item of amcAnchors) {
    if (item.index <= index) active = item.amc;
    else break;
  }
  return active;
}

function extractTxnBalanceFromCompactBlock(blockText, label) {
  const regex = new RegExp(
    `${escapeRegex(label)}\\s+(?:--\\s+){0,6}(-?(?:[0-9,]+(?:\\.[0-9]+)?|\\.[0-9]+))`,
    "i"
  );
  const match = String(blockText || "").match(regex);
  return match ? toNumber(match[1]) : null;
}

function extractTxnSttFromCompactBlock(blockText) {
  const match = String(blockText || "").match(/\bSTT\b\s+(-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))/i);
  return match ? toNumber(match[1]) : null;
}

function extractTransactionBlockMetaFromLines(text) {
  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const map = new Map();
  if (!lines.length) return map;

  const startIdx = lines.findIndex((line) => /MUTUAL FUND UNITS HELD WITH MF\/RTA/i.test(line));
  const endIdx = lines.findIndex(
    (line, index) => index > startIdx && /MUTUAL FUND UNITS HELD AS ON|CDSL Demat Accounts|Account Details/i.test(line)
  );
  if (startIdx < 0) return map;

  const sectionLines = explodeInlineSchemeStarts(
    lines.slice(startIdx + 1, endIdx > startIdx ? endIdx : undefined)
  );
  let current = null;

  for (const line of sectionLines) {
    const schemeHeaderMatch = line.match(/^([A-Z0-9]{2,6})\s*-\s*(.+)$/);
    if (schemeHeaderMatch && /[A-Z]/i.test(schemeHeaderMatch[1])) {
      if (current?.scheme_code) map.set(current.scheme_code, current);
      current = {
        scheme_code: normalize(schemeHeaderMatch[1]),
        scheme_name: normalize(schemeHeaderMatch[2]),
        isin: null,
        opening_balance: null,
        closing_balance: null,
        stt: null
      };
      continue;
    }
    if (!current) continue;

    const isinMatch = line.match(/ISIN\s*:\s*([A-Z0-9]+)/i);
    if (isinMatch) current.isin = normalize(isinMatch[1]).replace(/\s+/g, "");
    if (/^Opening Balance\b/i.test(line)) current.opening_balance = extractLastNumberFromLine(line);
    if (/^Closing Balance\b/i.test(line)) current.closing_balance = extractLastNumberFromLine(line);
    if (/^STT\b/i.test(line)) current.stt = extractFirstNumberFromLine(line);
  }

  if (current?.scheme_code) map.set(current.scheme_code, current);
  return map;
}

function parseTransactionsFromLineBlocks(text, metadataBySchemeCode) {
  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const startIdx = lines.findIndex((line) => /MUTUAL FUND UNITS HELD WITH MF\/RTA/i.test(line));
  const endIdx = lines.findIndex(
    (line, index) => index > startIdx && /MUTUAL FUND UNITS HELD AS ON|CDSL Demat Accounts|Account Details/i.test(line)
  );
  if (startIdx < 0) return [];

  const sectionLines = explodeInlineSchemeStarts(
    lines.slice(startIdx + 1, endIdx > startIdx ? endIdx : undefined)
  );
  const transactions = [];
  let currentAmc = "";
  let currentSchemeCode = "";
  let currentSchemeName = "";
  let currentRow = "";
  const noiseLineRegex =
    /^(Page\s+\d+\s+of\s+\d+|Central Depository Services|CONSOLIDATED ACCOUNT STATEMENT|Summary of Investments|MF Details|Notes|About CDSL|A Wing,|Lower Parel|SUNDRAM SINHA)$/i;

  const pushCurrentRow = () => {
    if (!currentRow) return;
    const row = parseTransactionRow(currentRow);
    if (row) {
      const meta = metadataBySchemeCode.get(currentSchemeCode) || {};
      transactions.push({
        amc: currentAmc,
        scheme_code: currentSchemeCode,
        scheme_name: currentSchemeName,
        isin: meta.isin || null,
        ...row,
        opening_balance: meta.opening_balance ?? null,
        closing_balance: meta.closing_balance ?? null,
        stt: meta.stt ?? null
      });
    }
    currentRow = "";
  };

  for (const line of sectionLines) {
    if (noiseLineRegex.test(line)) continue;

    if (isAmcHeaderLine(line)) {
      pushCurrentRow();
      currentAmc = cleanAmcName(line);
      continue;
    }

    const schemeHeaderMatch = line.match(/^([A-Z0-9]{2,6})\s*-\s*(.+)$/);
    if (schemeHeaderMatch && /[A-Z]/i.test(schemeHeaderMatch[1])) {
      pushCurrentRow();
      currentSchemeCode = normalize(schemeHeaderMatch[1]);
      currentSchemeName = normalize(schemeHeaderMatch[2]);
      continue;
    }

    if (!currentSchemeCode) continue;

    if (/^Closing Balance\b|^MUTUAL FUND UNITS HELD AS ON\b/i.test(line)) {
      // Transaction row for the scheme should be complete before closing balance.
      pushCurrentRow();
      continue;
    }

    if (/^Date\b|^Opening Balance\b|^STT\b|^ISIN\b|^UCC\b/i.test(line)) continue;

    if (/^[0-9]{2}-[0-9]{2}-[0-9]{4}\b/.test(line)) {
      pushCurrentRow();
      currentRow = line;
    } else if (currentRow) {
      currentRow = `${currentRow} ${line}`;
    }
  }

  pushCurrentRow();

  return transactions;
}

function parseTransactionRow(rowText) {
  const rowMatch = String(rowText || "").match(
    /^([0-9]{2}-[0-9]{2}-[0-9]{4})\s+([A-Za-z*][A-Za-z0-9\-\/(). #:&']{2,220}?)\s+(?:[0-9]{6,}\s+)?(-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))\s+(-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))\s+(-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))\s+(-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))(?:\s+(?:--|-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))){0,3}$/i
  );
  if (!rowMatch) return null;

  const date = normalize(rowMatch[1]);
  const description = normalize(rowMatch[2]);
  const amount = toNumber(rowMatch[3]);
  const nav = toNumber(rowMatch[4]);
  const price = toNumber(rowMatch[5]);
  const units = toNumber(rowMatch[6]);
  if (!date || !description || amount === null || units === null) return null;

  return { date, description, amount, nav, price, units };
}

function explodeInlineSchemeStarts(lines) {
  const output = [];
  for (const rawLine of lines) {
    const line = normalize(rawLine);
    if (!line) continue;

    // Some PDFs merge "... Closing Balance <value> <nextSchemeCode> - <nextSchemeName>" in one line.
    // Split these explicit boundary cases to keep scheme-level sub-blocks accurate.
    const splitLine = line
      .replace(
        /^(Closing Balance\b.*?-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))\s+([A-Z0-9]{2,6}\s*-\s*[A-Za-z])/i,
        "$1\n$2"
      )
      .replace(
        /^(STT\b.*?-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+))\s+([A-Z0-9]{2,6}\s*-\s*[A-Za-z])/i,
        "$1\n$2"
      );
    splitLine
      .split("\n")
      .map((part) => normalize(part))
      .filter(Boolean)
      .forEach((part) => output.push(part));
  }
  return output;
}

function extractLastNumberFromLine(line) {
  const matches = String(line || "").match(/-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+)/g);
  if (!matches || !matches.length) return null;
  return toNumber(matches[matches.length - 1]);
}

function extractFirstNumberFromLine(line) {
  const match = String(line || "").match(/-?(?:[0-9,]+(?:\.[0-9]+)?|\.[0-9]+)/);
  if (!match) return null;
  return toNumber(match[0]);
}

function isAmcHeaderLine(line) {
  return /Mutual Fund/i.test(line) && !/^([A-Z0-9]{2,6})\s*-/.test(line);
}

function cleanAmcName(value) {
  return normalize(value)
    .replace(/^MUTUAL FUND UNITS HELD WITH MF\/RTA\s*/i, "")
    .replace(/^RTA\s+/i, "");
}

function extractAmcSchemeFolioMap(compactText) {
  const map = new Map();
  const metaRegex =
    /AMC Name\s*:\s*(.+?)\s+Scheme Name\s*:\s*(.+?)\s+Scheme Code\s*:\s*([A-Z0-9]+)\s+Folio No\s*:\s*([0-9A-Za-z\/]+)/g;

  let match;
  while ((match = metaRegex.exec(compactText)) !== null) {
    const amc = normalize(match[1]);
    const schemeName = normalize(match[2]);
    const schemeCode = normalize(match[3]);
    const folio = normalize(match[4]);
    if (!schemeCode || !folio) continue;
    map.set(`${schemeCode}|${folio}`, { amc, schemeName, schemeCode, folio });
  }

  return map;
}

function extractHoldingByFolioAndSchemeName(sectionText, schemeName, folio) {
  const schemePattern = escapeRegex(schemeName).replace(/\s+/g, "\\s+");
  const pattern = new RegExp(
    `${schemePattern}\\s+INF[0-9A-Z ]{9,16}\\s+${escapeRegex(folio)}\\s+([0-9,]*\\.?[0-9]+)\\s+([0-9,]*\\.?[0-9]+)\\s+([0-9,]*\\.?[0-9]+)\\s+([0-9,]*\\.?[0-9]+)`,
    "i"
  );
  const match = sectionText.match(pattern);
  if (!match) return null;

  const units = toNumber(match[1]);
  const nav = toNumber(match[2]);
  const value = toNumber(match[4]);
  if (units === null || nav === null || value === null || value <= 0) {
    return null;
  }

  return { units, nav, value };
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeDematHoldings(holdings) {
  const seen = new Set();
  const output = [];

  for (const item of holdings) {
    const key = `${item.account_key || ""}|${item.isin}|${item.security_name}|${item.quantity}|${item.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function dedupeTransactions(transactions) {
  const seen = new Set();
  const output = [];

  for (const item of transactions) {
    const key = `${item.scheme_code}|${item.date}|${item.description}|${item.amount}|${item.units}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function dedupeDematTransactions(transactions) {
  const seen = new Set();
  const output = [];

  for (const item of transactions) {
    const key = `${item.isin}|${item.date}|${item.transactionParticulars}|${item.debit}|${item.credit}|${item.closingBalance}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function applyDematTransactionCarryForward(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  let lastIsin = "";
  let lastSecurity = "";
  return rows.map((row) => {
    const normalizedIsin = normalize(row?.isin);
    const normalizedSecurity = normalize(row?.security);
    const nextIsin = normalizedIsin || lastIsin;
    const nextSecurity = normalizedSecurity || lastSecurity;
    if (nextIsin) lastIsin = nextIsin;
    if (nextSecurity) lastSecurity = nextSecurity;
    return {
      ...row,
      isin: nextIsin || null,
      security: nextSecurity || null
    };
  });
}

module.exports = {
  parseCasPortfolio
};
