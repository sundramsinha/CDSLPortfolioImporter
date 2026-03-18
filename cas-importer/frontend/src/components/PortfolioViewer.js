import React, { useMemo, useState } from "react";

function PortfolioViewer({
  mutualFundHoldings,
  dematHoldings,
  transactions,
  dematTransactions = [],
  mode = "all"
}) {
  const [holdingsSearch, setHoldingsSearch] = useState("");
  const normalizedHoldingsSearch = holdingsSearch.trim().toLowerCase();
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
  const filteredMutualFundHoldings = useMemo(() => {
    if (!normalizedHoldingsSearch) return mutualFundHoldings;
    return mutualFundHoldings.filter((row) =>
      [
        row?.amc,
        row?.scheme_name,
        row?.folio_number,
        row?.isin
      ]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(normalizedHoldingsSearch))
    );
  }, [mutualFundHoldings, normalizedHoldingsSearch]);
  const filteredDematHoldings = useMemo(() => {
    if (!normalizedHoldingsSearch) return dematHoldings;
    return dematHoldings.filter((row) =>
      [row?.isin, row?.security_name, row?.amc]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(normalizedHoldingsSearch))
    );
  }, [dematHoldings, normalizedHoldingsSearch]);

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
        </section>
      ) : null}

      {showHoldings ? (
        <section className="data-section">
          <h3>Holdings Search</h3>
          <div className="upload-inline-row">
            <input
              type="text"
              value={holdingsSearch}
              onChange={(event) => setHoldingsSearch(event.target.value)}
              placeholder="Search by ISIN, security, AMC, scheme, or folio"
            />
          </div>
        </section>
      ) : null}

      {showHoldings && hasMutual ? (
        <section className="data-section">
          <h3>
            Mutual Fund Holdings ({filteredMutualFundHoldings.length}
            {normalizedHoldingsSearch ? ` / ${mutualFundHoldings.length}` : ""})
          </h3>
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
                {filteredMutualFundHoldings.map((row, index) => (
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
          {normalizedHoldingsSearch && !filteredMutualFundHoldings.length ? (
            <p className="empty-state">No mutual fund holdings match this search.</p>
          ) : null}
        </section>
      ) : null}

      {showHoldings && hasDemat ? (
        <section className="data-section">
          <h3>
            Demat Stock Holdings ({filteredDematHoldings.length}
            {normalizedHoldingsSearch ? ` / ${dematHoldings.length}` : ""})
          </h3>
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
                {filteredDematHoldings.map((row, index) => (
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
          {normalizedHoldingsSearch && !filteredDematHoldings.length ? (
            <p className="empty-state">No demat holdings match this search.</p>
          ) : null}
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

export default PortfolioViewer;
