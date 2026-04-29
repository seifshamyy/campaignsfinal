/**
 * Chatwoot API client.
 *
 * Auth: api_access_token header (NOT Bearer).
 * All account-scoped endpoints live under /api/v1/accounts/{accountId}/...
 *
 * Flow per campaign message:
 *   1. Search contact by phone  →  create if not found
 *   2. Get contact's conversations filtered to our inbox  →  create if none
 *   3. POST a private note on that conversation
 */

export class ChatwootClient {
  constructor({ url, apiToken, accountId, inboxId }) {
    this.base = url.replace(/\/$/, "");
    this.apiToken = apiToken;
    this.accountId = Number(accountId);
    this.inboxId = Number(inboxId);
  }

  // ── Internal fetch ─────────────────────────────────────────────────────────
  async #fetch(method, path, body) {
    const url = `${this.base}/api/v1/accounts/${this.accountId}${path}`;
    const opts = {
      method,
      headers: {
        "api_access_token": this.apiToken,
        "Content-Type": "application/json",
      },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(url, opts);
    } catch (netErr) {
      throw new Error(`Cannot reach Chatwoot at ${this.base}: ${netErr.message}`);
    }

    if (!res.ok) {
      let msg;
      try {
        const j = await res.json();
        msg = j?.message || j?.error || JSON.stringify(j);
      } catch {
        msg = await res.text().catch(() => `HTTP ${res.status}`);
      }
      throw new Error(`Chatwoot ${res.status}: ${msg}`);
    }

    return res.json();
  }

  // ── Test connection ────────────────────────────────────────────────────────
  // Verifies token works AND the inbox exists.
  async testConnection() {
    const data = await this.#fetch("GET", "/inboxes");
    const inboxes = data.payload || [];
    const inbox = inboxes.find((i) => i.id === this.inboxId);
    if (!inbox) {
      throw new Error(
        `Inbox #${this.inboxId} not found. Available inboxes: ${
          inboxes.map((i) => `#${i.id} ${i.name}`).join(", ") || "none"
        }`
      );
    }
    return { ok: true, inboxName: inbox.name, inboxChannel: inbox.channel_type };
  }

  // ── Contact ───────────────────────────────────────────────────────────────
  // Phone must be digits only (e.g. 966501234567). We add the + prefix.
  async findOrCreateContact(phone) {
    const normalized = phone.startsWith("+") ? phone : `+${phone}`;

    // Search by normalized phone
    const search = await this.#fetch(
      "GET",
      `/contacts/search?q=${encodeURIComponent(normalized)}&page=1&include_contacts=true`
    );

    const contacts = search.payload || [];
    const match = contacts.find(
      (c) => c.phone_number === normalized || c.phone_number === phone
    );
    if (match) return match;

    // Create new contact
    const created = await this.#fetch("POST", "/contacts", {
      name: normalized,       // will be overridden when contact replies with their name
      phone_number: normalized,
    });

    // Chatwoot returns { payload: { contact: {...}, contact_inbox: {...} } }
    return created?.payload?.contact ?? created?.payload ?? created;
  }

  // ── Conversation ──────────────────────────────────────────────────────────
  // Find an existing conversation for this contact in our inbox, or create one.
  async findOrCreateConversation(contactId) {
    const data = await this.#fetch("GET", `/contacts/${contactId}/conversations`);
    const conversations = data.payload || [];

    // Find the most recent open/pending conversation in our inbox
    const existing = conversations.find((c) => c.inbox_id === this.inboxId);
    if (existing) return existing;

    // Create a new conversation in our inbox for this contact
    const created = await this.#fetch("POST", "/conversations", {
      inbox_id: this.inboxId,
      contact_id: contactId,
      status: "open",
    });

    return created;
  }

  // ── Private note ──────────────────────────────────────────────────────────
  async addPrivateNote(conversationId, content) {
    return this.#fetch("POST", `/conversations/${conversationId}/messages`, {
      content,
      message_type: "outgoing",
      private: true,
    });
  }

  // ── Full flow ─────────────────────────────────────────────────────────────
  // Call this after a successful WhatsApp send. Never throws — logs instead.
  async postCampaignNote(phone, noteContent) {
    const contact = await this.findOrCreateContact(phone);
    const conversation = await this.findOrCreateConversation(contact.id);
    await this.addPrivateNote(conversation.id, noteContent);
  }
}

// ── Note interpolation ─────────────────────────────────────────────────────
// Replaces {{campaign_name}}, {{template_name}}, {{date}}, {{phone_number}}
export function interpolateNote(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}
