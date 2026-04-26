const BASE = "/api";

function getStoredToken() {
  return localStorage.getItem("auth_token");
}

function setStoredToken(token) {
  if (token) localStorage.setItem("auth_token", token);
}

function clearStoredToken() {
  localStorage.removeItem("auth_token");
}

export function getStoredSlug() {
  return localStorage.getItem("account_slug");
}

export function setStoredSlug(slug) {
  if (slug) localStorage.setItem("account_slug", slug);
}

async function request(method, path, body, isFormData = false) {
  const opts = { method, credentials: "include" };
  const storedToken = getStoredToken();

  if (body !== undefined) {
    if (isFormData) {
      if (storedToken) opts.headers = { Authorization: `Bearer ${storedToken}` };
      opts.body = body;
    } else {
      opts.headers = { "Content-Type": "application/json" };
      if (storedToken) opts.headers.Authorization = `Bearer ${storedToken}`;
      opts.body = JSON.stringify(body);
    }
  } else if (storedToken) {
    opts.headers = { Authorization: `Bearer ${storedToken}` };
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, opts);
  } catch (networkErr) {
    const err = new Error(`Cannot reach server — is it running? (${networkErr.message})`);
    err.status = 0;
    throw err;
  }

  if (!res.ok) {
    let err;
    try {
      const data = await res.json();
      err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
    } catch {
      err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
    }
    throw err;
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  if (ct.includes("text/csv")) return res.blob();
  return res.text();
}

// ── Super admin token (separate storage) ─────────────────────────────────────
function getSuperAdminToken() {
  return localStorage.getItem("super_admin_token");
}

async function superAdminRequest(method, path, body) {
  const opts = { method, credentials: "include" };
  const token = getSuperAdminToken();

  if (body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    opts.body = JSON.stringify(body);
  } else if (token) {
    opts.headers = { Authorization: `Bearer ${token}` };
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, opts);
  } catch (networkErr) {
    const err = new Error(`Cannot reach server (${networkErr.message})`);
    err.status = 0;
    throw err;
  }

  if (!res.ok) {
    let err;
    try {
      const data = await res.json();
      err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
    } catch {
      err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
    }
    throw err;
  }

  return res.json();
}

export const api = {
  // ── Auth ─────────────────────────────────────────────────────────────────
  login: async (slug, password) => {
    const data = await request("POST", "/auth/login", { slug, password });
    setStoredToken(data?.token);
    setStoredSlug(slug);
    return data;
  },
  adminLogin: async (slug, password) => {
    const data = await request("POST", "/auth/admin-login", { slug, password });
    setStoredToken(data?.token);
    setStoredSlug(slug);
    return data;
  },
  logout: async () => {
    clearStoredToken();
    return request("POST", "/auth/logout");
  },
  me: () => request("GET", "/auth/me"),
  publicConfig: (slug) => {
    const s = slug || getStoredSlug();
    return request("GET", s ? `/auth/config-public?slug=${encodeURIComponent(s)}` : "/auth/config-public");
  },

  // ── Phone Numbers (user-accessible) ──────────────────────────────────────
  getAccountPhoneNumbers: () => request("GET", "/phone-numbers"),

  // ── Templates ─────────────────────────────────────────────────────────────
  getTemplates: (phoneNumberId) => {
    const qs = phoneNumberId ? `?phoneNumberId=${phoneNumberId}` : "";
    return request("GET", `/templates${qs}`);
  },
  getTemplate: (id) => request("GET", `/templates/${id}`),
  syncTemplates: (phoneNumberId) => request("POST", "/templates/sync", { phoneNumberId }),
  downloadExampleCsv: (id) => request("GET", `/templates/${id}/example-csv`),

  // ── Campaigns ─────────────────────────────────────────────────────────────
  getCampaignStats: () => request("GET", "/campaigns/stats"),
  getCampaigns: (page = 1) => request("GET", `/campaigns?page=${page}`),
  getCampaign: (id) => request("GET", `/campaigns/${id}`),
  createCampaign: (data) => request("POST", "/campaigns", data),
  getCampaignMessages: (id, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request("GET", `/campaigns/${id}/messages${qs ? "?" + qs : ""}`);
  },
  cancelCampaign: (id) => request("POST", `/campaigns/${id}/cancel`),
  downloadReport: (id) => request("GET", `/campaigns/${id}/report`),
  debugPayload: (id) => request("GET", `/campaigns/${id}/debug-payload`),
  retryFailed: (id) => request("POST", `/campaigns/${id}/retry-failed`),

  // ── Upload ────────────────────────────────────────────────────────────────
  parseFile: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("POST", "/upload/parse", form, true);
  },

  // ── Admin (account-scoped) ────────────────────────────────────────────────
  getAdminConfig: () => request("GET", "/admin/config"),
  updateAdminConfig: (data) => request("PUT", "/admin/config", data),
  changeAdminPassword: (data) => request("PUT", "/admin/password", data),
  setAppPassword: (password) => request("PUT", "/admin/app-password", { password }),
  uploadLogo: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("POST", "/admin/upload-logo", form, true);
  },
  uploadFavicon: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("POST", "/admin/upload-favicon", form, true);
  },
  getAdminStats: () => request("GET", "/admin/stats"),
  clearHistory: () => request("DELETE", "/admin/clear-history"),

  // ── Phone Numbers ─────────────────────────────────────────────────────────
  getPhoneNumbers: () => request("GET", "/admin/phone-numbers"),
  createPhoneNumber: (data) => request("POST", "/admin/phone-numbers", data),
  updatePhoneNumber: (id, data) => request("PUT", `/admin/phone-numbers/${id}`, data),
  deletePhoneNumber: (id) => request("DELETE", `/admin/phone-numbers/${id}`),
  testPhoneNumber: (id) => request("POST", `/admin/phone-numbers/${id}/test`),

  // ── Chatwoot Integration ──────────────────────────────────────────────────
  getChatwootConfig:    ()     => request("GET",    "/admin/chatwoot"),
  saveChatwootConfig:   (data) => request("PUT",    "/admin/chatwoot", data),
  testChatwootConfig:   ()     => request("POST",   "/admin/chatwoot/test"),
  removeChatwootConfig: ()     => request("DELETE", "/admin/chatwoot"),

  // ── Super Admin ───────────────────────────────────────────────────────────
  superAdmin: {
    login: async (password) => {
      const data = await superAdminRequest("POST", "/super-admin/login", { password });
      if (data?.token) localStorage.setItem("super_admin_token", data.token);
      return data;
    },
    logout: () => {
      localStorage.removeItem("super_admin_token");
      return superAdminRequest("POST", "/super-admin/logout");
    },
    me: () => superAdminRequest("GET", "/super-admin/me"),
    getStats: () => superAdminRequest("GET", "/super-admin/stats"),
    getAccounts: () => superAdminRequest("GET", "/super-admin/accounts"),
    createAccount: (data) => superAdminRequest("POST", "/super-admin/accounts", data),
    updateAccount: (id, data) => superAdminRequest("PUT", `/super-admin/accounts/${id}`, data),
    deleteAccount: (id, force = false) =>
      superAdminRequest("DELETE", `/super-admin/accounts/${id}${force ? "?force=1" : ""}`),
    changePassword: (data) => superAdminRequest("PUT", "/super-admin/password", data),
  },
};
