import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../lib/api.js";
import StatsCards from "../components/StatsCards.jsx";

const STATUS_CLASS = {
  draft: "status-draft",
  sending: "status-sending",
  completed: "status-completed",
  failed: "status-failed",
  cancelled: "status-cancelled",
};

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CampaignHistory() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  async function load(p = 1) {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([api.getCampaigns(p), api.getCampaignStats()]);
      setData(d);
      setStats(s);
      setPage(p);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Manage and track your WhatsApp campaigns</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate("/campaigns/new")}>
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      <StatsCards stats={stats} />

      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-900">Campaign History</h2>
          <button
            onClick={() => load(page)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading && !data ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading...</div>
        ) : data?.campaigns?.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-400 text-sm">No campaigns yet.</p>
            <button
              className="btn btn-primary mt-4"
              onClick={() => navigate("/campaigns/new")}
            >
              <Plus className="w-4 h-4" /> Create your first campaign
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    {["Campaign", "Template", "Recipients", "Sent", "Failed", "Status", "Date"].map((h) => (
                      <th key={h} className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data?.campaigns?.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/campaigns/${c.id}`)}
                    >
                      <td className="px-5 py-3.5 font-medium text-gray-900 max-w-[180px] truncate">
                        {c.name}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {c.template?.name}
                        <span className="ml-1 text-xs text-gray-400">{c.template?.language}</span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-700">{c.totalRecipients}</td>
                      <td className="px-5 py-3.5 text-green-700 font-medium">{c.sent}</td>
                      <td className="px-5 py-3.5 text-red-600 font-medium">{c.failed}</td>
                      <td className="px-5 py-3.5">
                        <span className={STATUS_CLASS[c.status] || "status-draft"}>
                          {c.status === "sending" ? (
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                              sending
                            </span>
                          ) : c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">
                        {fmt(c.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data?.pages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Page {data.page} of {data.pages} ({data.total} total)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => load(page - 1)}
                    disabled={page <= 1}
                    className="btn-secondary px-2 py-1.5 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => load(page + 1)}
                    disabled={page >= data.pages}
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
    </div>
  );
}
