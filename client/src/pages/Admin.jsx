import React, { useEffect, useRef, useState } from "react";
import {
  Save, Eye, EyeOff, CheckCircle, XCircle, RefreshCw,
  Trash2, Upload, AlertTriangle, Loader2, Plus, Phone,
  Pencil, X, Wifi, WifiOff, MessageCircle, Link
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
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${type === "success" ? "bg-green-700 text-white" : "bg-red-600 text-white"}`}>
      {type === "success" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

// ── Phone Number Modal ────────────────────────────────────────────────────────
function PhoneModal({ phone, onClose, onSave }) {
  const [form, setForm] = useState({
    label: phone?.label || "",
    metaAccessToken: "",
    phoneNumberId: phone?.phoneNumberId || "",
    wabaId: phone?.wabaId || "",
  });
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!form.label.trim()) { setError("Label is required"); return; }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card p-6 max-w-md w-full space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            {phone ? "Edit Phone Number" : "Add Phone Number"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <Field label="Label" hint='A friendly name, e.g. "Sales", "Support", "Main"'>
          <input
            type="text"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            className="input"
            placeholder="Sales"
            autoFocus
          />
        </Field>

        <Field label="Meta Access Token" hint={phone?.hasToken ? "Token saved — enter new value to replace" : "System User or Page Access Token"}>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              placeholder={phone?.hasToken ? "Token saved — enter to update" : "Enter Meta access token"}
              value={form.metaAccessToken}
              onChange={(e) => setForm({ ...form, metaAccessToken: e.target.value })}
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone Number ID" hint="Meta Business Suite">
            <input
              type="text"
              value={form.phoneNumberId}
              onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
              className="input"
              placeholder="123456789"
            />
          </Field>
          <Field label="WABA ID" hint="WhatsApp Business Account ID">
            <input
              type="text"
              value={form.wabaId}
              onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
              className="input"
              placeholder="987654321"
            />
          </Field>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {phone ? "Save Changes" : "Add Number"}
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin Component ──────────────────────────────────────────────────────
export default function Admin() {
  const { refreshConfig } = useConfig();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingPhone, setSyncingPhone] = useState(null); // phoneId being synced
  const [toast, setToast] = useState(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [dbStats, setDbStats] = useState(null);
  const logoRef = useRef(null);
  const faviconRef = useRef(null);

  // Phone numbers state
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [phoneModal, setPhoneModal] = useState(null); // null | "new" | { phone }
  const [testingPhone, setTestingPhone] = useState(null); // phoneId being tested
  const [testResults, setTestResults] = useState({}); // { [phoneId]: result }
  const [deletingPhone, setDeletingPhone] = useState(null);

  // Chatwoot state
  const [chatwoot, setChatwoot] = useState(null);
  const [chatwootForm, setChatwootForm] = useState({ url: "", apiToken: "", accountId: "", inboxId: "" });
  const [showCwToken, setShowCwToken] = useState(false);
  const [cwSaving, setCwSaving] = useState(false);
  const [cwTesting, setCwTesting] = useState(false);
  const [cwTestResult, setCwTestResult] = useState(null);

  // Form state
  const [form, setForm] = useState({});
  const [adminPwForm, setAdminPwForm] = useState({ current: "", next: "" });
  const [appPwForm, setAppPwForm] = useState({ password: "", disable: false });

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    try {
      const [c, s, phones, cw] = await Promise.all([
        api.getAdminConfig(),
        api.getAdminStats(),
        api.getPhoneNumbers(),
        api.getChatwootConfig(),
      ]);
      setConfig(c);
      setDbStats(s);
      setPhoneNumbers(phones);
      setForm({
        appName: c.appName,
        primaryColor: c.primaryColor,
        secondaryColor: c.secondaryColor || "#7c3aed",
        defaultCountryCode: c.defaultCountryCode,
        sendRatePerSecond: c.sendRatePerSecond,
      });
      setChatwoot(cw);
      setChatwootForm({
        url:       cw.chatwootUrl       || "",
        apiToken:  "",                        // never pre-fill token
        accountId: cw.chatwootAccountId ? String(cw.chatwootAccountId) : "",
        inboxId:   cw.chatwootInboxId   ? String(cw.chatwootInboxId)   : "",
      });
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSaveConfig() {
    setSaving(true);
    try {
      await api.updateAdminConfig(form);
      applyTheme({ primaryColor: form.primaryColor, secondaryColor: form.secondaryColor, appName: form.appName });
      refreshConfig();
      showToast("Settings saved successfully");
    } catch (err) {
      showToast(err.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestPhone(phoneId) {
    setTestingPhone(phoneId);
    setTestResults((r) => ({ ...r, [phoneId]: null }));
    try {
      const result = await api.testPhoneNumber(phoneId);
      setTestResults((r) => ({ ...r, [phoneId]: result }));
      if (result.success) {
        setPhoneNumbers((phones) =>
          phones.map((p) =>
            p.id === phoneId
              ? { ...p, displayNumber: result.phoneNumber, verifiedName: result.accountName }
              : p
          )
        );
      }
    } catch (err) {
      setTestResults((r) => ({ ...r, [phoneId]: { success: false, error: err.message } }));
    } finally {
      setTestingPhone(null);
    }
  }

  async function handleSyncPhone(phoneId) {
    setSyncingPhone(phoneId);
    try {
      const result = await api.syncTemplates(phoneId);
      showToast(`Synced ${result.synced} templates (${result.added} added, ${result.updated} updated, ${result.removed} removed)`);
    } catch (err) {
      showToast(err.message || "Sync failed", "error");
    } finally {
      setSyncingPhone(null);
    }
  }

  async function handleSavePhone(formData) {
    if (phoneModal?.phone) {
      await api.updatePhoneNumber(phoneModal.phone.id, formData);
      showToast("Phone number updated");
    } else {
      await api.createPhoneNumber(formData);
      showToast("Phone number added");
    }
    const phones = await api.getPhoneNumbers();
    setPhoneNumbers(phones);
  }

  async function handleDeletePhone(phoneId) {
    try {
      await api.deletePhoneNumber(phoneId);
      setPhoneNumbers((phones) => phones.filter((p) => p.id !== phoneId));
      setDeletingPhone(null);
      showToast("Phone number removed");
    } catch (err) {
      showToast(err.message || "Cannot delete", "error");
      setDeletingPhone(null);
    }
  }

  async function handleSaveChatwoot() {
    setCwSaving(true);
    setCwTestResult(null);
    try {
      await api.saveChatwootConfig({
        chatwootUrl:       chatwootForm.url,
        chatwootApiToken:  chatwootForm.apiToken || undefined,
        chatwootAccountId: chatwootForm.accountId,
        chatwootInboxId:   chatwootForm.inboxId,
      });
      const cw = await api.getChatwootConfig();
      setChatwoot(cw);
      showToast("Chatwoot credentials saved");
    } catch (err) {
      showToast(err.message || "Failed to save", "error");
    } finally {
      setCwSaving(false);
    }
  }

  async function handleTestChatwoot() {
    setCwTesting(true);
    setCwTestResult(null);
    try {
      const result = await api.testChatwootConfig();
      setCwTestResult(result);
      if (result.success) {
        setChatwoot((c) => ({ ...c, chatwootVerified: true }));
        showToast(`Connected to inbox: ${result.inboxName}`);
      }
    } catch (err) {
      setCwTestResult({ success: false, error: err.message });
    } finally {
      setCwTesting(false);
    }
  }

  async function handleRemoveChatwoot() {
    try {
      await api.removeChatwootConfig();
      setChatwoot({ chatwootUrl: "", chatwootAccountId: "", chatwootInboxId: "", chatwootVerified: false, hasToken: false });
      setChatwootForm({ url: "", apiToken: "", accountId: "", inboxId: "" });
      setCwTestResult(null);
      showToast("Chatwoot integration removed");
    } catch (err) {
      showToast(err.message || "Failed to remove", "error");
    }
  }

  async function handleChangeAdminPw() {
    try {
      await api.changeAdminPassword({ currentPassword: adminPwForm.current, newPassword: adminPwForm.next });
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
      refreshConfig();
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
      refreshConfig();
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
          <p className="page-subtitle">Manage phone numbers, branding, and account settings</p>
        </div>
      </div>

      {/* 1. Phone Numbers */}
      <Section title="WhatsApp Phone Numbers">
        <p className="text-xs text-slate-500">
          Each phone number has its own Meta credentials, template library, and can run independent campaigns.
        </p>

        <div className="space-y-3">
          {phoneNumbers.length === 0 && (
            <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
              <Phone className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-3">No phone numbers connected yet</p>
              <button onClick={() => setPhoneModal("new")} className="btn-primary mx-auto">
                <Plus className="w-4 h-4" /> Add Your First Number
              </button>
            </div>
          )}

          {phoneNumbers.map((phone) => (
            <div key={phone.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "var(--brand-light)" }}
                  >
                    <Phone className="w-4 h-4" style={{ color: "var(--brand)" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{phone.label}</p>
                    {phone.displayNumber && (
                      <p className="text-xs text-slate-500">{phone.displayNumber}</p>
                    )}
                    {phone.verifiedName && (
                      <p className="text-xs text-slate-400">{phone.verifiedName}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      {phone._count?.campaigns || 0} campaigns · {phone._count?.templates || 0} templates
                      {!phone.hasToken && <span className="ml-1 text-amber-500">· No token set</span>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleTestPhone(phone.id)}
                    disabled={testingPhone === phone.id}
                    className="btn-secondary text-xs py-1.5 px-2.5"
                    title="Test connection"
                  >
                    {testingPhone === phone.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Wifi className="w-3.5 h-3.5" />
                    }
                    Test
                  </button>
                  <button
                    onClick={() => handleSyncPhone(phone.id)}
                    disabled={syncingPhone === phone.id}
                    className="btn-secondary text-xs py-1.5 px-2.5"
                    title="Sync templates"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingPhone === phone.id ? "animate-spin" : ""}`} />
                    Sync
                  </button>
                  <button
                    onClick={() => setPhoneModal({ phone })}
                    className="btn-secondary text-xs py-1.5 px-2.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingPhone(phone.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Test result */}
              {testResults[phone.id] && (
                <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
                  testResults[phone.id].success
                    ? "bg-green-50 text-green-800 border-green-200"
                    : "bg-red-50 text-red-800 border-red-200"
                }`}>
                  {testResults[phone.id].success
                    ? <><CheckCircle className="w-3.5 h-3.5 shrink-0" />Connected: {testResults[phone.id].accountName} ({testResults[phone.id].phoneNumber})</>
                    : <><XCircle className="w-3.5 h-3.5 shrink-0" />Error: {testResults[phone.id].error}</>
                  }
                </div>
              )}
            </div>
          ))}

          {phoneNumbers.length > 0 && (
            <button onClick={() => setPhoneModal("new")} className="btn-secondary w-full">
              <Plus className="w-4 h-4" /> Add Another Number
            </button>
          )}
        </div>
      </Section>

      {/* 2. Chatwoot Integration */}
      <Section title="Chatwoot Integration">
        <p className="text-xs text-slate-500">
          When configured and tested, you can attach a private note to each Chatwoot conversation at campaign creation time — so agents always know which campaign triggered a reply.
        </p>

        {chatwoot?.chatwootVerified && (
          <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            Integration verified and active
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Chatwoot URL" hint="e.g. https://app.chatwoot.com">
            <div className="relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="url"
                value={chatwootForm.url}
                onChange={(e) => { setChatwootForm({ ...chatwootForm, url: e.target.value }); setCwTestResult(null); }}
                className="input pl-9"
                placeholder="https://app.chatwoot.com"
              />
            </div>
          </Field>

          <Field label="API Access Token" hint={chatwoot?.hasToken ? "Token saved — enter new value to replace" : "Settings → API Access Token"}>
            <div className="relative">
              <input
                type={showCwToken ? "text" : "password"}
                value={chatwootForm.apiToken}
                onChange={(e) => { setChatwootForm({ ...chatwootForm, apiToken: e.target.value }); setCwTestResult(null); }}
                className="input pr-10"
                placeholder={chatwoot?.hasToken ? "Token saved — enter to update" : "Enter API access token"}
              />
              <button type="button" onClick={() => setShowCwToken(!showCwToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showCwToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          <Field label="Account ID" hint="Your Chatwoot numeric account ID">
            <input
              type="number"
              value={chatwootForm.accountId}
              onChange={(e) => { setChatwootForm({ ...chatwootForm, accountId: e.target.value }); setCwTestResult(null); }}
              className="input"
              placeholder="3"
            />
          </Field>

          <Field label="Inbox ID" hint="The WhatsApp inbox ID in Chatwoot">
            <input
              type="number"
              value={chatwootForm.inboxId}
              onChange={(e) => { setChatwootForm({ ...chatwootForm, inboxId: e.target.value }); setCwTestResult(null); }}
              className="input"
              placeholder="7"
            />
          </Field>
        </div>

        {cwTestResult && (
          <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border ${
            cwTestResult.success
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}>
            {cwTestResult.success
              ? <><CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />Connected — inbox: <strong className="ml-1">{cwTestResult.inboxName}</strong></>
              : <><XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{cwTestResult.error}</>
            }
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleSaveChatwoot} disabled={cwSaving || !chatwootForm.url || !chatwootForm.accountId || !chatwootForm.inboxId} className="btn-secondary">
            {cwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Credentials
          </button>
          <button
            onClick={handleTestChatwoot}
            disabled={cwTesting || !chatwoot?.chatwootUrl || !chatwoot?.hasToken}
            className="btn-primary"
            title={!chatwoot?.chatwootUrl || !chatwoot?.hasToken ? "Save credentials first" : ""}
          >
            {cwTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            Test Connection
          </button>
          {chatwoot?.hasToken && (
            <button onClick={handleRemoveChatwoot} className="text-xs text-red-500 hover:text-red-700 ml-auto">
              Remove integration
            </button>
          )}
        </div>
      </Section>

      {/* App Security */}
      <Section title="App Security">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Change Admin Password</p>
            <input
              type="password"
              placeholder="Current password"
              value={adminPwForm.current}
              onChange={(e) => setAdminPwForm({ ...adminPwForm, current: e.target.value })}
              className="input"
            />
            <input
              type="password"
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
              Disable app password (open access)
            </label>
            {!appPwForm.disable && (
              <input
                type="password"
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
                No app password — anyone with the URL can access this app
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* 3. Branding & Theming */}
      <Section title="Branding & Theming">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="App Name">
            <input type="text" value={form.appName || ""} onChange={(e) => setForm({ ...form, appName: e.target.value })} className="input" placeholder="Campaign Manager" />
          </Field>
          <Field label="Primary Color">
            <div className="flex items-center gap-2">
              <input type="color" value={form.primaryColor || "#1e40af"} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="h-9 w-14 rounded border border-slate-300 cursor-pointer" />
              <input type="text" value={form.primaryColor || ""} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="input flex-1" placeholder="#1e40af" />
            </div>
          </Field>
          <Field label="Secondary / Accent Color">
            <div className="flex items-center gap-2">
              <input type="color" value={form.secondaryColor || "#7c3aed"} onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })} className="h-9 w-14 rounded border border-slate-300 cursor-pointer" />
              <input type="text" value={form.secondaryColor || ""} onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })} className="input flex-1" placeholder="#7c3aed" />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Logo" hint="PNG/JPG, max 2MB">
            <div className="flex items-center gap-3">
              {config?.logoUrl && <img src={config.logoUrl} alt="Logo" className="h-10 w-auto border rounded" />}
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadLogo(e.target.files[0])} />
              <button onClick={() => logoRef.current?.click()} className="btn-secondary"><Upload className="w-4 h-4" /> Upload Logo</button>
            </div>
          </Field>
          <Field label="Favicon" hint="ICO/PNG, max 2MB">
            <div className="flex items-center gap-3">
              {config?.faviconUrl && <img src={config.faviconUrl} alt="Favicon" className="h-8 w-8 border rounded" />}
              <input ref={faviconRef} type="file" accept="image/*,.ico" className="hidden" onChange={(e) => handleUploadFavicon(e.target.files[0])} />
              <button onClick={() => faviconRef.current?.click()} className="btn-secondary"><Upload className="w-4 h-4" /> Upload Favicon</button>
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
            <select value={form.defaultCountryCode || "966"} onChange={(e) => setForm({ ...form, defaultCountryCode: e.target.value })} className="input">
              {[
                { code: "966", label: "Saudi Arabia (+966)" }, { code: "971", label: "UAE (+971)" },
                { code: "20",  label: "Egypt (+20)" },         { code: "965", label: "Kuwait (+965)" },
                { code: "974", label: "Qatar (+974)" },        { code: "973", label: "Bahrain (+973)" },
                { code: "968", label: "Oman (+968)" },         { code: "962", label: "Jordan (+962)" },
                { code: "961", label: "Lebanon (+961)" },      { code: "1",   label: "USA/Canada (+1)" },
                { code: "44",  label: "UK (+44)" },            { code: "91",  label: "India (+91)" },
                { code: "90",  label: "Turkey (+90)" },
              ].map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </Field>
          <Field label={`Send Rate: ${form.sendRatePerSecond || 10} messages/sec`} hint="Recommended: 10–20 msg/sec. Max ~80/sec for business tier.">
            <input type="range" min="1" max="50" value={form.sendRatePerSecond || 10} onChange={(e) => setForm({ ...form, sendRatePerSecond: parseInt(e.target.value) })} className="w-full accent-blue-700" />
            <div className="flex justify-between text-xs text-gray-400 mt-1"><span>1/sec</span><span>50/sec</span></div>
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
          <button onClick={() => setClearConfirm(true)} className="btn-danger">
            <Trash2 className="w-4 h-4" /> Clear Campaign History
          </button>
        </div>
        <p className="text-xs text-slate-400">To sync templates, use the "Sync" button next to each phone number above.</p>
        {dbStats && (
          <div className="text-xs text-gray-500 grid grid-cols-2 gap-2 pt-2">
            <div>Total campaigns: <strong>{dbStats.totalCampaigns}</strong></div>
            <div>Total messages: <strong>{dbStats.totalMessages}</strong></div>
          </div>
        )}
      </Section>

      {/* Phone modal */}
      {phoneModal && (
        <PhoneModal
          phone={phoneModal === "new" ? null : phoneModal.phone}
          onClose={() => setPhoneModal(null)}
          onSave={handleSavePhone}
        />
      )}

      {/* Delete phone confirm */}
      {deletingPhone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-slate-900 mb-2">Remove Phone Number</h3>
            <p className="text-sm text-slate-600 mb-5">
              This will also delete all templates synced to this number. Campaigns already run are not deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleDeletePhone(deletingPhone)} className="btn-danger flex-1">
                <Trash2 className="w-4 h-4" /> Remove
              </button>
              <button onClick={() => setDeletingPhone(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear history confirm */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Clear Campaign History</h3>
            <p className="text-sm text-gray-600 mb-5">
              This permanently deletes all campaigns and messages. Templates are not affected.
            </p>
            <div className="flex gap-3">
              <button onClick={handleClearHistory} className="btn-danger flex-1"><Trash2 className="w-4 h-4" /> Delete All</button>
              <button onClick={() => setClearConfirm(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast?.msg} type={toast?.type} />
    </div>
  );
}
