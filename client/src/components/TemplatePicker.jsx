import React, { useEffect, useState } from "react";
import { Search, RefreshCw, AlertCircle } from "lucide-react";
import { api } from "../lib/api.js";
import TemplateCard from "./TemplateCard.jsx";

export default function TemplatePicker({ selected, onSelect, phoneNumberId }) {
  const [templates, setTemplates] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getTemplates(phoneNumberId);
      setTemplates(data);
      if (data.length > 0) setLastSynced(data[0]?.lastSyncedAt);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    if (!phoneNumberId) {
      setError("Select a phone number first to sync templates.");
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.syncTemplates(phoneNumberId);
      setSyncResult(result);
      await loadTemplates();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  // Reload when phoneNumberId changes
  useEffect(() => {
    loadTemplates();
  }, [phoneNumberId]);

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.category.toLowerCase().includes(query.toLowerCase()) ||
      t.language.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input pl-9"
          />
        </div>
        <button onClick={handleSync} disabled={syncing || !phoneNumberId} className="btn-secondary whitespace-nowrap">
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Templates"}
        </button>
      </div>

      {lastSynced && (
        <p className="text-xs text-gray-400">Last synced: {new Date(lastSynced).toLocaleString()}</p>
      )}

      {syncResult && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          Synced {syncResult.synced} templates — {syncResult.added} added, {syncResult.updated} updated, {syncResult.removed} removed
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-full mb-1" />
              <div className="h-3 bg-gray-100 rounded w-5/6" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 card">
          <p className="text-gray-400 text-sm mb-3">
            {templates.length === 0
              ? phoneNumberId
                ? 'No templates found. Click "Sync Templates" to fetch from Meta.'
                : "Select a phone number above to see its templates."
              : "No templates match your search."}
          </p>
          {templates.length === 0 && phoneNumberId && (
            <button onClick={handleSync} disabled={syncing} className="btn-primary">
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              Sync Now
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              selected={selected?.id === t.id}
              onClick={() => onSelect(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
