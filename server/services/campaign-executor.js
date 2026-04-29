import { prisma } from "../index.js";
import { MetaApiClient, decryptToken, sendWithRetry } from "./meta-api.js";
import { buildMetaPayload } from "./template-parser.js";
import { ChatwootClient, interpolateNote } from "./chatwoot.js";

// SSE client registry: campaignId → Set of res objects
const sseClients = new Map();

export function registerSseClient(campaignId, res) {
  if (!sseClients.has(campaignId)) sseClients.set(campaignId, new Set());
  sseClients.get(campaignId).add(res);
}

export function unregisterSseClient(campaignId, res) {
  sseClients.get(campaignId)?.delete(res);
}

function emitSse(campaignId, event, data) {
  const clients = sseClients.get(campaignId);
  if (!clients || clients.size === 0) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => {
    try { res.write(msg); } catch {}
  });
}

const FATAL_CODES = new Set([190]); // Token expired
const SKIP_CODES = new Set([131026, 131047, 131009, 132000, 133010]);

/**
 * Execute a campaign: reads credentials from the campaign's own PhoneNumber.
 */
export async function executeCampaign(campaignId) {
  // Load campaign with phone number credentials
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      phoneNumber: true,
      account: {
        select: {
          sendRatePerSecond: true,
          chatwootUrl: true, chatwootApiToken: true,
          chatwootAccountId: true, chatwootInboxId: true, chatwootVerified: true,
        },
      },
    },
  });

  if (!campaign) return;

  const plainToken = decryptToken(campaign.phoneNumber?.metaAccessToken);

  if (!plainToken || !campaign.phoneNumber?.phoneNumberId) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "failed" },
    });
    emitSse(campaignId, "error", { message: "Meta credentials not configured for this phone number" });
    return;
  }

  const client = new MetaApiClient({
    accessToken: plainToken,
    phoneNumberId: campaign.phoneNumber.phoneNumberId,
    wabaId: campaign.phoneNumber.wabaId,
  });

  const messages = await prisma.message.findMany({
    where: { campaignId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  const total = campaign.totalRecipients;
  const sendRate = campaign.account?.sendRatePerSecond || 10;
  const delayMs = Math.round(1000 / sendRate);

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "sending", startedAt: new Date() },
  });

  // Build Chatwoot client — only if integration is verified AND this campaign has a note
  const acc = campaign.account;
  const chatwootClient =
    campaign.chatwootNote &&
    acc.chatwootVerified &&
    acc.chatwootUrl &&
    acc.chatwootApiToken &&
    acc.chatwootAccountId &&
    acc.chatwootInboxId
      ? new ChatwootClient({
          url:       acc.chatwootUrl,
          apiToken:  acc.chatwootApiToken,
          accountId: acc.chatwootAccountId,
          inboxId:   acc.chatwootInboxId,
        })
      : null;

  const noteTemplate = campaign.chatwootNote || null;
  const sentDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  let sent = campaign.sent;
  let failed = campaign.failed;
  const startTime = Date.now();
  // targetIntervalMs is the minimum gap between send starts.
  // We subtract elapsed time so DB + API latency doesn't add on top.
  const targetIntervalMs = 1000 / sendRate;

  for (let i = 0; i < messages.length; i++) {
    const iterStart = Date.now();
    const msg = messages[i];

    // Cancellation check — every 10 messages to avoid a DB round-trip per send
    if (i % 10 === 0) {
      const fresh = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { cancelRequested: true },
      });
      if (fresh?.cancelRequested) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: "cancelled", completedAt: new Date(), sent, failed },
        });
        emitSse(campaignId, "cancelled", { sent, failed, total });
        return;
      }
    }

    const rowData = { phone_number: msg.phoneNumber, ...(msg.params || {}) };
    const payload = buildMetaPayload(campaign.template, rowData, campaign.template.paramSchema);

    try {
      const result = await sendWithRetry(client, payload);
      const metaId = result?.messages?.[0]?.id;

      // Message status update — always needed for reporting
      await prisma.message.update({
        where: { id: msg.id },
        data: { status: "sent", metaMessageId: metaId, sentAt: new Date() },
      });

      sent++;

      // Campaign counter flush — every 10 messages or on the last one
      if ((i + 1) % 10 === 0 || i === messages.length - 1) {
        await prisma.campaign.update({ where: { id: campaignId }, data: { sent, failed } });
      }

      // Chatwoot private note — fire-and-forget, never blocks the campaign
      if (chatwootClient && noteTemplate) {
        const note = interpolateNote(noteTemplate, {
          campaign_name:  campaign.name,
          template_name:  campaign.template.name,
          date:           sentDate,
          phone_number:   msg.phoneNumber,
          phone_label:    campaign.phoneNumber?.label || "",
        });
        chatwootClient.postCampaignNote(msg.phoneNumber, note).catch((err) =>
          console.warn(`[chatwoot] ${msg.phoneNumber}: ${err.message}`)
        );
      }

      emitSse(campaignId, "progress", {
        sent, failed, total,
        currentPhone: msg.phoneNumber,
        status: "sent",
        metaMessageId: metaId,
      });
    } catch (err) {
      const code = String(err.code || "");
      const errorMsg = err.message || "Unknown error";

      console.error(`[campaign ${campaignId}] FAILED ${msg.phoneNumber}:`, errorMsg);
      if (err.metaResponse) console.error("  Meta response:", JSON.stringify(err.metaResponse));

      await prisma.message.update({
        where: { id: msg.id },
        data: { status: "failed", errorMessage: errorMsg, errorCode: code },
      });

      failed++;

      if ((i + 1) % 10 === 0 || i === messages.length - 1) {
        await prisma.campaign.update({ where: { id: campaignId }, data: { sent, failed } });
      }

      emitSse(campaignId, "progress", {
        sent, failed, total,
        currentPhone: msg.phoneNumber,
        status: "failed",
        error: errorMsg,
        errorCode: code,
        metaResponse: err.metaResponse || null,
      });

      if (FATAL_CODES.has(err.code)) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: "failed", completedAt: new Date(), sent, failed },
        });
        emitSse(campaignId, "error", {
          message: "Meta access token expired. Please update your token in Admin settings.",
        });
        return;
      }
    }

    // Elapsed-time-aware sleep: only wait the remaining time to hit the
    // target interval. If API + DB already took longer, don't sleep at all.
    const elapsed = Date.now() - iterStart;
    const remaining = Math.max(0, targetIntervalMs - elapsed);
    if (remaining > 0) await sleep(remaining);
  }

  const duration = (Date.now() - startTime) / 1000;
  const finalStatus = sent === 0 && failed > 0 ? "failed" : "completed";

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: finalStatus, completedAt: new Date() },
  });

  emitSse(campaignId, "complete", { sent, failed, total, duration });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
