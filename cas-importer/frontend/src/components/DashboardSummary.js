import React, { useState } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

function DashboardSummary({ summary, mutualFundHoldings, dematHoldings, transactions, variant = "full" }) {
  const [showYearlyTable, setShowYearlyTable] = useState(false);
  const mf = summary?.totalMutualFundValue || 0;
  const demat = summary?.totalDematValue || 0;
  const total = summary?.totalPortfolioValue || 0;
  const yearlyValuation = Array.isArray(summary?.yearlyValuation) ? summary.yearlyValuation : [];
  const mfPct = summary?.allocation?.mutualFundPercentage ?? 0;
  const dematPct = summary?.allocation?.dematPercentage ?? 0;
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
        data: [
          {
            name: `Mutual Fund Folios (₹ ${mf.toLocaleString("en-IN")})`,
            y: Number(mf.toFixed(2)),
            color: "#f4b400"
          },
          {
            name: `Equity / Demat (₹ ${demat.toLocaleString("en-IN")})`,
            y: Number(demat.toFixed(2)),
            color: "#3b82f6"
          }
        ]
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
            <strong>₹ {total.toLocaleString("en-IN")}</strong>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-card">
      <section className="insight-section">
        <div className="insight-section-head">
          <h3>Asset Class Breakup</h3>
          <p>Allocation split by value across mutual funds and demat holdings.</p>
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
                  <tr>
                    <td>Mutual Fund Folios</td>
                    <td>₹ {mf.toLocaleString("en-IN")}</td>
                    <td>{mfPct.toFixed(2)}%</td>
                  </tr>
                  <tr>
                    <td>Equity / Demat</td>
                    <td>₹ {demat.toLocaleString("en-IN")}</td>
                    <td>{dematPct.toFixed(2)}%</td>
                  </tr>
                  <tr className="total-row">
                    <td>Total</td>
                    <td>₹ {total.toLocaleString("en-IN")}</td>
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
