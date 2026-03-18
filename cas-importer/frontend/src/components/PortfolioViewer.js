import React from "react";

function PortfolioViewer({ mutualFundHoldings, dematHoldings, transactions, dematTransactions = [], mode = "all" }) {
  const hasMutual = mutualFundHoldings.length > 0;
  const hasDemat = dematHoldings.length > 0;
  const hasTransactions = transactions.length > 0;
  const hasDematTransactions = dematTransactions.length > 0;
  const normalizedDematTransactions = dematTransactions.reduce(
    (acc, row) => {
      const normalizedRow = {
        ...row,
        isin: row?.isin || acc.lastIsin || "",
        security: row?.security || acc.lastSecurity || ""
      };
      return {
        rows: [...acc.rows, normalizedRow],
        lastIsin: normalizedRow.isin || acc.lastIsin,
        lastSecurity: normalizedRow.security || acc.lastSecurity
      };
    },
    { rows: [], lastIsin: "", lastSecurity: "" }
  ).rows;
  const showHoldings = mode === "all" || mode === "holdings";
  const showTransactions = mode === "all" || mode === "transactions";
  const mutualValue = mutualFundHoldings.reduce((sum, row) => sum + (row.value || 0), 0);
  const dematValue = dematHoldings.reduce((sum, row) => sum + (row.value || 0), 0);
  const amcDistribution = mutualFundHoldings
    .reduce((acc, row) => {
      const amc = row.amc || "Unknown AMC";
      if (!acc[amc]) {
        acc[amc] = { amc, schemeCount: 0, totalValue: 0 };
      }
      acc[amc].schemeCount += 1;
      acc[amc].totalValue += row.value || 0;
      return acc;
    }, {})
    .valueOf();
  const amcDistributionRows = Object.values(amcDistribution).sort((a, b) => b.totalValue - a.totalValue);
  const redemptionCount = transactions.filter((txn) =>
    /redemption|withdraw|switch out/i.test(txn.description || "")
  ).length;
  const inflowCount = transactions.length - redemptionCount;

  if (!hasMutual && !hasDemat && !hasTransactions && !hasDematTransactions) {
    return <p className="empty-state">No holdings parsed yet.</p>;
  }

  return (
    <div>
      {showHoldings ? (
        <section className="section-kpis">
          <article>
            <span>Mutual Fund Book Value</span>
            <strong>{formatCurrency(mutualValue)}</strong>
          </article>
          <article>
            <span>Demat Book Value</span>
            <strong>{formatCurrency(dematValue)}</strong>
          </article>
          <article>
            <span>Inflow-like Transactions</span>
            <strong>{inflowCount}</strong>
          </article>
          <article>
            <span>Outflow/Redemption Transactions</span>
            <strong>{redemptionCount}</strong>
          </article>
        </section>
      ) : null}

      {showHoldings && hasMutual ? (
        <section className="data-section">
          <h3>AMC Distribution ({amcDistributionRows.length})</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>AMC</th>
                  <th>Scheme Count</th>
                  <th>Total Value</th>
                  <th>Allocation</th>
                </tr>
              </thead>
              <tbody>
                {amcDistributionRows.map((row) => {
                  const allocation = mutualValue > 0 ? (row.totalValue / mutualValue) * 100 : 0;
                  return (
                    <tr key={row.amc}>
                      <td>{row.amc}</td>
                      <td>{row.schemeCount}</td>
                      <td>{formatCurrency(row.totalValue)}</td>
                      <td>{formatPercent(allocation)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showHoldings && hasMutual ? (
        <section className="data-section">
          <h3>Mutual Fund Holdings ({mutualFundHoldings.length})</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>AMC</th>
                  <th>Scheme</th>
                  <th>Folio</th>
                  <th>Units</th>
                  <th>NAV</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {mutualFundHoldings.map((row, index) => (
                  <tr key={`${row.folio_number}-${row.scheme_name}-${index}`}>
                    <td>{row.amc || "-"}</td>
                    <td>{row.scheme_name || "-"}</td>
                    <td>{row.folio_number || "-"}</td>
                    <td>{formatNumber(row.units)}</td>
                    <td>{formatNumber(row.nav)}</td>
                    <td>{formatCurrency(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showHoldings && hasDemat ? (
        <section className="data-section">
          <h3>Demat Stock Holdings ({dematHoldings.length})</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ISIN</th>
                  <th>Security</th>
                  <th>Quantity</th>
                  <th>Market Price</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {dematHoldings.map((row, index) => (
                  <tr key={`${row.isin}-${index}`}>
                    <td>{row.isin || "-"}</td>
                    <td>{row.security_name || "-"}</td>
                    <td>{formatNumber(row.quantity)}</td>
                    <td>{formatNumber(row.market_price)}</td>
                    <td>{formatCurrency(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showTransactions && hasTransactions ? (
        <section className="data-section">
          <h3>Mutual Fund Transactions ({transactions.length})</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ISIN</th>
                  <th>Scheme</th>
                  <th>Description</th>
                  <th>Units</th>
                  <th className="date-nav-col">Date / NAV</th>
                  <th>STT</th>
                  <th>Amount</th>
                  <th>Opening Balance</th>
                  <th>Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((row, index) => (
                  <tr key={`${row.scheme_code}-${row.date}-${index}`}>
                    <td>{row.isin || "-"}</td>
                    <td>{row.scheme_name || row.scheme_code || "-"}</td>
                    <td>{row.description || "-"}</td>
                    <td>{formatNumber(row.units)}</td>
                    <td className="date-nav-col">
                      <span className="date-nav-line">{row.date || "-"}</span>
                      <span className="date-nav-line date-nav-sub">NAV: {formatNumber(row.nav)}</span>
                    </td>
                    <td>{formatCurrency(row.stt)}</td>
                    <td>{formatCurrency(row.amount)}</td>
                    <td>{formatNumber(row.opening_balance)}</td>
                    <td>{formatNumber(row.closing_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showTransactions && hasDematTransactions ? (
        <section className="data-section">
          <h3>Demat Transactions ({normalizedDematTransactions.length})</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ISIN</th>
                  <th>Security</th>
                  <th>Transaction Particulars</th>
                  <th className="date-col">Date</th>
                  <th>Opening Bal</th>
                  <th>Credit</th>
                  <th>Debit</th>
                  <th>Closing Bal</th>
                  <th>Stamp Duty</th>
                </tr>
              </thead>
              <tbody>
                {normalizedDematTransactions.map((row, index) => (
                  <tr key={`${row.isin}-${row.date}-${index}`}>
                    <td>{row.isin || "-"}</td>
                    <td>{row.security || "-"}</td>
                    <td>{row.transactionParticulars || "-"}</td>
                    <td className="date-col">{row.date || "-"}</td>
                    <td>{formatNumber(row.openingBalance)}</td>
                    <td>{formatNumber(row.credit)}</td>
                    <td>{formatNumber(row.debit)}</td>
                    <td>{formatNumber(row.closingBalance)}</td>
                    <td>{formatNumber(row.stampDuty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showTransactions && !hasTransactions && !hasDematTransactions ? (
        <p className="empty-state">No transactions found for this statement period.</p>
      ) : null}
    </div>
  );
}

function formatNumber(value) {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

function formatCurrency(value) {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  });
}

function formatPercent(value) {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(2)}%`;
}

export default PortfolioViewer;
