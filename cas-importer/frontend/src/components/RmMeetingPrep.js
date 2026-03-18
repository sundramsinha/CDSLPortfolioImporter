import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

function RmMeetingPrep({ reportId }) {
  const [riskProfile, setRiskProfile] = useState("unknown");
  const [goals, setGoals] = useState("");
  const [horizonYears, setHorizonYears] = useState("");
  const [sipCapacityMonthly, setSipCapacityMonthly] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const contextPayload = useMemo(
    () => ({
      riskProfile,
      goals,
      horizonYears: horizonYears ? Number(horizonYears) : null,
      sipCapacityMonthly: sipCapacityMonthly ? Number(sipCapacityMonthly) : null
    }),
    [riskProfile, goals, horizonYears, sipCapacityMonthly]
  );
  const sessionKey = useMemo(() => {
    if (!reportId) return "";
    return `rmMeetingPrep:${reportId}:${JSON.stringify(contextPayload)}`;
  }, [reportId, contextPayload]);

  useEffect(() => {
    if (!sessionKey) {
      setResult(null);
      return;
    }
    try {
      const cached = sessionStorage.getItem(sessionKey);
      if (!cached) {
        setResult(null);
        return;
      }
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === "object") {
        setResult(parsed.result || null);
      }
    } catch (_error) {
      setResult(null);
    }
  }, [sessionKey]);

  const generatePrep = async () => {
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
            return;
          }
        }
      } catch (_error) {
        // Ignore cache parse errors and call API.
      }
    }
    try {
      setLoading(true);
      const response = await axios.post(`/api/reports/${reportId}/rm-meeting-prep`, contextPayload);
      const nextResult = response.data || null;
      setResult(nextResult);
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
        "Could not generate RM meeting prep.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="data-section">
      <h3>RM Meeting Prep (AI Draft)</h3>
      <div className="upload-inline-row rm-prep-context-row">
        <select
          className="rm-prep-control rm-prep-select"
          value={riskProfile}
          onChange={(event) => setRiskProfile(event.target.value)}
        >
          <option value="unknown">Risk Profile: Unknown</option>
          <option value="conservative">Risk Profile: Conservative</option>
          <option value="moderate">Risk Profile: Moderate</option>
          <option value="aggressive">Risk Profile: Aggressive</option>
        </select>
        <input
          className="rm-prep-control rm-prep-goals"
          type="text"
          value={goals}
          placeholder="Goals (comma separated)"
          onChange={(event) => setGoals(event.target.value)}
        />
        <input
          className="rm-prep-control rm-prep-mini"
          type="number"
          min="1"
          step="1"
          value={horizonYears}
          placeholder="Horizon years"
          onChange={(event) => setHorizonYears(event.target.value)}
        />
        <input
          className="rm-prep-control rm-prep-mini"
          type="number"
          min="0"
          step="100"
          value={sipCapacityMonthly}
          placeholder="Monthly SIP capacity"
          onChange={(event) => setSipCapacityMonthly(event.target.value)}
        />
        <button
          type="button"
          className="rm-prep-generate-btn rm-prep-inline-btn"
          onClick={generatePrep}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate RM Prep"}
        </button>
      </div>
      <p className="summary-kpi-note rm-prep-intro">
        Build a focused meeting agenda, client questions, objection responses, and decision checklist from this report.
      </p>

      {error ? <p className="error">{error}</p> : null}

      {result ? (
        <div className="section-columns">
          <article className="summary-card">
            <h4>Meeting Agenda</h4>
            <ul>
              {(result.meetingAgenda || []).map((item, index) => (
                <li key={`agenda-${index}`}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="summary-card">
            <h4>Questions To Ask</h4>
            <ul>
              {(result.questionsToAsk || []).map((item, index) => (
                <li key={`q-${index}`}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="summary-card">
            <h4>Objection Handling</h4>
            <ul>
              {(result.objectionHandling || []).map((item, index) => (
                <li key={`obj-${index}`} className="rm-prep-objection-item">
                  <strong>{item.likelyObjection}</strong>
                  <span>{item.response}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="summary-card">
            <h4>Decision Checklist</h4>
            <ul>
              {(result.decisionChecklist || []).map((item, index) => (
                <li key={`check-${index}`}>{item}</li>
              ))}
            </ul>
          </article>

        </div>
      ) : null}
      {result ? <p className="summary-kpi-note">{result.disclaimer || ""}</p> : null}
    </section>
  );
}

export default RmMeetingPrep;
