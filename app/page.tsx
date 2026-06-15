"use client";

import { useState, FormEvent } from "react";
import type { SearchResult, TrademarkRecord } from "@/lib/uspto";

function StatusBadge({ record }: { record: TrademarkRecord }) {
  return <span className={`badge ${record.status}`}>{record.statusLabel}</span>;
}

function ResultCard({ record }: { record: TrademarkRecord }) {
  return (
    <div className="card">
      <div className="card-top">
        <span className="mark">{record.wordmark}</span>
        <StatusBadge record={record} />
      </div>
      <div className="meta">
        {record.owners[0] && (
          <span>
            <b>Owner:</b> {record.owners[0].name}
          </span>
        )}
        {record.serialNumber && (
          <span>
            <b>Serial:</b> {record.serialNumber}
          </span>
        )}
        {record.registrationNumber && (
          <span>
            <b>Reg #:</b> {record.registrationNumber}
          </span>
        )}
        {record.filingDate && (
          <span>
            <b>Filed:</b> {record.filingDate}
          </span>
        )}
        {record.registrationDate && (
          <span>
            <b>Registered:</b> {record.registrationDate}
          </span>
        )}
      </div>
      {record.description && <div className="desc">{record.description}</div>}
    </div>
  );
}

export default function Home() {
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = term.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Request failed (HTTP ${res.status}).`);
      } else {
        setResult(data as SearchResult);
      }
    } catch {
      setError("Could not reach the server. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <div className="hero">
        <h1>App Name Trademark Checker</h1>
        <p>See whether your app name collides with a registered US trademark.</p>
      </div>

      <form className="search" onSubmit={onSubmit}>
        <input
          className="term"
          type="text"
          placeholder="Enter an app name, e.g. Spotify"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoFocus
          maxLength={100}
        />
        <button className="go" type="submit" disabled={loading || !term.trim()}>
          {loading ? <span className="spinner" /> : "Check"}
        </button>
      </form>
      <div className="hint">Searches live and dead marks in the USPTO database.</div>

      {error && <div className="error">{error}</div>}

      {result && (
        <>
          <div className={`verdict ${result.exactConflict ? "conflict" : "clear"}`}>
            <span className="icon">{result.exactConflict ? "⚠️" : "✅"}</span>
            <div>
              {result.exactConflict ? (
                <>
                  <h2>“{result.query}” has a live exact-match trademark</h2>
                  <p>
                    A registered, live mark with this exact name exists. Using it for an app could
                    risk infringement — review the matches below and consider legal advice.
                  </p>
                </>
              ) : (
                <>
                  <h2>No live exact match for “{result.query}”</h2>
                  <p>
                    No live trademark exactly matches this name. Similar or related marks may still
                    pose a risk — scan the results below before deciding.
                  </p>
                </>
              )}
            </div>
          </div>

          {result.records.length > 0 ? (
            <>
              <div className="count">
                {result.total} match{result.total === 1 ? "" : "es"} found
                {result.records.length < result.total && ` (showing ${result.records.length})`}
              </div>
              {result.records.map((r, i) => (
                <ResultCard key={`${r.serialNumber ?? r.wordmark}-${i}`} record={r} />
              ))}
            </>
          ) : (
            <div className="empty">No trademark records found for “{result.query}”.</div>
          )}
        </>
      )}

      <div className="disclaimer">
        Data sourced live from the USPTO trademark register. This tool is informational only and is
        not legal advice. A clear result here does not guarantee a name is available — consult a
        trademark attorney before launching.
      </div>
    </main>
  );
}
