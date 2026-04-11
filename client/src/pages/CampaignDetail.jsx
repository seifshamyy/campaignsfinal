import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, RotateCcw, ChevronLeft, ChevronRight, Search, Bug, Copy, Check } from "lucide-react";
import { api } from "../lib/api.js";

const STATUS_CLASS = {
  draft: "status-draft",
  sending: "status-sending",
  completed: "status-completed",
  failed: "status-failed",
  cancelled: "status-cancelled",
};

const MSG_STATUS_CLASS = {
  pending: "badge bg-gray-100 text-gray-500",
  sent: "badge bg-blue-100 text-blue-700",
  delivered: "badge bg-green-100 text-green-700",
  read: "badge bg-purple-100 text-purple-700",
  failed: "badge bg-red-100 text-red-700",
};

function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [debugData, setDebugData] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadCampaign() {
    try {
      const c = await api.getCampaign(id);
      setCampaign(c);
    } catch {}
    setLoading(false);
  }

  async function loadMessages(p = 1, status = statusFilter, phone = phoneSearch) {
    const params = { page: p, limit: 50 };
    if (status !== "all") params.status = status;
    if (phone) params.phone = phone;
    try {
      const m = await api.getCampaignMessages(id, params);
      setMessages(m);
      setPage(p);
    } catch {}
  }

  useEffect(() => {
    loadCampaign();
    loadMessages();
  }, [id]);

  useEffect(() => {
    loadMessages(1, statusFilter, phoneSearch);
  }, [statusFilter, phoneSearch]);

  async function handleDownloadReport() {
    const blob = await api.downloadReport(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign_${id}_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDebug() {
    setDebugOpen(true);
    if (debugData) return;
    setDebugLoading(true);
    try {
      const d = await api.debugPayload(id);
      setDebugData(d);
    } catch (err) {
      setDebugData({ error: err.message });
    } finally {
      setDebugLoading(false);
    }
  }

  function handleCopy(text) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRetry() {
    setRetrying(true);
    try {
      const result = await api.retryFailed(id);
      navigate(`/campaigns/${result.campaign.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "var(--brand)" }} />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Campaign not found.</p>
        <button onClick={() => navigate("/")} className="btn-secondary mt-4">
          Back to Campaigns
        </button>
      </div>
    );
  }

  const successRate =
    campaign.totalRecipients > 0
      ? Math.round((campaign.sent / campaign.totalRecipients) * 100)
      : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate("/")}
            className="mt-0.5 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{campaign.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={STATUS_CLASS[campaign.status] || "status-draft"}>
                {campaign.status}
              </span>
              <span className="text-xs text-gray-400">
                {campaign.template?.name} · {campaign.template?.language}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.failed > 0 && campaign.status !== "sending" && (
            <button onClick={handleRetry} disabled={retrying} className="btn-secondary">
              <RotateCcw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
              Retry Failed ({campaign.failed})
            </button>
          )}
          <button onClick={handleDownloadReport} className="btn-secondary">
            <Download className="w-4 h-4" /> Report
          </button>
          <button onClick={handleDebug} className="btn-secondary text-amber-600 border-amber-200 hover:bg-amber-50">
            <Bug className="w-4 h-4" /> Debug Payload
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: campaign.totalRecipients, color: "text-gray-900" },
          { label: "Sent", value: campaign.sent, color: "text-blue-700" },
          { label: "Delivered", value: campaign.delivered, color: "text-green-700" },
          { label: "Read", value: campaign.read, color: "text-purple-700" },
          { label: "Failed", value: campaign.failed, color: "text-red-700" },
        ].map((s) => (
          <div key={s.label} className="card p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Timing info */}
      <div className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-gray-500">Created</p>
          <p className="font-medium text-gray-900 mt-0.5">{fmt(campaign.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Started</p>
          <p className="font-medium text-gray-900 mt-0.5">{fmt(campaign.startedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Completed</p>
          <p className="font-medium text-gray-900 mt-0.5">{fmt(campaign.completedAt)}</p>
        </div>
      </div>

      {/* Messages table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <h2 className="font-medium text-gray-900 shrink-0">Messages</h2>
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input py-1.5 text-xs w-auto"
            >
              {["all", "sent", "delivered", "read", "failed", "pending"].map((s) => (
                <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
              ))}
            </select>
            {/* Phone search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search phone..."
                value={phoneSearch}
                onChange={(e) => setPhoneSearch(e.target.value)}
                className="input py-1.5 pl-8 text-xs w-44"
              />
            </div>
          </div>
        </div>

        {!messages ? (
          <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : messages.messages.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No messages found.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    {["Phone Number", "Status", "Meta ID", "Error", "Sent At"].map((h) => (
                      <th key={h} className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {messages.messages.map((m) => (
                    <tr key={m.id} className="border-b border-gray-50">
                      <td className="px-5 py-3 font-mono text-gray-800 text-xs">{m.phoneNumber}</td>
                      <td className="px-5 py-3">
                        <span className={MSG_STATUS_CLASS[m.status] || "badge bg-gray-100 text-gray-500"}>
                          {m.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-400 max-w-[140px] truncate">
                        {m.metaMessageId || "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-red-600 max-w-[200px]">
                        {m.errorMessage ? (
                          <span title={`[${m.errorCode}] ${m.errorMessage}`} className="truncate block">
                            {m.errorMessage.slice(0, 60)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">{fmt(m.sentAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {messages.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Page {messages.page} of {messages.pages} ({messages.total} messages)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadMessages(page - 1)}
                    disabled={page <= 1}
                    className="btn-secondary px-2 py-1.5 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => loadMessages(page + 1)}
                    disabled={page >= messages.pages}
                    className="btn-secondary px-2 py-1.5 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Debug payload modal */}
      {debugOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-amber-500" />
                <h3 className="font-semibold text-slate-900 text-sm">Meta API Payload — First Message</h3>
              </div>
              <button onClick={() => setDebugOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {debugLoading && <p className="text-sm text-slate-500 text-center py-8">Building payload…</p>}
              {debugData?.error && <p className="text-sm text-red-600">{debugData.error}</p>}
              {debugData && !debugData.error && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">JSON Payload</p>
                    <pre className="bg-slate-900 text-green-400 text-xs rounded-xl p-4 overflow-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(debugData.payload, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">cURL Command</p>
                      <button
                        onClick={() => handleCopy(debugData.curl.replace("YOUR_TOKEN_HERE", "PASTE_YOUR_TOKEN"))}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <pre className="bg-slate-900 text-amber-300 text-xs rounded-xl p-4 overflow-auto whitespace-pre-wrap break-all">
                      {debugData.curl}
                    </pre>
                    <p className="text-xs text-slate-400 mt-1.5">Replace <code className="bg-slate-100 px-1 rounded">YOUR_TOKEN_HERE</code> with your actual Meta access token before running.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
