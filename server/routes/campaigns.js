import { Router } from "express";
import { prisma } from "../index.js";
import { requireAuth } from "../middleware/auth.js";
import { executeCampaign, registerSseClient, unregisterSseClient } from "../services/campaign-executor.js";
import { normalizePhone, validatePhone } from "../utils/phone.js";
import { buildMetaPayload } from "../services/template-parser.js";

const router = Router();
router.use(requireAuth);

// GET /api/campaigns/stats
router.get("/stats", async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalCampaigns, totalMessages, thisMonth, failedMessages] =
    await Promise.all([
      prisma.campaign.count(),
      prisma.message.count({ where: { status: { in: ["sent", "delivered", "read"] } } }),
      prisma.campaign.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.message.count({ where: { status: "failed" } }),
    ]);

  const total = totalMessages + failedMessages;
  const successRate = total > 0 ? Math.round((totalMessages / total) * 100) : 0;

  res.json({ totalCampaigns, totalMessages, successRate, thisMonth });
});

// GET /api/campaigns
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const skip = (page - 1) * limit;

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { template: { select: { name: true, language: true } } },
    }),
    prisma.campaign.count(),
  ]);

  res.json({ campaigns, total, page, pages: Math.ceil(total / limit) });
});

// POST /api/campaigns
router.post("/", async (req, res) => {
  const { name, templateId, rows, columnMapping, originalFileName } = req.body;

  if (!templateId || !rows?.length) {
    return res.status(400).json({ error: "templateId and rows are required" });
  }

  const config = await prisma.config.findFirst();
  const defaultCC = config?.defaultCountryCode || "966";

  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template) return res.status(404).json({ error: "Template not found" });

  // Process and validate rows
  const validMessages = [];
  const errors = [];
  const seenPhones = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Map columns to expected keys
    const mapped = {};
    if (columnMapping) {
      for (const [targetKey, sourceKey] of Object.entries(columnMapping)) {
        mapped[targetKey] = row[sourceKey];
      }
    } else {
      Object.assign(mapped, row);
    }

    const rawPhone = mapped.phone_number || mapped.phone || mapped.mobile || row[Object.keys(row)[0]];
    const phone = normalizePhone(rawPhone, defaultCC);
    const phoneValidation = validatePhone(phone);

    if (!phoneValidation.valid) {
      errors.push({ row: i + 1, phone: rawPhone, error: phoneValidation.error });
      continue;
    }

    if (seenPhones.has(phone)) {
      errors.push({ row: i + 1, phone, error: "Duplicate phone number" });
      continue;
    }

    seenPhones.add(phone);

    // Build params object (everything except phone)
    const params = { ...mapped };
    delete params.phone_number;
    delete params.phone;
    delete params.mobile;

    validMessages.push({ phoneNumber: phone, params });
  }

  if (validMessages.length === 0) {
    return res.status(400).json({
      error: "No valid rows found",
      validationErrors: errors,
    });
  }

  const campaignName =
    name ||
    `${template.name} — ${new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;

  // Create campaign + messages in a transaction
  const campaign = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.create({
      data: {
        name: campaignName,
        templateId,
        status: "draft",
        totalRecipients: validMessages.length,
        originalFileName,
      },
    });

    await tx.message.createMany({
      data: validMessages.map((m) => ({
        campaignId: c.id,
        phoneNumber: m.phoneNumber,
        params: m.params,
        status: "pending",
      })),
    });

    return c;
  });

  // Start execution in background
  executeCampaign(campaign.id).catch((err) =>
    console.error("Campaign execution error:", err)
  );

  res.json({
    campaign: { ...campaign, totalRecipients: validMessages.length },
    validCount: validMessages.length,
    errorCount: errors.length,
    validationErrors: errors,
  });
});

// GET /api/campaigns/:id/debug-payload — returns the Meta API payload + full curl for the first message
router.get("/:id/debug-payload", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: { template: true },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const message = await prisma.message.findFirst({
    where: { campaignId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  if (!message) return res.status(404).json({ error: "No messages found" });

  const config = await prisma.config.findFirst();
  const { decryptToken } = await import("../services/meta-api.js");
  const token = decryptToken(config?.metaAccessToken) || "TOKEN_NOT_SET";
  const phoneNumberId = config?.phoneNumberId || "PHONE_ID_NOT_SET";

  const rowData = { phone_number: message.phoneNumber, ...(message.params || {}) };
  const payload = buildMetaPayload(campaign.template, rowData, campaign.template.paramSchema);

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const curl = `curl -X POST "${url}" \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(payload)}'`;

  res.json({ payload, curl, url, phoneNumberId, to: message.phoneNumber });
});

// GET /api/campaigns/:id
router.get("/:id", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: { template: { select: { name: true, language: true, paramSchema: true } } },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  res.json(campaign);
});

// GET /api/campaigns/:id/messages
router.get("/:id/messages", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;
  const { status, phone } = req.query;

  const where = { campaignId: req.params.id };
  if (status && status !== "all") where.status = status;
  if (phone) where.phoneNumber = { contains: phone };

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "asc" },
    }),
    prisma.message.count({ where }),
  ]);

  res.json({ messages, total, page, pages: Math.ceil(total / limit) });
});

// GET /api/campaigns/:id/progress  — SSE
router.get("/:id/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const { id } = req.params;
  registerSseClient(id, res);

  // Heartbeat every 15s
  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch {}
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unregisterSseClient(id, res);
  });
});

// POST /api/campaigns/:id/cancel
router.post("/:id/cancel", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  await prisma.campaign.update({
    where: { id: req.params.id },
    data: { cancelRequested: true },
  });

  res.json({ success: true });
});

// GET /api/campaigns/:id/report — CSV download
router.get("/:id/report", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const messages = await prisma.message.findMany({
    where: { campaignId: req.params.id },
    orderBy: { createdAt: "asc" },
  });

  const csvRows = [
    ["Phone Number", "Status", "Meta Message ID", "Error Code", "Error Message", "Sent At"],
    ...messages.map((m) => [
      m.phoneNumber,
      m.status,
      m.metaMessageId || "",
      m.errorCode || "",
      m.errorMessage || "",
      m.sentAt ? m.sentAt.toISOString() : "",
    ]),
  ];

  const csv = csvRows
    .map((row) =>
      row.map((v) => {
        const s = String(v);
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    )
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="campaign_${campaign.id}_report.csv"`
  );
  res.send(csv);
});

// POST /api/campaigns/:id/retry-failed
router.post("/:id/retry-failed", async (req, res) => {
  const original = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: { template: true },
  });
  if (!original) return res.status(404).json({ error: "Campaign not found" });

  const failedMessages = await prisma.message.findMany({
    where: { campaignId: req.params.id, status: "failed" },
  });

  if (failedMessages.length === 0) {
    return res.status(400).json({ error: "No failed messages to retry" });
  }

  const retryName = `${original.name} (Retry)`;
  const campaign = await prisma.$transaction(async (tx) => {
    const c = await tx.campaign.create({
      data: {
        name: retryName,
        templateId: original.templateId,
        status: "draft",
        totalRecipients: failedMessages.length,
      },
    });

    await tx.message.createMany({
      data: failedMessages.map((m) => ({
        campaignId: c.id,
        phoneNumber: m.phoneNumber,
        params: m.params,
        status: "pending",
      })),
    });

    return c;
  });

  executeCampaign(campaign.id).catch(console.error);

  res.json({ campaign });
});

export default router;
