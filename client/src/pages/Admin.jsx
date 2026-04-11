import React, { useEffect, useRef, useState } from "react";
import {
  Save, Eye, EyeOff, CheckCircle, XCircle, RefreshCw,
  Trash2, Upload, AlertTriangle, Loader2
} from "lucide-react";
import { api } from "../lib/api.js";
import { applyTheme, useConfig } from "../components/ThemeProvider.jsx";

function Section({ title, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function Toast({ msg, type }) {
  if (!msg) return null;
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
        type === "success" ? "bg-green-700 text-white" : "bg-red-600 text-white"
      }`}
    >
      {type === "success" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

export default function Admin() {
  const { refreshConfig } = useConfig();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [dbStats, setDbStats] = useState(null);
  const logoRef = useRef(null);
  const faviconRef = useRef(null);

  // Form state
  const [form, setForm] = useState({});
  const [adminPwForm, setAdminPwForm] = useState({ current: "", next: "" });
  const [appPwForm, setAppPwForm] = useState({ password: "", disable: false });
  const [showAdminPw, setShowAdminPw] = useState(false);
  const [showAppPw, setShowAppPw] = useState(false);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    async function load() {
      try {
        const [c, s] = await Promise.all([api.getAdminConfig(), api.getAdminStats()]);
        setConfig(c);
        setDbStats(s);
        setForm({
          appName: c.appName,
          primaryColor: c.primaryColor,
          secondaryColor: c.secondaryColor || "#7c3aed",
          defaultCountryCode: c.defaultCountryCode,
          sendRatePerSecond: c.sendRatePerSecond,
          phoneNumberId: c.phoneNumberId || "",
          wabaId: c.wabaId || "",
          metaAccessToken: "",
        });
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  async function handleSaveConfig() {
    setSaving(true);
    try {
      await api.updateAdminConfig(form);
      // Apply new theme immediately without page reload
      applyTheme({
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        appName: form.appName,
      });
      refreshConfig(); // sync sidebar app name / colors
      showToast("Settings saved successfully");
    } catch (err) {
      showToast(err.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testConnection();
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.syncTemplates();
      setSyncResult(result);
      showToast(`Synced ${result.synced} templates`);
    } catch (err) {
      showToast(err.message || "Sync failed", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function handleChangeAdminPw() {
    try {
      await api.changeAdminPassword({
        currentPassword: adminPwForm.current,
        newPassword: adminPwForm.next,
      });
      setAdminPwForm({ current: "", next: "" });
      showToast("Admin password changed");
    } catch (err) {
      showToast(err.message || "Failed to change password", "error");
    }
  }

  async function handleSetAppPw() {
    try {
      if (appPwForm.disable) {
        await api.setAppPassword("");
        showToast("App password disabled (open access)");
      } else {
        await api.setAppPassword(appPwForm.password);
        showToast("App password updated");
      }
      setAppPwForm({ password: "", disable: false });
    } catch (err) {
      showToast(err.message || "Failed to update app password", "error");
    }
  }

  async function handleUploadLogo(file) {
    if (!file) return;
    try {
      const result = await api.uploadLogo(file);
      setConfig((c) => ({ ...c, logoUrl: result.url }));
      refreshConfig(); // update sidebar immediately
      showToast("Logo uploaded");
    } catch (err) {
      showToast(err.message || "Upload failed", "error");
    }
  }

  async function handleUploadFavicon(file) {
    if (!file) return;
    try {
      const result = await api.uploadFavicon(file);
      setConfig((c) => ({ ...c, faviconUrl: result.url }));
      refreshConfig(); // update favicon in browser tab immediately
      showToast("Favicon uploaded");
    } catch (err) {
      showToast(err.message || "Upload failed", "error");
    }
  }

  async function handleClearHistory() {
    try {
      await api.clearHistory();
      setClearConfirm(false);
      showToast("History cleared");
      const s = await api.getAdminStats();
      setDbStats(s);
    } catch (err) {
      showToast(err.message || "Failed to clear", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "var(--brand)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Settings</h1>
          <p className="page-subtitle">Configure Meta API credentials, branding, and app settings</p>
        </div>
      </div>

      {/* 1. Meta API Credentials */}
      <Section title="Meta API Credentials">
        <Field label="Meta Access Token" hint="System User token or Page Access Token from Meta Business Suite">
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              placeholder={config?.metaAccessToken ? "Token saved — enter new value to update" : "Enter Meta access token"}
              value={form.metaAccessToken || ""}
              onChange={(e) => setForm({ ...form, metaAccessToken: e.target.value })}
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Phone Number ID" hint="From Meta Business Suite → WhatsApp → API Setup">
            <input
              type="text"
              value={form.phoneNumberId || ""}
              onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
              className="input"
              placeholder="12345678901234"
            />
          </Field>
          <Field label="WABA ID" hint="WhatsApp Business Account ID — used to fetch templates">
            <input
              type="text"
              value={form.wabaId || ""}
              onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
              className="input"
              placeholder="11223344556677"
            />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSaveConfig} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Credentials
          </button>
          <button onClick={handleTestConnection} disabled={testing} className="btn-secondary">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Test Connection
          </button>
        </div>

        {testResult && (
          <div className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 border ${
            testResult.success
              ? "bg-green-50 text-green-800 border-green-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}>
            {testResult.success ? (
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            {testResult.success
              ? `Connected: ${testResult.accountName} (${testResult.phoneNumber})`
              : `Error: ${testResult.error}`}
          </div>
        )}
      </Section>

      {/* 2. App Security */}
      <Section title="App Security">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Change Admin Password</p>
            <input
              type={showAdminPw ? "text" : "password"}
              placeholder="Current password"
              value={adminPwForm.current}
              onChange={(e) => setAdminPwForm({ ...adminPwForm, current: e.target.value })}
              className="input"
            />
            <input
              type={showAdminPw ? "text" : "password"}
              placeholder="New password (min 6 chars)"
              value={adminPwForm.next}
              onChange={(e) => setAdminPwForm({ ...adminPwForm, next: e.target.value })}
              className="input"
            />
            <button
              onClick={handleChangeAdminPw}
              disabled={!adminPwForm.current || adminPwForm.next.length < 6}
              className="btn-secondary w-full"
            >
              <Save className="w-4 h-4" /> Update Admin Password
            </button>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">
              App Password <span className="text-xs text-gray-400">(for regular users)</span>
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={appPwForm.disable}
                onChange={(e) => setAppPwForm({ ...appPwForm, disable: e.target.checked })}
                className="rounded"
              />
              Disable app password (open access / iframe only)
            </label>
            {!appPwForm.disable && (
              <input
                type={showAppPw ? "text" : "password"}
                placeholder="New app password (min 4 chars)"
                value={appPwForm.password}
                onChange={(e) => setAppPwForm({ ...appPwForm, password: e.target.value })}
                className="input"
              />
            )}
            <button
              onClick={handleSetAppPw}
              disabled={!appPwForm.disable && appPwForm.password.length < 4}
              className="btn-secondary w-full"
            >
              <Save className="w-4 h-4" />
              {appPwForm.disable ? "Disable Password" : "Set App Password"}
            </button>
            {!config?.hasAppPassword && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                No app password set — anyone with the URL can access this app
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* 3. Branding & Theming */}
      <Section title="Branding & Theming">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="App Name">
            <input
              type="text"
              value={form.appName || ""}
              onChange={(e) => setForm({ ...form, appName: e.target.value })}
              className="input"
              placeholder="Campaign Manager"
            />
          </Field>
          <Field label="Primary Color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor || "#1e40af"}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                className="h-9 w-14 rounded border border-slate-300 cursor-pointer"
              />
              <input
                type="text"
                value={form.primaryColor || ""}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                className="input flex-1"
                placeholder="#1e40af"
              />
            </div>
          </Field>
          <Field label="Secondary / Accent Color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.secondaryColor || "#7c3aed"}
                onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                className="h-9 w-14 rounded border border-slate-300 cursor-pointer"
              />
              <input
                type="text"
                value={form.secondaryColor || ""}
                onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                className="input flex-1"
                placeholder="#7c3aed"
              />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Logo" hint="Shown in header and login page (PNG/JPG, max 2MB)">
            <div className="flex items-center gap-3">
              {config?.logoUrl && (
                <img src={config.logoUrl} alt="Logo" className="h-10 w-auto border rounded" />
              )}
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUploadLogo(e.target.files[0])}
              />
              <button onClick={() => logoRef.current?.click()} className="btn-secondary">
                <Upload className="w-4 h-4" /> Upload Logo
              </button>
            </div>
          </Field>
          <Field label="Favicon" hint="Browser tab icon (ICO/PNG, max 2MB)">
            <div className="flex items-center gap-3">
              {config?.faviconUrl && (
                <img src={config.faviconUrl} alt="Favicon" className="h-8 w-8 border rounded" />
              )}
              <input
                ref={faviconRef}
                type="file"
                accept="image/*,.ico"
                className="hidden"
                onChange={(e) => handleUploadFavicon(e.target.files[0])}
              />
              <button onClick={() => faviconRef.current?.click()} className="btn-secondary">
                <Upload className="w-4 h-4" /> Upload Favicon
              </button>
            </div>
          </Field>
        </div>

        <button onClick={handleSaveConfig} disabled={saving} className="btn-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Branding
        </button>
      </Section>

      {/* 4. Sending Configuration */}
      <Section title="Sending Configuration">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Default Country Code" hint="Applied when phone numbers don't include a country code">
            <select
              value={form.defaultCountryCode || "966"}
              onChange={(e) => setForm({ ...form, defaultCountryCode: e.target.value })}
              className="input"
            >
              {[
                { code: "966", label: "Saudi Arabia (+966)" },
                { code: "971", label: "UAE (+971)" },
                { code: "20", label: "Egypt (+20)" },
                { code: "965", label: "Kuwait (+965)" },
                { code: "974", label: "Qatar (+974)" },
                { code: "973", label: "Bahrain (+973)" },
                { code: "968", label: "Oman (+968)" },
                { code: "962", label: "Jordan (+962)" },
                { code: "961", label: "Lebanon (+961)" },
                { code: "1", label: "USA/Canada (+1)" },
                { code: "44", label: "UK (+44)" },
                { code: "91", label: "India (+91)" },
                { code: "90", label: "Turkey (+90)" },
              ].map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field
            label={`Send Rate: ${form.sendRatePerSecond || 10} messages/sec`}
            hint="Recommended: 10–20 msg/sec. Max ~80/sec for business tier."
          >
            <input
              type="range"
              min="1"
              max="50"
              value={form.sendRatePerSecond || 10}
              onChange={(e) => setForm({ ...form, sendRatePerSecond: parseInt(e.target.value) })}
              className="w-full accent-blue-700"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1/sec</span>
              <span>50/sec</span>
            </div>
          </Field>
        </div>
        <button onClick={handleSaveConfig} disabled={saving} className="btn-primary">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </button>
      </Section>

      {/* 5. Data Management */}
      <Section title="Data Management">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleSync} disabled={syncing} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Templates Now"}
          </button>
          <button
            onClick={() => setClearConfirm(true)}
            className="btn-danger"
          >
            <Trash2 className="w-4 h-4" /> Clear Campaign History
          </button>
        </div>

        {syncResult && (
          <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 border border-green-200">
            Synced {syncResult.synced} templates — {syncResult.added} added, {syncResult.updated} updated, {syncResult.removed} removed
          </p>
        )}

        {dbStats && (
          <div className="text-xs text-gray-500 grid grid-cols-2 gap-2 pt-2">
            <div>Total campaigns: <strong>{dbStats.totalCampaigns}</strong></div>
            <div>Total messages: <strong>{dbStats.totalMessages}</strong></div>
          </div>
        )}
      </Section>

      {/* Clear confirm modal */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Clear Campaign History</h3>
            <p className="text-sm text-gray-600 mb-5">
              This will permanently delete all campaign and message records. Templates are not affected.
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={handleClearHistory} className="btn-danger flex-1">
                <Trash2 className="w-4 h-4" /> Delete Everything
              </button>
              <button onClick={() => setClearConfirm(false)} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast?.msg} type={toast?.type} />
    </div>
  );
}
