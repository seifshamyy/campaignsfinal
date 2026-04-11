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
    try {
      res.write(msg);
    } catch {
      // client disconnected
    }
  });
}

// ── Fatal error codes that should stop the campaign ──────────────────────────
const FATAL_CODES = new Set([190]); // Token expired

// ── Error codes to log and skip (don't retry) ─────────────────────────────
const SKIP_CODES = new Set([131026, 131047, 131009, 132000, 133010]);

/**
 * Execute a campaign: send all pending messages with rate limiting.
 * Runs in the background — does not block the HTTP response.
 */
export async function executeCampaign(campaignId) {
  const config = await prisma.config.findFirst();
  if (!config?.metaAccessToken) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "failed" },
    });
    emitSse(campaignId, "error", { message: "Meta API not configured" });
    return;
  }

  const plainToken = decryptToken(config.metaAccessToken);
  const client = new MetaApiClient({
    accessToken: plainToken,
    phoneNumberId: config.phoneNumberId,
    wabaId: config.wabaId,
  });

  // Fetch campaign + template + pending messages
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true },
  });

  if (!campaign) return;

  const messages = await prisma.message.findMany({
    where: { campaignId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  const total = campaign.totalRecipients;
  const delayMs = Math.round(1000 / (config.sendRatePerSecond || 10));

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

    const rowData = {
      phone_number: msg.phoneNumber,
      ...(msg.params || {}),
    };

    const payload = buildMetaPayload(
      campaign.template,
      rowData,
      campaign.template.paramSchema
    );

    try {
      const result = await sendWithRetry(client, payload);
      const metaId = result?.messages?.[0]?.id;

      await prisma.message.update({
        where: { id: msg.id },
        data: {
          status: "sent",
          metaMessageId: metaId,
          sentAt: new Date(),
        },
      });

      sent++;
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { sent },
      });

      emitSse(campaignId, "progress", {
        sent,
        failed,
        total,
        currentPhone: msg.phoneNumber,
        status: "sent",
        metaMessageId: metaId,
      });
    } catch (err) {
      const code = String(err.code || "");
      const errorMsg = err.message || "Unknown error";

      // Log full Meta response to server console so it's always visible
      console.error(`[campaign ${campaignId}] FAILED ${msg.phoneNumber}:`, errorMsg);
      if (err.metaResponse) {
        console.error("  Meta response:", JSON.stringify(err.metaResponse));
      }

      await prisma.message.update({
        where: { id: msg.id },
        data: {
          status: "failed",
          errorMessage: errorMsg,
          errorCode: code,
        },
      });

      failed++;
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { failed },
      });

      emitSse(campaignId, "progress", {
        sent,
        failed,
        total,
        currentPhone: msg.phoneNumber,
        status: "failed",
        error: errorMsg,
        errorCode: code,
        metaResponse: err.metaResponse || null,
      });

      // Token expired — stop campaign
      if (FATAL_CODES.has(err.code)) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: "failed",
            completedAt: new Date(),
          },
        });
        emitSse(campaignId, "error", {
          message:
            "Meta access token expired. Please update your token in the Admin panel.",
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
