import React, { useState } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

function DashboardSummary({ summary, mutualFundHoldings, dematHoldings, transactions, variant = "full" }) {
  const [showYearlyTable, setShowYearlyTable] = useState(false);
  const [selectedInvestorIndex, setSelectedInvestorIndex] = useState(0);
  const [openSummaryCategoryKey, setOpenSummaryCategoryKey] = useState(null);
  const mf = summary?.totalMutualFundValue || 0;
  const demat = summary?.totalDematValue || 0;
  const total = summary?.totalPortfolioValue || 0;
  const mfPct = summary?.allocation?.mutualFundPercentage ?? 0;
  const dematPct = summary?.allocation?.dematPercentage ?? 0;
  const parsedAssetClassBreakup = summary?.assetClassBreakup || null;
  const parsedAssetClassRows = Array.isArray(parsedAssetClassBreakup?.rows)
    ? parsedAssetClassBreakup.rows.filter((row) => typeof row?.value === "number")
    : [];
  const hasParsedAssetClassBreakup = parsedAssetClassRows.length > 0;
  const effectiveAssetRows = hasParsedAssetClassBreakup
    ? parsedAssetClassRows
    : [
      { key: "mutualFundFolios", label: "Mutual Fund Folios", value: mf, percentage: mfPct },
      { key: "equityDemat", label: "Equity / Demat", value: demat, percentage: dematPct }
    ];
  const sortedEffectiveAssetRows = [...effectiveAssetRows].sort(
    (a, b) => (Number(b?.value) || 0) - (Number(a?.value) || 0)
  );
  const effectiveAssetTotal =
    hasParsedAssetClassBreakup && typeof parsedAssetClassBreakup?.totalPortfolioValue === "number"
      ? parsedAssetClassBreakup.totalPortfolioValue
      : total;
  const statementSummaryValues = summary?.statementSummary?.values || null;
  const statementSummaryEntries = Array.isArray(summary?.statementSummary?.entries)
    ? summary.statementSummary.entries
    : [];
  const consolidatedPortfolioSummary = summary?.consolidatedPortfolioSummary || null;
  const consolidatedRows = Array.isArray(consolidatedPortfolioSummary?.rows)
    ? [...consolidatedPortfolioSummary.rows].sort((a, b) => (Number(b?.value) || 0) - (Number(a?.value) || 0))
    : [];
  const statementTotal =
    typeof statementSummaryValues?.totalPortfolioValue === "number"
      ? statementSummaryValues.totalPortfolioValue
      : null;
  const displayTotalValue =
    typeof effectiveAssetTotal === "number" && effectiveAssetTotal > 0
      ? effectiveAssetTotal
      : typeof statementTotal === "number" && statementTotal > 0
        ? statementTotal
        : total;
  const statementBreakupRows = [
    {
      key: "cdslDematAccounts",
      label: "CDSL Demat Accounts",
      value: statementSummaryValues?.cdslDematAccounts ?? null
    },
    {
      key: "nsdlDematAccounts",
      label: "NSDL Demat Accounts",
      value: statementSummaryValues?.nsdlDematAccounts ?? null
    },
    {
      key: "mutualFundFolios",
      label: "Mutual Fund Folios",
      value: statementSummaryValues?.mutualFundFolios ?? null
    }
  ];
  const hasStatementBreakupData = statementBreakupRows.some((row) => typeof row.value === "number");
  const sortedStatementEntries = [...statementSummaryEntries]
    .map((entry) => {
      const cdsl = Number(entry?.values?.cdslDematAccounts) || 0;
      const nsdl = Number(entry?.values?.nsdlDematAccounts) || 0;
      const mfFolios = Number(entry?.values?.mutualFundFolios) || 0;
      return { ...entry, rowTotal: cdsl + nsdl + mfFolios };
    })
    .sort((a, b) => (b.rowTotal || 0) - (a.rowTotal || 0));
  const investorSummaryViews = sortedStatementEntries.length
    ? sortedStatementEntries.map((entry) => ({
      holderName: entry?.holderName || "Primary Holder",
      values: {
        cdslDematAccounts: Number(entry?.values?.cdslDematAccounts) || 0,
        nsdlDematAccounts: Number(entry?.values?.nsdlDematAccounts) || 0,
        mutualFundFolios: Number(entry?.values?.mutualFundFolios) || 0
      }
    }))
    : hasStatementBreakupData
      ? [
        {
          holderName: consolidatedPortfolioSummary?.holderName || "Primary Holder",
          values: {
            cdslDematAccounts: Number(statementSummaryValues?.cdslDematAccounts) || 0,
            nsdlDematAccounts: Number(statementSummaryValues?.nsdlDematAccounts) || 0,
            mutualFundFolios: Number(statementSummaryValues?.mutualFundFolios) || 0
          }
        }
      ]
      : [];
  const safeSelectedInvestorIndex =
    investorSummaryViews.length > 0 ? Math.min(selectedInvestorIndex, investorSummaryViews.length - 1) : 0;
  const activeInvestorSummary = investorSummaryViews[safeSelectedInvestorIndex] || null;
  const activeSummaryCategoryRows = activeInvestorSummary
    ? [
      {
        key: "cdslDematAccounts",
        label: "CDSL Demat Accounts",
        value: Number(activeInvestorSummary.values?.cdslDematAccounts) || 0
      },
      {
        key: "nsdlDematAccounts",
        label: "NSDL Demat Accounts",
        value: Number(activeInvestorSummary.values?.nsdlDematAccounts) || 0
      },
      {
        key: "mutualFundFolios",
        label: "Mutual Fund Folios",
        value: Number(activeInvestorSummary.values?.mutualFundFolios) || 0
      }
    ].sort((a, b) => b.value - a.value)
    : [];
  const activeSummaryTotal = activeSummaryCategoryRows.reduce((sum, row) => sum + (Number(row?.value) || 0), 0);
  const consolidatedRowsByCategory = consolidatedRows.reduce((acc, row) => {
    const key = mapConsolidatedTypeToSummaryKey(row?.accountType);
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  const activeInvestorHasAttachedRows =
    consolidatedRows.length > 0 &&
    (investorSummaryViews.length <= 1 ||
      areSameHolders(activeInvestorSummary?.holderName, consolidatedPortfolioSummary?.holderName));
  const activeInvestorPan =
    consolidatedPortfolioSummary?.pan &&
    (investorSummaryViews.length <= 1 ||
      areSameHolders(activeInvestorSummary?.holderName, consolidatedPortfolioSummary?.holderName))
      ? consolidatedPortfolioSummary.pan
      : null;
  const yearlyValuation = Array.isArray(summary?.yearlyValuation) ? summary.yearlyValuation : [];
  const topMutualFund = [...mutualFundHoldings].sort((a, b) => (b.value || 0) - (a.value || 0))[0];
  const topDemat = [...dematHoldings]
    .filter(isValidEquityHoldingForInsights)
    .sort((a, b) => (b.value || 0) - (a.value || 0))[0];
  const top3MfValue = [...mutualFundHoldings]
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, 3)
    .reduce((sum, row) => sum + (row.value || 0), 0);
  const top3ConcentrationPct = total ? (top3MfValue / total) * 100 : 0;
  const latestDateKey = transactions.reduce((latest, txn) => {
    const dateKey = toCasDateKey(txn?.date);
    if (dateKey === null) return latest;
    return latest === null || dateKey > latest ? dateKey : latest;
  }, null);
  const latestDateTransactions = latestDateKey
    ? transactions.filter((txn) => toCasDateKey(txn?.date) === latestDateKey)
    : [];
  const lastTxn = latestDateTransactions[0] || null;
  const latestTxnCount = latestDateTransactions.length;
  const latestTxnTotalAmount = latestDateTransactions.reduce(
    (sum, txn) => sum + (Number(txn?.amount) || 0),
    0
  );
  const latestTxnIsRedemption = latestDateTransactions.some(
    (txn) => /redemption/i.test(txn?.description || "") || Number(txn?.amount || 0) < 0
  );
  const isRedemptionTxn = Boolean(lastTxn) && latestTxnIsRedemption;
  const latestTxnTitle = lastTxn
    ? latestTxnCount > 1
      ? `${latestTxnCount} transactions on ${lastTxn.date}`
      : lastTxn.description
    : "No transactions in period";
  const latestTxnValueText = lastTxn
    ? `${lastTxn.date} | ${formatCurrency(latestTxnCount > 1 ? latestTxnTotalAmount : lastTxn.amount)}`
    : "-";
  const latestTxnNote =
    latestTxnCount > 1
      ? "Multiple entries were captured on the latest transaction date."
      : "Latest transaction captured from the uploaded statement.";
  const concentrationLabel =
    top3ConcentrationPct >= 60
      ? "High concentration"
      : top3ConcentrationPct >= 40
        ? "Moderate concentration"
        : "Well diversified";

  const assetClassColors = {
    equity: "#3b82f6",
    mutualFundFolios: "#f4b400",
    mutualFundsHeldInDematForm: "#14b8a6",
    equityDemat: "#3b82f6",
    cdslDematAccounts: "#2563eb",
    nsdlDematAccounts: "#7c3aed"
  };
  const assetBreakupPieOptions = {
    chart: {
      type: "pie",
      height: 280,
      backgroundColor: "transparent",
      spacing: [8, 8, 8, 8]
    },
    title: { text: null },
    credits: { enabled: false },
    tooltip: {
      backgroundColor: "#111827",
      borderColor: "#111827",
      borderRadius: 8,
      style: { color: "#f9fafb", fontSize: "12px" },
      pointFormat: "<b>{point.percentage:.2f}%</b><br/>₹ {point.y:,.2f}"
    },
    legend: {
      enabled: true,
      align: "right",
      verticalAlign: "middle",
      layout: "vertical",
      itemStyle: {
        color: "#111827",
        fontSize: "12px",
        fontWeight: "600"
      },
      itemMarginBottom: 8
    },
    plotOptions: {
      pie: {
        innerSize: "0%",
        borderWidth: 2,
        borderColor: "#ffffff",
        dataLabels: {
          enabled: true,
          format: "{point.percentage:.1f}%",
          style: {
            color: "#111827",
            fontSize: "11px",
            fontWeight: "600",
            textOutline: "none"
          }
        }
      }
    },
    series: [
      {
        type: "pie",
        name: "Allocation",
        data: sortedEffectiveAssetRows.map((row) => ({
          name: `${row.label} (₹ ${(row.value || 0).toLocaleString("en-IN")})`,
          y: Number((row.value || 0).toFixed(2)),
          color: assetClassColors[row.key] || "#2563eb"
        }))
      }
    ]
  };

  if (variant === "snapshot") {
    return (
      <section className="dashboard-card snapshot-only">
        <div className="dashboard-hero">
          <div>
            <p className="eyebrow">Consolidated Portfolio</p>
            <h2>Investment Snapshot</h2>
            <p className="hero-subtitle">
              Deterministic CAS extraction for mutual funds, demat holdings, and transactions.
            </p>
          </div>
          <div className="hero-value">
            <span>Total Value</span>
            <strong>₹ {displayTotalValue.toLocaleString("en-IN")}</strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-card">
      <section className="insight-section">
        <div className="insight-section-head">
          <h3>Summary of Investments</h3>
          <p>Top categories with expandable account-level drilldown.</p>
        </div>
        {investorSummaryViews.length > 1 ? (
          <div className="summary-investor-tabs">
            {investorSummaryViews.map((entry, index) => (
              <button
                key={`${entry.holderName}-${index}`}
                type="button"
                className={`summary-investor-tab ${safeSelectedInvestorIndex === index ? "active" : ""}`}
                onClick={() => {
                  setSelectedInvestorIndex(index);
                  setOpenSummaryCategoryKey(null);
                }}
              >
                {entry.holderName}
              </button>
            ))}
          </div>
        ) : null}
        {activeInvestorSummary ? (
          <div className="summary-unified-layout">
            <div className="summary-meta-strip">
              <p>
                <span>Holder</span>
                <strong>
                  {activeInvestorSummary.holderName || "-"}
                  {activeInvestorPan ? ` (PAN: ${activeInvestorPan})` : ""}
                </strong>
              </p>
              <p>
                <span>Total Portfolio Value</span>
                <strong>{formatCurrencyOrNA(activeSummaryTotal || statementTotal)}</strong>
              </p>
            </div>

            <div className="summary-drilldown">
              {activeSummaryCategoryRows.map((category) => {
                const isOpen = openSummaryCategoryKey === category.key;
                const rows = activeInvestorHasAttachedRows ? consolidatedRowsByCategory?.[category.key] || [] : [];

                return (
                  <article className="summary-drilldown-item" key={category.key}>
                    <button
                      type="button"
                      className="summary-drilldown-trigger"
                      onClick={() => setOpenSummaryCategoryKey((prev) => (prev === category.key ? null : category.key))}
                    >
                      <span>{category.label}</span>
                      <span className="summary-drilldown-trigger-right">
                        <strong>{formatCurrencyOrNA(category.value)}</strong>
                        <span className="summary-drilldown-chevron">{isOpen ? "↑" : "↓"}</span>
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="summary-drilldown-body">
                        {rows.length ? (
                          <div className="summary-account-table">
                            <div className="summary-account-head">
                              <span>Account Details</span>
                              <span>ISINs / Schemes</span>
                              <span>Value</span>
                            </div>
                            {rows.map((accountRow, rowIndex) => (
                              <div key={`${category.key}-${rowIndex}`} className="summary-account-row">
                                <span className="summary-account-details">
                                  {accountRow.accountDetails || accountRow.accountType || "-"}
                                </span>
                                <span className="summary-account-count">
                                  {typeof accountRow.schemesCount === "number" ? accountRow.schemesCount : "-"}
                                </span>
                                <strong className="summary-account-value">{formatCurrencyOrNA(accountRow.value)}</strong>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="summary-kpi-note">
                            {activeInvestorHasAttachedRows
                              ? "No account-level rows available for this category."
                              : "Account-level rows are not reliably mapped per investor in this statement."}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            {!hasStatementBreakupData ? (
              <p className="summary-kpi-note">
                No summary-table values were parsed from this statement. This section will populate when
                the uploaded CAS contains the Summary of Investments value table.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="summary-kpi-note">No summary data available for this statement.</p>
        )}
      </section>

      <section className="insight-section">
        <div className="insight-section-head">
          <h3>Portfolio Value Split</h3>
          <p>Distribution of total portfolio value by investment bucket from the statement.</p>
        </div>
        <div className="allocation-combined">
          <div className="allocation-layout">
            <div className="allocation-table-wrap">
              <table className="allocation-table">
                <thead>
                  <tr>
                    <th>Asset Class</th>
                    <th>Value</th>
                    <th>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEffectiveAssetRows.map((row) => (
                    <tr key={row.key || row.label}>
                      <td>{row.label}</td>
                      <td>{formatCurrency(row.value)}</td>
                      <td>{formatAssetPercentage(row.percentage, row.value, effectiveAssetTotal)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td>Total</td>
                    <td>{formatCurrency(effectiveAssetTotal)}</td>
                    <td>100.00%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="portfolio-totals">
              <div className="asset-pie-chart-wrap">
                <HighchartsReact highcharts={Highcharts} options={assetBreakupPieOptions} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="insight-section">
        <div className="insight-section-head">
          <h3>Counts</h3>
          <p>Total items parsed from the statement.</p>
        </div>
        <div className="summary-kpi-row">
          <article>
            <span>Mutual Funds</span>
            <strong>{summary?.totalMutualFunds || 0}</strong>
          </article>
          <article>
            <span>Demat Securities</span>
            <strong>{summary?.totalDematSecurities || 0}</strong>
          </article>
        </div>
      </section>

      {yearlyValuation.length ? (
        <section className="insight-section">
          <div className="insight-section-head yearly-head">
            <div>
              <h3>Yearly Portfolio Valuation</h3>
              <p>Month-wise valuation trend extracted from the CDSL report.</p>
            </div>
            <button
              type="button"
              className="yearly-table-toggle"
              onClick={() => setShowYearlyTable((prev) => !prev)}
              aria-label={showYearlyTable ? "Hide yearly valuation table" : "Show yearly valuation table"}
              title={showYearlyTable ? "Hide table" : "Show table"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5C6.5 5 2.15 8.4 1 12c1.15 3.6 5.5 7 11 7s9.85-3.4 11-7c-1.15-3.6-5.5-7-11-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
              <span>{showYearlyTable ? "Hide table" : "Show table"}</span>
            </button>
          </div>
          <YearlyValuationLineChart data={yearlyValuation} />
          {showYearlyTable ? (
            <div className="yearly-table-wrap">
              <table className="yearly-table">
                <thead>
                  <tr>
                    <th>Month-Year</th>
                    <th>Portfolio Valuation</th>
                    <th>Change (₹)</th>
                    <th>Change (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyValuation.map((row) => (
                    <tr key={row.monthYear}>
                      <td>{row.monthYear}</td>
                      <td>{formatCurrency(row.portfolioValue)}</td>
                      <td>{formatSignedCurrency(row.changeValue)}</td>
                      <td>{formatSignedPercent(row.changePercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="insight-section">
        <div className="insights-header">
          <h3>Health Check Snapshot</h3>
          <p>Quick-read highlights for top exposure, concentration, and latest transaction activity.</p>
        </div>

        <div className="health-grid">
          <article className="health-card health-card-mf">
            <span className="health-label">Largest Mutual Fund Position</span>
            <strong className="health-name">{topMutualFund?.scheme_name || "Not available"}</strong>
            <p className="health-value">{topMutualFund ? formatCurrency(topMutualFund.value) : "-"}</p>
            <p className="health-note">Highest value mutual fund holding in your portfolio.</p>
          </article>
          <article className="health-card health-card-equity">
            <span className="health-label">Largest Equity Position</span>
            <strong className="health-name">{topDemat ? toTitleCase(topDemat.security_name) : "Not available"}</strong>
            <p className="health-value">{topDemat ? formatCurrency(topDemat.value) : "-"}</p>
            <p className="health-note">Highest value stock or demat security in your portfolio.</p>
          </article>
          <article className="health-card health-card-risk">
            <span className="health-label">Concentration Risk (Top 3 MF)</span>
            <strong>{top3ConcentrationPct.toFixed(2)}%</strong>
            <p className="health-value">{formatCurrency(top3MfValue)} of total portfolio</p>
            <p className="health-note">{concentrationLabel}</p>
          </article>
          <article className={`health-card ${isRedemptionTxn ? "health-card-alert" : ""}`}>
            <span className="health-label">Most Recent Transaction</span>
            <strong>{latestTxnTitle}</strong>
            <p className={`health-value ${isRedemptionTxn ? "negative" : ""}`}>
              {latestTxnValueText}
            </p>
            <p className="health-note">{latestTxnNote}</p>
          </article>
        </div>
      </section>
    </section>
  );
}

function formatCurrency(value) {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  });
}

function formatSignedCurrency(value) {
  if (typeof value !== "number") return "-";
  if (value === 0) return formatCurrency(value);
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(value))}`;
}

function formatSignedPercent(value) {
  if (typeof value !== "number") return "-";
  if (value === 0) return "0.00%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatCurrencyOrNA(value) {
  if (typeof value !== "number") return "N/A";
  return formatCurrency(value);
}

function formatPercentOfTotal(value, totalValue) {
  if (typeof value !== "number" || typeof totalValue !== "number" || totalValue <= 0) return "-";
  return `${((value / totalValue) * 100).toFixed(2)}%`;
}

function formatAssetPercentage(percentage, value, totalValue) {
  if (typeof percentage === "number") return `${percentage.toFixed(2)}%`;
  return formatPercentOfTotal(value, totalValue);
}

function mapConsolidatedTypeToSummaryKey(accountType) {
  const text = String(accountType || "").toLowerCase();
  if (text.includes("cdsl demat")) return "cdslDematAccounts";
  if (text.includes("nsdl demat")) return "nsdlDematAccounts";
  if (text.includes("mutual fund folios")) return "mutualFundFolios";
  return null;
}

function areSameHolders(a, b) {
  const left = normalizeHolderName(a);
  const right = normalizeHolderName(b);
  return left && right && left === right;
}

function normalizeHolderName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function toTitleCase(value) {
  const text = String(value || "").toLowerCase().trim();
  if (!text) return "-";
  return text.replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function toCasDateKey(value) {
  const match = String(value || "").match(/^([0-9]{2})-([0-9]{2})-([0-9]{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!day || !month || !year) return null;
  return year * 10000 + month * 100 + day;
}

function isValidEquityHoldingForInsights(holding) {
  const name = String(holding?.security_name || "");
  if (!name.trim()) return false;
  if ((holding?.value || 0) <= 0) return false;

  // Filter out OCR/PDF merged rows that chain multiple securities into one label.
  if (/--\s+--\s+--\s+--/i.test(name)) return false;
  if ((name.match(/\bINE[0-9A-Z]{9,10}\b/gi) || []).length > 1) return false;

  return true;
}

function YearlyValuationLineChart({ data }) {
  const pointsData = data.filter((row) => typeof row?.portfolioValue === "number");
  if (pointsData.length < 2) return null;

  const chartOptions = {
    chart: {
      type: "line",
      height: 280,
      backgroundColor: "transparent",
      spacing: [12, 8, 18, 8]
    },
    title: { text: null },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      categories: pointsData.map((row) => row.monthYear),
      tickLength: 0,
      lineColor: "#e5e7eb",
      labels: {
        style: { color: "#6b7280", fontSize: "11px" }
      }
    },
    yAxis: {
      title: { text: null },
      gridLineColor: "#e5e7eb",
      labels: {
        formatter() {
          return formatCompactNumber(this.value);
        },
        style: { color: "#6b7280", fontSize: "11px" }
      }
    },
    tooltip: {
      backgroundColor: "#111827",
      borderColor: "#111827",
      borderRadius: 8,
      style: { color: "#f9fafb", fontSize: "12px" },
      formatter() {
        const row = pointsData[this.point.index];
        const valueLine = `<b>${formatCurrency(this.y)}</b>`;
        const changeValue = formatSignedCurrency(row?.changeValue);
        const changePct = formatSignedPercent(row?.changePercent);
        return `<span>${this.x}</span><br/>${valueLine}<br/><span>Change: ${changeValue} (${changePct})</span>`;
      }
    },
    plotOptions: {
      series: {
        animation: false
      },
      line: {
        marker: {
          enabled: true,
          radius: 4,
          lineWidth: 2,
          lineColor: "#ffffff",
          fillColor: "#2563eb"
        },
        lineWidth: 3,
        color: "#2563eb"
      }
    },
    series: [
      {
        type: "line",
        data: pointsData.map((row) => row.portfolioValue)
      }
    ]
  };

  return (
    <div className="yearly-line-chart-wrap">
      <HighchartsReact highcharts={Highcharts} options={chartOptions} />
    </div>
  );
}

function formatCompactNumber(value) {
  const abs = Math.abs(value);
  if (abs >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${(value / 100000).toFixed(1)}L`;
  return Math.round(value).toString();
}

export default DashboardSummary;
