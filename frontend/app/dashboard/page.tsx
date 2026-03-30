"use client";

import { useEffect, useMemo, useState } from "react";

type HistoryUpload = {
  caseId: string;
  personName: string;
  age: number | null;
  gender: "male" | "female" | "unknown";
  imageUrl: string;
  imageFilename: string;
  videoUrl: string;
  videoFilename: string;
  status: "pending" | "completed" | "failed";
  uploadedAt: string;
  updatedAt: string;
};

type HistoryResponse = {
  items: HistoryUpload[];
};

const formatDate = (value: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
};

export default function DashboardPage() {
  const [items, setItems] = useState<HistoryUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/history/uploads", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({ items: [] }))) as HistoryResponse;
        if (!active) return;
        setItems(Array.isArray(payload.items) ? payload.items : []);
      } catch {
        if (!active) return;
        setError("Unable to load dashboard history at the moment.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();
    const interval = window.setInterval(load, 7000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const summary = useMemo(() => {
    const total = items.length;
    const completed = items.filter((entry) => entry.status === "completed").length;
    const pending = items.filter((entry) => entry.status === "pending").length;
    const failed = items.filter((entry) => entry.status === "failed").length;
    return { total, completed, pending, failed };
  }, [items]);

  return (
    <main className="page-shell">
      <section className="portal-card">
        <header className="portal-header">
          <div>
            <span className="eyebrow">Operations Dashboard</span>
            <h1>Historical Uploads</h1>
            <p>Case history is logged asynchronously and displayed here without affecting model inference flow.</p>
          </div>
          <a className="status-chip dashboard-link" href="/">
            Back to Generator
          </a>
        </header>

        <section className="dashboard-summary-grid">
          <article className="helper-card">
            <span>Total Cases</span>
            <strong>{summary.total}</strong>
          </article>
          <article className="helper-card">
            <span>Completed</span>
            <strong>{summary.completed}</strong>
          </article>
          <article className="helper-card">
            <span>Pending</span>
            <strong>{summary.pending}</strong>
          </article>
          <article className="helper-card">
            <span>Failed</span>
            <strong>{summary.failed}</strong>
          </article>
        </section>

        <section className="dashboard-table-wrap">
          {loading ? <p className="dashboard-note">Loading dashboard records...</p> : null}
          {error ? <p className="dashboard-note dashboard-error">{error}</p> : null}

          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Image</th>
                <th>Name</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Uploaded</th>
                <th>Video</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="dashboard-empty">
                    No upload history available yet.
                  </td>
                </tr>
              ) : (
                items.map((entry) => (
                  <tr key={entry.caseId}>
                    <td>{entry.caseId}</td>
                    <td>{entry.imageFilename || "-"}</td>
                    <td>{entry.personName || "-"}</td>
                    <td>{typeof entry.age === "number" ? entry.age : "-"}</td>
                    <td>{entry.gender || "unknown"}</td>
                    <td>{formatDate(entry.uploadedAt)}</td>
                    <td>
                      {entry.videoUrl ? (
                        <a href={entry.videoUrl} target="_blank" rel="noreferrer">
                          {entry.videoFilename || "Open"}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <span className={`dashboard-status dashboard-status-${entry.status}`}>{entry.status}</span>
                    </td>
                    <td>{formatDate(entry.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </section>
    </main>
  );
}
