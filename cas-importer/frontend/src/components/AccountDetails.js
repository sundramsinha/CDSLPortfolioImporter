import React, { useState } from "react";

const sanitizeField = (value, trailingLabels = []) => {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "-";
  const labelPattern = trailingLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (!labelPattern) return raw;
  const trailingRegex = new RegExp(`\\s*(?:\\|\\s*)?(?:${labelPattern})\\s*:.*$`, "i");
  const cleaned = raw.replace(trailingRegex, "").trim();
  return cleaned || "-";
};

function AccountDetails({ accountDetails }) {
  if (!accountDetails) {
    return (
      <section className="account-section">
        <p className="empty-state">No account details were extracted from this statement.</p>
      </section>
    );
  }

  const dematAccounts = Array.isArray(accountDetails.dematAccounts) ? accountDetails.dematAccounts : [];
  const mutualFundFolios = Array.isArray(accountDetails.mutualFundFolios) ? accountDetails.mutualFundFolios : [];
  const foliosByAmc = mutualFundFolios.reduce((groups, row) => {
    const amcName = row?.amcName || "Unknown AMC";
    if (!groups[amcName]) groups[amcName] = [];
    groups[amcName].push(row);
    return groups;
  }, {});
  const [expandedAmcs, setExpandedAmcs] = useState({});

  return (
    <section className="account-section">
      <div className="account-overview">
        <article>
          <span>Primary Holder</span>
          <strong>{accountDetails.primaryHolderName || "-"}</strong>
        </article>
        <article>
          <span>PAN</span>
          <strong>{accountDetails.pan || "-"}</strong>
        </article>
        <article>
          <span>Demat Accounts</span>
          <strong>{accountDetails.totals?.dematAccounts ?? dematAccounts.length}</strong>
        </article>
        <article>
          <span>MF Folios</span>
          <strong>{accountDetails.totals?.mutualFundFolios ?? mutualFundFolios.length}</strong>
        </article>
      </div>

      <div className="account-block">
        <h3>CDSL Demat Accounts</h3>
        {dematAccounts.length ? (
          <div className="account-cards">
            {dematAccounts.map((item) => (
              <article key={`${item.dpId}-${item.clientId}`} className="account-card">
                {/*
                  Some PDFs merge multiple labels in one captured value.
                  Trim any trailing sibling-label segments for clean rendering.
                */}
                {(() => {
                  const accountStatus = sanitizeField(item.accountStatus, ["BO Status", "Frozen Status", "Nominee"]);
                  const frozenStatus = sanitizeField(item.frozenStatus, ["BO Status", "Nominee", "Account Status"]);
                  const nominee = sanitizeField(item.nominee, ["BO Status", "Frozen Status", "Account Status"]);
                  const boStatus = sanitizeField(item.boStatus, ["Frozen Status", "Nominee", "Account Status"]);

                  return (
                    <>
                <p>
                  <b>DP Name:</b> {item.dpName || "-"}
                </p>
                <p>
                  <b>DP ID / Client ID:</b> {item.dpId || "-"} / {item.clientId || "-"}
                </p>
                <p>
                  <b>Email / Mobile:</b> {item.email || "-"} / {item.mobile || "-"}
                </p>
                <p>
                  <b>Status:</b> {accountStatus} | <b>Frozen Status:</b> {frozenStatus}
                </p>
                <p>
                  <b>Nominee:</b> <b>{nominee}</b> | <b>BO Status:</b> {boStatus}
                </p>
                    </>
                  );
                })()}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No demat account blocks found.</p>
        )}
      </div>

      <div className="account-block">
        <h3>MF Folios</h3>
        {mutualFundFolios.length ? (
          Object.entries(foliosByAmc).map(([amcName, amcFolios]) => (
            <section key={amcName} className="mf-amc-group">
              <button
                type="button"
                className="mf-amc-header"
                onClick={() => setExpandedAmcs((prev) => ({ ...prev, [amcName]: !prev[amcName] }))}
                aria-expanded={Boolean(expandedAmcs[amcName])}
              >
                <h4>{amcName}</h4>
                <span>- ({amcFolios.length} folio)</span>
                <i className="mf-amc-chevron" aria-hidden="true">
                  {expandedAmcs[amcName] ? "▾" : "▸"}
                </i>
              </button>
              {expandedAmcs[amcName] ? (
                <div className="mf-folio-cards">
                  {amcFolios.map((row, index) => (
                    <article key={`${amcName}-${row.folioNo}-${row.schemeCode}-${index}`} className="mf-folio-card">
                      <p className="mf-folio-scheme">
                        <b>Scheme Name :</b> {row.schemeName || "-"}
                      </p>
                      <div className="mf-line-grid">
                        <p>
                          <b>Scheme Code :</b> {row.schemeCode || "-"}
                        </p>
                        <p>
                          <b>Folio No :</b> {row.folioNo || "-"}
                        </p>
                        <p>
                          <b>Mode of Holding :</b> {row.modeOfHolding || "-"}
                        </p>
                        <p>
                          <b>Email id :</b> {row.email || "-"}
                        </p>
                        <p>
                          <b>KYC of Investor/s :</b> {row.kycStatus || "-"}
                        </p>
                        <p>
                          <b>Mobile No :</b> {row.mobile || "-"}
                        </p>
                        <p>
                          <b>Nominee :</b> {row.nominee || "-"}
                        </p>
                        <p>
                          <b>ISIN :</b> {row.isin || "-"}
                        </p>
                        <p>
                          <b>UCC :</b> {row.ucc || "-"}
                        </p>
                        <p>
                          <b>RTA :</b> {row.rta || "-"}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          ))
        ) : (
          <p className="empty-state">No MF folio account blocks found.</p>
        )}
      </div>
    </section>
  );
}

export default AccountDetails;
