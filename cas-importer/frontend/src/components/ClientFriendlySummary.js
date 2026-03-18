import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

function ClientFriendlySummary({ reportId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [resultSource, setResultSource] = useState("");

  const contextPayload = useMemo(
    () => ({
      riskProfile: "unknown",
      goals: "",
      horizonYears: null,
      sipCapacityMonthly: null
    }),
    []
  );
  const sessionKey = useMemo(() => {
    if (!reportId) return "";
    return `clientSummary:v4:${reportId}:${JSON.stringify(contextPayload)}`;
  }, [reportId, contextPayload]);

  useEffect(() => {
    if (!sessionKey) {
      setResult(null);
      setResultSource("");
      return;
    }
    try {
      const cached = sessionStorage.getItem(sessionKey);
      if (!cached) {
        setResult(null);
        setResultSource("");
        return;
      }
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object") {
        setResult(parsed.result || null);
        setResultSource("session-cache");
      }
    } catch (_error) {
      setResult(null);
      setResultSource("");
    }
  }, [sessionKey]);

  const generateSummary = async () => {
    if (!reportId) {
      setError("Missing report id. Please upload and parse a CAS report first.");
      return;
    }
    setError("");
    if (sessionKey) {
      try {
        const cached = sessionStorage.getItem(sessionKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.result) {
            setResult(parsed.result);
            setResultSource("session-cache");
            return;
          }
        }
      } catch (_error) {
        // Ignore cache parse errors and call API.
      }
    }
    try {
      setLoading(true);
      const response = await axios.post(`/api/reports/${reportId}/client-summary`, contextPayload);
      const nextResult = response.data || null;
      setResult(nextResult);
      setResultSource(nextResult?.source || "openai");
      if (sessionKey && nextResult) {
        sessionStorage.setItem(
          sessionKey,
          JSON.stringify({
            generatedAt: new Date().toISOString(),
            result: nextResult
          })
        );
      }
    } catch (requestError) {
      const responseData = requestError?.response?.data;
      const message =
        (typeof responseData === "object" && responseData?.error) ||
        (typeof responseData === "string" && responseData.slice(0, 180)) ||
        requestError?.message ||
        "Could not generate client-friendly summary.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="data-section">
      <h3>Client-Friendly Summary (AI Draft)</h3>
      <div className="summary-toolbar">
        <span className="summary-kpi-note">Generate a client-ready draft from parsed report data.</span>
        <button
          type="button"
          className="client-summary-generate-btn"
          onClick={generateSummary}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate Summary"}
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {result ? (
        <div className="section-columns">
          <article className="summary-card">
            <h4>Summary</h4>
            <p>{result.onePageSummary || "-"}</p>
          </article>

          <article className="summary-card">
            <h4>Analytics</h4>
            <ul>
              {(result.analyticsInsights || []).map((item, index) => (
                <li key={`analytics-${index}`}>{item}</li>
              ))}
              {!Array.isArray(result.analyticsInsights) || result.analyticsInsights.length === 0 ? (
                <li>Analytics unavailable in cached response. Regenerate once to refresh.</li>
              ) : null}
            </ul>
          </article>

          <article className="summary-card">
            <h4>Asset Class Aggregation</h4>
            <ul>
              {(result.assetClassAggregation || []).map((item, index) => (
                <li key={`asset-class-${index}`}>
                  {item.label || "Other"}: INR {formatCurrency(item.value)} ({formatPct(item.percentage)})
                </li>
              ))}
              {!Array.isArray(result.assetClassAggregation) || result.assetClassAggregation.length === 0 ? (
                <li>Asset class breakup unavailable in current response.</li>
              ) : null}
            </ul>
          </article>

          <article className="summary-card">
            <h4>Risks</h4>
            <ul>
              {(result.topRisks || []).map((item, index) => (
                <li key={`risk-${index}`}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="summary-card">
            <h4>Actions</h4>
            <ul>
              {(result.topActions || []).map((item, index) => (
                <li key={`action-${index}`}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="summary-card">
            <h4>RM Plan</h4>
            <ul>
              {(result.rmNext30Days || []).map((item, index) => (
                <li key={`next-${index}`}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      ) : null}
      {result ? (
        <p className="summary-kpi-note">
          {result.disclaimer || ""}
          {resultSource ? ` (source: ${resultSource})` : ""}
        </p>
      ) : null}
    </section>
  );
}

function formatCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatPct(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0.00%";
  return `${numeric.toFixed(2)}%`;
}

export default ClientFriendlySummary;
