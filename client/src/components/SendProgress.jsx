import React, { useEffect, useRef, useState } from "react";
import { CheckCircle, XCircle, Download, Plus, StopCircle } from "lucide-react";
import { api } from "../lib/api.js";
import { useNavigate } from "react-router-dom";

function CircularProgress({ pct, size = 120 }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="#2563eb"
        strokeWidth="8"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="middle"
        className="rotate-90"
        style={{ fontSize: "18px", fontWeight: 700, fill: "#1e40af", transform: "rotate(90deg)", transformOrigin: "50px 50px" }}
      >
        {pct}%
      </text>
    </svg>
  );
}

export default function SendProgress({ campaignId }) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState({ sent: 0, failed: 0, total: 0 });
  const [logs, setLogs] = useState([]);
  const [done, setDone] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const logEndRef = useRef(null);
  const evtRef = useRef(null);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const es = new EventSource(`/api/campaigns/${campaignId}/progress`);
    evtRef.current = es;

    es.addEventListener("progress", (e) => {
      const d = JSON.parse(e.data);
      setProgress({ sent: d.sent, failed: d.failed, total: d.total });
      setLogs((prev) => [
        ...prev.slice(-199),
        {
          phone: d.currentPhone,
          status: d.status,
          metaId: d.metaMessageId,
          error: d.error,
          errorCode: d.errorCode,
          metaResponse: d.metaResponse,
        },
      ]);
    });

    es.addEventListener("complete", (e) => {
      const d = JSON.parse(e.data);
      setProgress({ sent: d.sent, failed: d.failed, total: d.total });
      setDone(true);
      es.close();
    });

    es.addEventListener("cancelled", () => {
      setCancelled(true);
      setDone(true);
      es.close();
    });

    es.addEventListener("error", (e) => {
      try {
        const d = JSON.parse(e.data);
        setErrorMsg(d.message);
      } catch {}
      setDone(true);
      es.close();
    });

    return () => es.close();
  }, [campaignId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const pct =
    progress.total > 0
      ? Math.round(((progress.sent + progress.failed) / progress.total) * 100)
      : 0;

  const elapsed = (Date.now() - startTime.current) / 1000;
  const rate =
    elapsed > 0 ? Math.round((progress.sent + progress.failed) / elapsed) : 0;

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.cancelCampaign(campaignId);
    } catch {}
  }

  async function handleDownloadReport() {
    const blob = await api.downloadReport(campaignId);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Progress ring + stats */}
      <div className="card p-6 flex flex-col md:flex-row items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <CircularProgress pct={pct} />
          {!done && (
            <p className="text-xs text-gray-500">{rate} msg/sec</p>
          )}
        </div>

        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">{progress.sent}</p>
            <p className="text-xs text-gray-500 mt-1">Sent</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-red-600">{progress.failed}</p>
            <p className="text-xs text-gray-500 mt-1">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-400">{progress.total}</p>
            <p className="text-xs text-gray-500 mt-1">Total</p>
          </div>
        </div>

        {!done ? (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="btn-danger"
          >
            <StopCircle className="w-4 h-4" />
            {cancelling ? "Cancelling..." : "Cancel"}
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {cancelled ? (
              <span className="status-cancelled text-sm px-3 py-1">Cancelled</span>
            ) : errorMsg ? (
              <span className="status-failed text-sm px-3 py-1">Failed</span>
            ) : (
              <span className="status-completed text-sm px-3 py-1">Completed</span>
            )}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {errorMsg}
        </div>
      )}

      {/* Live log */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Message Log</h3>
          <span className="text-xs text-gray-400">{logs.length} entries</span>
        </div>
        <div className="h-64 overflow-y-auto scrollbar-thin font-mono text-xs p-3 space-y-0.5">
          {logs.length === 0 && (
            <p className="text-gray-400 italic text-center py-4">Waiting for messages...</p>
          )}
          {logs.map((l, i) => (
            <div key={i} className={`py-1 ${l.status === "failed" ? "text-red-600" : "text-gray-700"}`}>
              <div className="flex items-start gap-2">
                {l.status === "sent" ? (
                  <CheckCircle className="w-3 h-3 mt-0.5 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 mt-0.5 text-red-500 shrink-0" />
                )}
                <span className="font-medium">{l.phone}</span>
                {l.status === "sent" ? (
                  <span className="text-gray-400">
                    {l.metaId ? `— ${l.metaId.slice(0, 20)}…` : "— sent"}
                  </span>
                ) : (
                  <span className="text-red-500">
                    — {l.errorCode ? `[${l.errorCode}] ` : ""}{l.error}
                  </span>
                )}
              </div>
              {l.metaResponse && (
                <div className="ml-5 mt-0.5 text-red-400 break-all">
                  {JSON.stringify(l.metaResponse)}
                </div>
              )}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Completion actions */}
      {done && (
        <div className="flex items-center gap-3 justify-end">
          <button onClick={handleDownloadReport} className="btn-secondary">
            <Download className="w-4 h-4" /> Download Report
          </button>
          <button onClick={() => navigate("/campaigns/new")} className="btn-primary">
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        </div>
      )}
    </div>
  );
}
