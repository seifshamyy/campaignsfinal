import { prisma } from "../index.js";
import { MetaApiClient, decryptToken, sendWithRetry } from "./meta-api.js";
import { buildMetaPayload } from "./template-parser.js";

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
      account: { select: { sendRatePerSecond: true } },
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

  let sent = campaign.sent;
  let failed = campaign.failed;
  const startTime = Date.now();

  for (const msg of messages) {
    // Check for cancellation
    const fresh = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { cancelRequested: true },
    });
    if (fresh?.cancelRequested) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "cancelled", completedAt: new Date() },
      });
      emitSse(campaignId, "cancelled", { sent, failed, total });
      return;
    }

    const rowData = { phone_number: msg.phoneNumber, ...(msg.params || {}) };
    const payload = buildMetaPayload(campaign.template, rowData, campaign.template.paramSchema);

    try {
      const result = await sendWithRetry(client, payload);
      const metaId = result?.messages?.[0]?.id;

      await prisma.message.update({
        where: { id: msg.id },
        data: { status: "sent", metaMessageId: metaId, sentAt: new Date() },
      });

      sent++;
      await prisma.campaign.update({ where: { id: campaignId }, data: { sent } });

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
      await prisma.campaign.update({ where: { id: campaignId }, data: { failed } });

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
          data: { status: "failed", completedAt: new Date() },
        });
        emitSse(campaignId, "error", {
          message: "Meta access token expired. Please update your token in Admin settings.",
        });
        return;
      }
    }

    await sleep(delayMs);
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
