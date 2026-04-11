import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Lock, MessageSquare } from "lucide-react";
import { api } from "../lib/api.js";
import { applyTheme } from "../components/ThemeProvider.jsx";

export default function Login({ adminMode = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || (adminMode ? "/admin" : "/");

  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [publicConfig, setPublicConfig] = useState(null);

  useEffect(() => {
    api.publicConfig()
      .then((cfg) => {
        setPublicConfig(cfg);
        applyTheme(cfg);
      })
      .catch(() => {});

    if (!adminMode) {
      api.me()
        .then(() => navigate(from, { replace: true }))
        .catch(() => {});
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (adminMode) {
        await api.adminLogin(password);
      } else {
        await api.login(password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Incorrect password");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--brand-light)" }}>
      <div className="w-full max-w-sm">
        {/* Logo / branding */}
        <div className="text-center mb-8">
          {publicConfig?.logoUrl ? (
            <img
              src={publicConfig.logoUrl}
              alt="Logo"
              className="h-12 mx-auto mb-4"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg"
              style={{ background: "var(--brand)" }}
            >
              <MessageSquare className="w-7 h-7 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-semibold text-slate-900">
            {adminMode ? "Admin Access" : (publicConfig?.appName || "Campaign Manager")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {adminMode ? "Enter your admin password to continue" : "Sign in to your account"}
          </p>
        </div>

        <div className={`card-elevated p-6 ${shake ? "animate-shake" : ""}`}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-9 pr-10"
                  placeholder="Enter password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="btn w-full py-2.5 text-sm font-semibold text-white justify-center rounded-xl disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        {!adminMode && (
          <p className="text-center mt-5 text-xs text-slate-400">
            <a href="/admin/login" className="hover:underline text-slate-500 font-medium">
              Admin access
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
