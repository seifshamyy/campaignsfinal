import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { api, getStoredSlug } from "./lib/api.js";

import ThemeProvider from "./components/ThemeProvider.jsx";
import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import CampaignHistory from "./pages/CampaignHistory.jsx";
import CampaignCreate from "./pages/CampaignCreate.jsx";
import CampaignDetail from "./pages/CampaignDetail.jsx";
import Templates from "./pages/Templates.jsx";
import SuperAdmin from "./pages/SuperAdmin.jsx";
import SuperAdminLogin from "./pages/SuperAdminLogin.jsx";
import Layout from "./components/Layout.jsx";

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "var(--brand)" }} />
    </div>
  );
}

function AuthGuard({ children }) {
  const [status, setStatus] = useState("loading");
  const location = useLocation();

  useEffect(() => {
    api.me()
      .then(() => setStatus("authed"))
      .catch(async () => {
        try {
          const slug = getStoredSlug();
          if (!slug) { setStatus("unauthed"); return; }
          const cfg = await api.publicConfig(slug);
          if (!cfg.requiresPassword && cfg.accountFound) {
            await api.login(slug, "");
            setStatus("authed");
          } else {
            setStatus("unauthed");
          }
        } catch {
          setStatus("unauthed");
        }
      });
  }, []);

  if (status === "loading") return <Spinner />;
  if (status === "unauthed") {
    const slug = getStoredSlug();
    const loginUrl = slug ? `/login?account=${slug}` : "/login";
    return <Navigate to={loginUrl} state={{ from: location }} replace />;
  }
  return children;
}

function AdminGuard({ children }) {
  const [status, setStatus] = useState("loading");
  const location = useLocation();

  useEffect(() => {
    api.me()
      .then((d) => setStatus(d.isAdmin ? "authed" : "unauthed"))
      .catch(() => setStatus("unauthed"));
  }, []);

  if (status === "loading") return <Spinner />;
  if (status === "unauthed") {
    const slug = getStoredSlug();
    const loginUrl = slug ? `/admin/login?account=${slug}` : "/admin/login";
    return <Navigate to={loginUrl} state={{ from: location }} replace />;
  }
  return children;
}

function SuperAdminGuard({ children }) {
  const [status, setStatus] = useState("loading");
  const location = useLocation();

  useEffect(() => {
    api.superAdmin.me()
      .then(() => setStatus("authed"))
      .catch(() => setStatus("unauthed"));
  }, []);

  if (status === "loading") return <Spinner />;
  if (status === "unauthed") {
    return <Navigate to="/super-admin/login" state={{ from: location }} replace />;
  }
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login"            element={<Login />} />
          <Route path="/admin/login"      element={<Login adminMode />} />
          <Route path="/super-admin/login" element={<SuperAdminLogin />} />

          {/* Super admin panel */}
          <Route
            path="/super-admin"
            element={
              <SuperAdminGuard>
                <SuperAdmin />
              </SuperAdminGuard>
            }
          />

          {/* Account admin */}
          <Route
            path="/admin"
            element={
              <AdminGuard>
                <Layout adminMode>
                  <Admin />
                </Layout>
              </AdminGuard>
            }
          />

          {/* Account user */}
          <Route path="/" element={<AuthGuard><Layout><CampaignHistory /></Layout></AuthGuard>} />
          <Route path="/campaigns/new" element={<AuthGuard><Layout><CampaignCreate /></Layout></AuthGuard>} />
          <Route path="/campaigns/:id" element={<AuthGuard><Layout><CampaignDetail /></Layout></AuthGuard>} />
          <Route path="/templates" element={<AuthGuard><Layout><Templates /></Layout></AuthGuard>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
