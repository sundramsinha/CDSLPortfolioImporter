import React, { useMemo, useState } from "react";
import UploadCAS from "./components/UploadCAS";
import PortfolioViewer from "./components/PortfolioViewer";
import DashboardSummary from "./components/DashboardSummary";
import AccountDetails from "./components/AccountDetails";

function App() {
  const [activeMainTab, setActiveMainTab] = useState("upload");
  const [mutualFundHoldings, setMutualFundHoldings] = useState([]);
  const [dematHoldings, setDematHoldings] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dematTransactions, setDematTransactions] = useState([]);
  const [accountDetails, setAccountDetails] = useState(null);
  const [serverSummary, setServerSummary] = useState(null);
  const [reportMeta, setReportMeta] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("insights");

  const summary = useMemo(() => {
    const totalMutualFundValue = mutualFundHoldings.reduce((sum, row) => sum + (row.value || 0), 0);
    const totalDematValue = dematHoldings.reduce((sum, row) => sum + (row.value || 0), 0);
    return {
      totalFunds: mutualFundHoldings.length,
      totalMutualFunds: mutualFundHoldings.length,
      totalDematSecurities: dematHoldings.length,
      totalTransactions: transactions.length + dematTransactions.length,
      totalMutualFundValue: Number(totalMutualFundValue.toFixed(2)),
      totalDematValue: Number(totalDematValue.toFixed(2)),
      totalPortfolioValue: Number((totalMutualFundValue + totalDematValue).toFixed(2))
    };
  }, [mutualFundHoldings, dematHoldings, transactions, dematTransactions]);

  const onUploadSuccess = (payload) => {
    setError("");
    setMutualFundHoldings(payload.mutualFundHoldings || payload.portfolio || []);
    setDematHoldings(payload.dematHoldings || []);
    setTransactions(payload.transactions || []);
    setDematTransactions(payload.dematTransactions || []);
    setAccountDetails(payload.accountDetails || payload.summary?.accountDetails || null);
    setServerSummary(payload.summary || null);
    setReportMeta(payload.report || null);
    setActiveMainTab("portfolio");
  };

  const onUploadError = (message) => {
    setMutualFundHoldings([]);
    setDematHoldings([]);
    setTransactions([]);
    setDematTransactions([]);
    setAccountDetails(null);
    setServerSummary(null);
    setReportMeta(null);
    setError(message || "Upload failed.");
  };

  const displaySummary = serverSummary || summary;
  const statementAsOnDate = displaySummary?.statementSummary?.statementAsOnDate || null;
  const hasParsedData =
    Boolean(reportMeta) ||
    mutualFundHoldings.length > 0 ||
    dematHoldings.length > 0 ||
    transactions.length > 0 ||
    dematTransactions.length > 0;
  return (
    <main className="app">
      <header className="top-nav">
        <div className="top-nav-inner">
          <div className="brand-wrap">
            <span className="brand-logo">CI</span>
            <div>
              <strong>CDSL Portfolio Importer</strong>
              <p>Portfolio Intelligence Dashboard</p>
            </div>
          </div>
          <nav className="nav-links">
            <button
              className={`nav-link ${activeMainTab === "upload" ? "active" : ""}`}
              onClick={() => setActiveMainTab("upload")}
            >
              Upload
            </button>
            <button
              className={`nav-link ${activeMainTab === "portfolio" ? "active" : ""}`}
              onClick={() => setActiveMainTab("portfolio")}
            >
              Portfolio
            </button>
          </nav>
          <div className="nav-pill">Deterministic Parser</div>
        </div>
      </header>

      <div className="container">
        <section className="hero-banner">
          <div>
            <h1>CDSL Portfolio Importer</h1>
            <p className="subtitle">
              Upload password-protected CAS PDFs and analyze mutual funds, demat holdings, and
              transactions in one place.
            </p>
          </div>
        </section>

        {activeMainTab === "upload" ? (
          <section className="card">
            <h2>Upload CAS PDF</h2>
            <UploadCAS onSuccess={onUploadSuccess} onError={onUploadError} />
            {error ? <p className="error">{error}</p> : null}
            {reportMeta ? (
              <p className="report-note">
                JSON saved: <strong>{reportMeta.filename}</strong>
              </p>
            ) : null}
          </section>
        ) : null}

        {activeMainTab === "portfolio" ? (
          hasParsedData ? (
            <section className="card">
              <div className="portfolio-top-section">
                <div className="workspace-header">
                  <p className="workspace-date">
                    Statement as on: {statementAsOnDate || "-"}
                  </p>
                </div>
                <DashboardSummary
                  summary={displaySummary}
                  mutualFundHoldings={mutualFundHoldings}
                  dematHoldings={dematHoldings}
                  transactions={transactions}
                  variant="snapshot"
                />
              </div>
              <div className="tabs">
                <button
                  className={`tab-btn ${activeTab === "insights" ? "active" : ""}`}
                  onClick={() => setActiveTab("insights")}
                >
                  Key Insights
                </button>
                <button
                  className={`tab-btn ${activeTab === "holdings" ? "active" : ""}`}
                  onClick={() => setActiveTab("holdings")}
                >
                  Holdings
                </button>
                <button
                  className={`tab-btn ${activeTab === "transactions" ? "active" : ""}`}
                  onClick={() => setActiveTab("transactions")}
                >
                  Transactions
                </button>
                <button
                  className={`tab-btn ${activeTab === "account" ? "active" : ""}`}
                  onClick={() => setActiveTab("account")}
                >
                  Account
                </button>
              </div>

              {activeTab === "insights" ? (
                <DashboardSummary
                  summary={displaySummary}
                  mutualFundHoldings={mutualFundHoldings}
                  dematHoldings={dematHoldings}
                  transactions={transactions}
                  variant="full"
                />
              ) : null}

              {activeTab === "holdings" ? (
                <PortfolioViewer
                  mutualFundHoldings={mutualFundHoldings}
                  dematHoldings={dematHoldings}
                  transactions={transactions}
                  dematTransactions={dematTransactions}
                  mode="holdings"
                />
              ) : null}

              {activeTab === "transactions" ? (
                <PortfolioViewer
                  mutualFundHoldings={mutualFundHoldings}
                  dematHoldings={dematHoldings}
                  transactions={transactions}
                  dematTransactions={dematTransactions}
                  mode="transactions"
                />
              ) : null}

              {activeTab === "account" ? <AccountDetails accountDetails={accountDetails} /> : null}
            </section>
          ) : (
            <section className="card">
              <p className="empty-state">No parsed data yet. Go to Upload tab and import a CAS PDF first.</p>
            </section>
          )
        ) : null}
      </div>
    </main>
  );
}

export default App;
