import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, Users, BarChart2, Plus, Pencil, Trash2, X,
  CheckCircle, XCircle, LogOut, Eye, EyeOff, Loader2,
  MessageSquare, Phone, ToggleLeft, ToggleRight
} from "lucide-react";
import { api } from "../lib/api.js";

function Toast({ msg, type }) {
  if (!msg) return null;
  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${type === "success" ? "bg-green-700 text-white" : "bg-red-600 text-white"}`}>
      {type === "success" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {msg}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value ?? "—"}</p>
    </div>
  );
}

// ── Create / Edit Account Modal ───────────────────────────────────────────────
function AccountModal({ account, onClose, onSave }) {
  const [form, setForm] = useState({
    slug: account?.slug || "",
    name: account?.name || "",
    adminPassword: "",
    confirmPassword: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function slugify(name) {
    return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40);
  }

  function handleNameChange(e) {
    const name = e.target.value;
    setForm((f) => ({ ...f, name, slug: account ? f.slug : slugify(name) }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!account && !form.slug.trim()) { setError("Slug is required"); return; }
    if (!account && !form.adminPassword) { setError("Admin password is required"); return; }
    if (form.adminPassword && form.adminPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (form.adminPassword && form.adminPassword !== form.confirmPassword) { setError("Passwords do not match"); return; }

    setSaving(true);
    setError("");
    try {
      await onSave({
        slug: form.slug,
        name: form.name,
        adminPassword: form.adminPassword || undefined,
      });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            {account ? "Edit Account" : "Create Account"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Account Name</label>
          <input
            type="text"
            value={form.name}
            onChange={handleNameChange}
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            placeholder="Acme Corp"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Account Slug <span className="text-slate-500 text-xs">(used to log in)</span>
          </label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
            disabled={!!account}
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-40"
            placeholder="acme-corp"
          />
          {!account && <p className="text-xs text-slate-500 mt-1">Cannot be changed after creation</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Admin Password {account && <span className="text-slate-500 text-xs">(leave blank to keep current)</span>}
          </label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              placeholder={account ? "New password (optional)" : "Min 6 characters"}
            />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" tabIndex={-1}>
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {form.adminPassword && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm Password</label>
            <input
              type={showPw ? "text" : "password"}
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
              placeholder="Repeat password"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {account ? "Save Changes" : "Create Account"}
          </button>
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-2.5 rounded-xl text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Change Super Admin Password Modal ─────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    if (form.next.length < 8) { setError("New password must be at least 8 characters"); return; }
    if (form.next !== form.confirm) { setError("Passwords do not match"); return; }
    setSaving(true);
    try {
      await api.superAdmin.changePassword({ currentPassword: form.current, newPassword: form.next });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Change Super Admin Password</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
        </div>

        {["current", "next", "confirm"].map((field) => (
          <input
            key={field}
            type="password"
            value={form[field]}
            onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            placeholder={field === "current" ? "Current password" : field === "next" ? "New password (min 8)" : "Confirm new password"}
          />
        ))}

        {error && <p className="text-sm text-red-400 bg-red-900/30 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-sm text-green-400">Password changed!</p>}

        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
            {saving ? "Saving…" : "Change Password"}
          </button>
          <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-2.5 rounded-xl text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main SuperAdmin Panel ─────────────────────────────────────────────────────
export default function SuperAdmin() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "create" | { account }
  const [changePwModal, setChangePwModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // null | accountId
  const [toast, setToast] = useState(null);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    try {
      const [s, a] = await Promise.all([api.superAdmin.getStats(), api.superAdmin.getAccounts()]);
      setStats(s);
      setAccounts(a);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        navigate("/super-admin/login", { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleLogout() {
    await api.superAdmin.logout();
    navigate("/super-admin/login", { replace: true });
  }

  async function handleSaveAccount(formData) {
    if (modal?.account) {
      await api.superAdmin.updateAccount(modal.account.id, formData);
      showToast("Account updated");
    } else {
      await api.superAdmin.createAccount(formData);
      showToast("Account created");
    }
    await load();
  }

  async function handleToggleActive(account) {
    try {
      await api.superAdmin.updateAccount(account.id, { isActive: !account.isActive });
      showToast(account.isActive ? "Account deactivated" : "Account activated");
      await load();
    } catch (err) {
      showToast(err.message || "Failed", "error");
    }
  }

  async function handleDelete(accountId) {
    try {
      await api.superAdmin.deleteAccount(accountId, true);
      showToast("Account deleted");
      setDeleteConfirm(null);
      await load();
    } catch (err) {
      showToast(err.message || "Failed to delete", "error");
      setDeleteConfirm(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
            <Shield className="w-4 h-4 text-slate-300" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Super Admin Panel</h1>
            <p className="text-xs text-slate-500">WhatsApp Campaign Manager</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChangePwModal(true)}
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Change Password
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Users}          label="Accounts"       value={stats?.totalAccounts}     color="bg-blue-600" />
          <StatCard icon={Phone}          label="Phone Numbers"  value={stats?.totalPhoneNumbers} color="bg-purple-600" />
          <StatCard icon={MessageSquare}  label="Campaigns"      value={stats?.totalCampaigns}    color="bg-emerald-600" />
          <StatCard icon={BarChart2}      label="Messages Sent"  value={stats?.totalMessages?.toLocaleString()} color="bg-amber-600" />
        </div>

        {/* Accounts table */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Accounts ({accounts.length})</h2>
            <button
              onClick={() => setModal("create")}
              className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Account
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No accounts yet</p>
              <p className="text-slate-600 text-sm mt-1">Create your first account to get started.</p>
              <button onClick={() => setModal("create")} className="mt-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors mx-auto flex items-center gap-2">
                <Plus className="w-4 h-4" /> Create Account
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {accounts.map((account) => (
                <div key={account.id} className={`px-6 py-4 flex items-center justify-between gap-4 ${!account.isActive ? "opacity-50" : ""}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-white truncate">{account.name}</p>
                      {!account.isActive && (
                        <span className="text-xs bg-red-900/40 text-red-400 border border-red-800/50 px-1.5 py-0.5 rounded-md">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      <span className="font-mono text-slate-500">/{account.slug}</span>
                      <span className="mx-2">·</span>
                      {account._count?.campaigns || 0} campaigns
                      <span className="mx-2">·</span>
                      {account._count?.phoneNumbers || 0} numbers
                      <span className="mx-2">·</span>
                      Created {new Date(account.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/login?account=${account.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-400 hover:text-blue-400 px-2 py-1.5 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      Open
                    </a>
                    <button
                      onClick={() => handleToggleActive(account)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                      title={account.isActive ? "Deactivate" : "Activate"}
                    >
                      {account.isActive
                        ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                        : <ToggleLeft className="w-4 h-4" />
                      }
                    </button>
                    <button
                      onClick={() => setModal({ account })}
                      className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(account.id)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Account modal */}
      {modal && (
        <AccountModal
          account={modal === "create" ? null : modal.account}
          onClose={() => setModal(null)}
          onSave={handleSaveAccount}
        />
      )}

      {/* Change super admin password modal */}
      {changePwModal && <ChangePasswordModal onClose={() => setChangePwModal(false)} />}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-2">Delete Account</h3>
            <p className="text-sm text-slate-400 mb-5">
              This will permanently delete the account and ALL its data — phone numbers, templates, campaigns, and messages. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-2.5 rounded-xl text-sm"
              >
                <Trash2 className="w-4 h-4 inline mr-1" /> Delete Everything
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-2.5 rounded-xl text-sm"
              >
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
