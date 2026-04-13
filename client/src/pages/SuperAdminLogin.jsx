import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Shield } from "lucide-react";
import { api } from "../lib/api.js";

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.superAdmin.me()
      .then(() => navigate("/super-admin", { replace: true }))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.superAdmin.login(password);
      navigate("/super-admin", { replace: true });
    } catch (err) {
      setError(err.message || "Incorrect password");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-slate-700 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Shield className="w-7 h-7 text-slate-300" />
          </div>
          <h1 className="text-2xl font-semibold text-white">Super Admin</h1>
          <p className="text-sm text-slate-400 mt-1">Restricted access — account management only</p>
        </div>

        <div className={`bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl ${shake ? "animate-shake" : ""}`}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 text-slate-100 rounded-xl pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 placeholder-slate-500"
                  placeholder="Enter super admin password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-900/30 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center mt-4 text-xs text-slate-600">
          <a href="/login" className="hover:text-slate-400 transition-colors">← Back to account login</a>
        </p>
      </div>
    </div>
  );
}
