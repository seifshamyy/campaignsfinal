import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Send,
  LayoutTemplate,
  Settings,
  LogOut,
  Menu,
  X,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { api } from "../lib/api.js";
import { useConfig } from "./ThemeProvider.jsx";

export default function Layout({ children, adminMode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { config } = useConfig();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await api.logout();
    navigate(adminMode ? "/admin/login" : "/login");
  }

  const navLinks = adminMode
    ? [{ to: "/admin", icon: Settings, label: "Settings" }]
    : [
        { to: "/",               icon: LayoutDashboard,  label: "Dashboard"    },
        { to: "/campaigns/new",  icon: Send,             label: "New Campaign" },
        { to: "/templates",      icon: LayoutTemplate,   label: "Templates"    },
        { to: "/admin",          icon: Settings,         label: "Admin"        },
      ];

  function isActive(to) {
    if (to === "/") return location.pathname === "/";
    return location.pathname.startsWith(to);
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* ── Desktop Sidebar ──────────────────────────────────────────────────── */}
      <aside className="sidebar hidden md:flex flex-col h-screen sticky top-0 overflow-y-auto">
        {/* Brand */}
        <div className="px-4 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            {config?.logoUrl ? (
              <img src={config.logoUrl} alt="Logo" className="h-8 w-auto shrink-0" />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--brand)" }}
              >
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
            )}
            <span className="text-sm font-semibold text-slate-900 truncate">
              {config?.appName || "Campaign Manager"}
            </span>
          </div>
        </div>

        {/* Nav section label */}
        <div className="px-5 pb-1 mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            {adminMode ? "Admin" : "Navigation"}
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-2 space-y-0.5">
          {navLinks.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className={`sidebar-link${isActive(to) ? " active" : ""}`}
            >
              <Icon className={`w-4 h-4 shrink-0 sidebar-icon`} />
              <span>{label}</span>
              {isActive(to) && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
              )}
            </Link>
          ))}
        </nav>

        {/* Bottom: logout */}
        <div className="px-2 pb-5 pt-3 border-t border-slate-100">
          <button
            onClick={handleLogout}
            className="sidebar-link w-full text-left"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile overlay ───────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ────────────────────────────────────────────────────── */}
      <aside
        className={`sidebar fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-200 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 pt-5 pb-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            {config?.logoUrl ? (
              <img src={config.logoUrl} alt="Logo" className="h-8 w-auto shrink-0" />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--brand)" }}
              >
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
            )}
            <span className="text-sm font-semibold text-slate-900 truncate">
              {config?.appName || "Campaign Manager"}
            </span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-2 space-y-0.5 mt-3">
          {navLinks.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={`sidebar-link${isActive(to) ? " active" : ""}`}
            >
              <Icon className="w-4 h-4 shrink-0 sidebar-icon" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="px-2 pb-5 pt-3 border-t border-slate-100">
          <button onClick={handleLogout} className="sidebar-link w-full text-left">
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center h-14 px-4 bg-white border-b border-slate-200 gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-slate-800">
            {config?.appName || "Campaign Manager"}
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 md:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
