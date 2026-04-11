import CryptoJS from "crypto-js";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ── Token encryption ─────────────────────────────────────────────────────────
const ENC_KEY = process.env.JWT_SECRET || "dev-secret-change-in-production";

export function encryptToken(plain) {
  if (!plain) return null;
  return CryptoJS.AES.encrypt(plain, ENC_KEY).toString();
}

export function decryptToken(cipher) {
  if (!cipher) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, ENC_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
}

// ── API Client ───────────────────────────────────────────────────────────────
export class MetaApiClient {
  constructor({ accessToken, phoneNumberId, wabaId }) {
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.wabaId = wabaId;
  }

  async #fetch(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const data = await res.json();

    if (!res.ok) {
      const metaErr = data?.error || {};
      const msg = [
        metaErr.message || `Meta API error ${res.status}`,
        metaErr.error_data ? `(${metaErr.error_data})` : null,
      ].filter(Boolean).join(" ");
      const err = new Error(msg);
      err.code = metaErr.code;
      err.subcode = metaErr.error_subcode;
      err.type = metaErr.type;
      err.status = res.status;
      err.metaResponse = data; // full raw response for logging
      throw err;
    }

    return data;
  }

  // ── Templates ──────────────────────────────────────────────────────────────
  async fetchTemplates() {
    const templates = [];
    let url = `${GRAPH_BASE}/${this.wabaId}/message_templates?fields=id,name,status,category,language,components&limit=100`;

    while (url) {
      const data = await this.#fetch(url);
      templates.push(...(data.data || []));
      url = data.paging?.next || null;
    }

    return templates;
  }

  // ── Send message ───────────────────────────────────────────────────────────
  async sendTemplate(payload) {
    const url = `${GRAPH_BASE}/${this.phoneNumberId}/messages`;

    console.log("\n── META SEND ─────────────────────────────────────────────");
    console.log(`POST ${url}`);
    console.log(`Authorization: Bearer ${this.accessToken}`);
    console.log("Payload:", JSON.stringify(payload));

    const result = await this.#fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    console.log("Meta response:", JSON.stringify(result));
    console.log("──────────────────────────────────────────────────────────\n");

    return result;
  }

  // ── Test connection ────────────────────────────────────────────────────────
  async testConnection() {
    const data = await this.#fetch(
      `${GRAPH_BASE}/${this.phoneNumberId}?fields=id,display_phone_number,verified_name`
    );
    return {
      phoneNumber: data.display_phone_number,
      accountName: data.verified_name,
    };
  }
}

// ── Retry helper for rate limiting ───────────────────────────────────────────
export async function sendWithRetry(client, payload, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.sendTemplate(payload);
    } catch (err) {
      lastErr = err;
      const isRateLimit = err.code === 130429 || err.status === 429;
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 5000; // 5s, 10s, 20s
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
