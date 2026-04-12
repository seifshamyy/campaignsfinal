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

async function request(method, path, body, isFormData = false) {
  const opts = {
    method,
    credentials: "include",
  };

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

export const api = {
  // Auth
  login: async (password) => {
    const data = await request("POST", "/auth/login", { password });
    setStoredToken(data?.token);
    return data;
  },
  adminLogin: async (password) => {
    const data = await request("POST", "/auth/admin-login", { password });
    setStoredToken(data?.token);
    return data;
  },
  logout: async () => {
    clearStoredToken();
    return request("POST", "/auth/logout");
  },
  me: () => request("GET", "/auth/me"),
  publicConfig: () => request("GET", "/auth/config-public"),

  // Templates
  getTemplates: () => request("GET", "/templates"),
  getTemplate: (id) => request("GET", `/templates/${id}`),
  syncTemplates: () => request("POST", "/templates/sync"),
  downloadExampleCsv: (id) => request("GET", `/templates/${id}/example-csv`),

  // Campaigns
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

  // Upload
  parseFile: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("POST", "/upload/parse", form, true);
  },

  // Admin
  getAdminConfig: () => request("GET", "/admin/config"),
  updateAdminConfig: (data) => request("PUT", "/admin/config", data),
  testConnection: () => request("POST", "/admin/test-connection"),
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
};
