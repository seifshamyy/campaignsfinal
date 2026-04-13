import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Search, Send, FileText, Phone } from "lucide-react";
import { api } from "../lib/api.js";
import TemplateCard from "../components/TemplateCard.jsx";

const CATEGORY_COLORS = {
  MARKETING:      "bg-purple-100 text-purple-700",
  UTILITY:        "bg-blue-100 text-blue-700",
  AUTHENTICATION: "bg-orange-100 text-orange-700",
};

export default function Templates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [selectedPhoneId, setSelectedPhoneId] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState(null);

  async function loadPhones() {
    try {
      const phones = await api.getAccountPhoneNumbers();
      setPhoneNumbers(phones);
      if (phones.length === 1 && !selectedPhoneId) {
        setSelectedPhoneId(phones[0].id);
      }
    } catch {}
  }

  async function load(phoneId) {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getTemplates(phoneId || undefined);
      setTemplates(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPhones().then(() => load());
  }, []);

  useEffect(() => {
    load(selectedPhoneId);
  }, [selectedPhoneId]);

  async function handleSync() {
    if (!selectedPhoneId) {
      setError("Select a phone number to sync");
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const result = await api.syncTemplates(selectedPhoneId);
      setSyncResult(result);
      await load(selectedPhoneId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  const categories = ["ALL", ...Array.from(new Set(templates.map((t) => t.category))).sort()];

  const filtered = templates.filter((t) => {
    const matchCat = category === "ALL" || t.category === category;
    const q = query.toLowerCase();
    const matchQ = !q || t.name.toLowerCase().includes(q) || t.bodyText?.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  const lastSynced = templates[0]?.lastSyncedAt;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">
            {templates.length} approved template{templates.length !== 1 ? "s" : ""}
            {lastSynced && <span className="ml-2 text-slate-400">· synced {new Date(lastSynced).toLocaleDateString()}</span>}
          </p>
        </div>
        <button onClick={handleSync} disabled={syncing || !selectedPhoneId} className="btn btn-secondary">
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing…" : "Sync from Meta"}
        </button>
      </div>

      {/* Phone number selector */}
      {phoneNumbers.length > 1 && (
        <div className="flex items-center gap-3">
          <Phone className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedPhoneId}
            onChange={(e) => setSelectedPhoneId(e.target.value)}
            className="input max-w-xs"
          >
            <option value="">All phone numbers</option>
            {phoneNumbers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}{p.displayNumber ? ` (${p.displayNumber})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {syncResult && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
          Synced {syncResult.synced} templates — {syncResult.added} added, {syncResult.updated} updated, {syncResult.removed} removed
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</div>
      )}

      {phoneNumbers.length === 0 && (
        <div className="card p-8 text-center">
          <Phone className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No phone numbers configured</p>
          <p className="text-sm text-slate-400 mt-1">Go to Admin settings to add a WhatsApp phone number.</p>
        </div>
      )}

      {phoneNumbers.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search templates…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="input pl-9"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    category === cat
                      ? "text-white shadow-sm"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                  style={category === cat ? { background: "var(--brand)" } : {}}
                >
                  {cat === "ALL" ? "All" : cat.charAt(0) + cat.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="card p-4 animate-pulse space-y-3">
                  <div className="h-4 bg-slate-100 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-full" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-12 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">
                {templates.length === 0 ? "No templates synced yet" : "No templates match your search"}
              </p>
              {templates.length === 0 && selectedPhoneId && (
                <button onClick={handleSync} disabled={syncing} className="btn btn-primary mt-4 mx-auto">
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                  Sync Now
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((t) => (
                <TemplateCardWithAction
                  key={t.id}
                  template={t}
                  onUse={() => navigate("/campaigns/new", { state: { templateId: t.id, phoneNumberId: t.phoneNumberId } })}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TemplateCardWithAction({ template, onUse }) {
  const paramCount = template.paramSchema?.columns?.filter((c) => c.key !== "phone_number").length || 0;
  const isArabic = template.language === "ar";

  return (
    <div className="card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900 text-sm leading-snug truncate">{template.name}</h3>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="badge bg-slate-100 text-slate-600">{template.language}</span>
          <span className={`badge ${CATEGORY_COLORS[template.category] || "bg-slate-100 text-slate-600"}`}>
            {template.category.charAt(0) + template.category.slice(1).toLowerCase()}
          </span>
        </div>
      </div>

      {template.phoneNumber && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <Phone className="w-3 h-3" />
          {template.phoneNumber.label}
          {template.phoneNumber.displayNumber && ` · ${template.phoneNumber.displayNumber}`}
        </p>
      )}

      {template.bodyText && (
        <p className={`text-xs text-slate-500 leading-relaxed line-clamp-3 flex-1 ${isArabic ? "rtl-text" : ""}`}>
          {template.bodyText}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {paramCount > 0 && (
          <span className="badge bg-amber-50 text-amber-700">{paramCount} variable{paramCount !== 1 ? "s" : ""}</span>
        )}
        {template.buttonTypes?.slice(0, 2).map((bt) => (
          <span key={bt} className="badge bg-slate-100 text-slate-500">{bt.replace(/_/g, " ").toLowerCase()}</span>
        ))}
      </div>

      <button onClick={onUse} className="btn mt-auto text-xs py-1.5 px-3 rounded-lg text-white" style={{ background: "var(--brand)" }}>
        <Send className="w-3.5 h-3.5" /> Use Template
      </button>
    </div>
  );
}
