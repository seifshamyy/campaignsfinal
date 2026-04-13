import { Router } from "express";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../index.js";
import { requireAdmin } from "../middleware/auth.js";
import { uploadImage } from "../middleware/upload.js";
import { MetaApiClient, encryptToken, decryptToken } from "../services/meta-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

router.use(requireAdmin);

// GET /api/admin/config — account-level settings (branding + preferences)
router.get("/config", async (req, res) => {
  const account = await prisma.account.findUnique({ where: { id: req.accountId } });
  if (!account) return res.status(404).json({ error: "Account not found" });

  res.json({
    appName: account.appName,
    primaryColor: account.primaryColor,
    secondaryColor: account.secondaryColor,
    logoUrl: account.logoUrl,
    faviconUrl: account.faviconUrl,
    defaultCountryCode: account.defaultCountryCode,
    sendRatePerSecond: account.sendRatePerSecond,
    hasAppPassword: !!account.appPassword,
  });
});

// PUT /api/admin/config — update branding + preferences
router.put("/config", async (req, res) => {
  const { appName, primaryColor, secondaryColor, defaultCountryCode, sendRatePerSecond } = req.body;
  const update = {};
  if (appName !== undefined) update.appName = appName;
  if (primaryColor !== undefined) update.primaryColor = primaryColor;
  if (secondaryColor !== undefined) update.secondaryColor = secondaryColor;
  if (defaultCountryCode !== undefined) update.defaultCountryCode = defaultCountryCode;
  if (sendRatePerSecond !== undefined) update.sendRatePerSecond = parseInt(sendRatePerSecond);

  const account = await prisma.account.update({ where: { id: req.accountId }, data: update });
  res.json({ success: true, appName: account.appName });
});

// PUT /api/admin/password — change account admin password
router.put("/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const account = await prisma.account.findUnique({ where: { id: req.accountId } });
  const match = await bcrypt.compare(currentPassword, account.adminPassword);
  if (!match) return res.status(401).json({ error: "Current password is incorrect" });

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.account.update({ where: { id: req.accountId }, data: { adminPassword: hashed } });
  res.json({ success: true });
});

// PUT /api/admin/app-password
router.put("/app-password", async (req, res) => {
  const { password } = req.body;

  if (password === "" || password === null || password === undefined) {
    await prisma.account.update({ where: { id: req.accountId }, data: { appPassword: null } });
    return res.json({ success: true, enabled: false });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: "App password must be at least 4 characters" });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.account.update({ where: { id: req.accountId }, data: { appPassword: hashed } });
  res.json({ success: true, enabled: true });
});

// ── Phone Numbers ─────────────────────────────────────────────────────────────

// GET /api/admin/phone-numbers
router.get("/phone-numbers", async (req, res) => {
  const phones = await prisma.phoneNumber.findMany({
    where: { accountId: req.accountId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      displayNumber: true,
      verifiedName: true,
      phoneNumberId: true,
      wabaId: true,
      isActive: true,
      lastTestedAt: true,
      createdAt: true,
      // omit metaAccessToken — never send token to frontend
      _count: { select: { campaigns: true, templates: true } },
    },
  });

  // Indicate whether token is set without exposing it
  const result = await Promise.all(
    phones.map(async (p) => {
      const raw = await prisma.phoneNumber.findUnique({
        where: { id: p.id },
        select: { metaAccessToken: true },
      });
      return { ...p, hasToken: !!raw?.metaAccessToken };
    })
  );

  res.json(result);
});

// POST /api/admin/phone-numbers
router.post("/phone-numbers", async (req, res) => {
  const { label, metaAccessToken, phoneNumberId, wabaId } = req.body;
  if (!label) return res.status(400).json({ error: "label is required" });

  const data = {
    accountId: req.accountId,
    label,
    phoneNumberId: phoneNumberId || null,
    wabaId: wabaId || null,
  };
  if (metaAccessToken) data.metaAccessToken = encryptToken(metaAccessToken);

  const phone = await prisma.phoneNumber.create({ data });
  res.json({ success: true, id: phone.id, label: phone.label });
});

// PUT /api/admin/phone-numbers/:id
router.put("/phone-numbers/:id", async (req, res) => {
  const { label, metaAccessToken, phoneNumberId, wabaId } = req.body;

  const phone = await prisma.phoneNumber.findFirst({
    where: { id: req.params.id, accountId: req.accountId },
  });
  if (!phone) return res.status(404).json({ error: "Phone number not found" });

  const update = {};
  if (label !== undefined) update.label = label;
  if (phoneNumberId !== undefined) update.phoneNumberId = phoneNumberId;
  if (wabaId !== undefined) update.wabaId = wabaId;
  if (metaAccessToken && metaAccessToken !== "••••••••") {
    update.metaAccessToken = encryptToken(metaAccessToken);
  }

  await prisma.phoneNumber.update({ where: { id: req.params.id }, data: update });
  res.json({ success: true });
});

// DELETE /api/admin/phone-numbers/:id
router.delete("/phone-numbers/:id", async (req, res) => {
  const phone = await prisma.phoneNumber.findFirst({
    where: { id: req.params.id, accountId: req.accountId },
  });
  if (!phone) return res.status(404).json({ error: "Phone number not found" });

  const campaignCount = await prisma.campaign.count({ where: { phoneNumberId: req.params.id } });
  if (campaignCount > 0) {
    return res.status(409).json({
      error: `This number has ${campaignCount} campaigns. Delete campaigns first.`,
    });
  }

  // Delete templates first, then phone number
  await prisma.template.deleteMany({ where: { phoneNumberId: req.params.id } });
  await prisma.phoneNumber.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// POST /api/admin/phone-numbers/:id/test
router.post("/phone-numbers/:id/test", async (req, res) => {
  const phone = await prisma.phoneNumber.findFirst({
    where: { id: req.params.id, accountId: req.accountId },
  });
  if (!phone) return res.status(404).json({ error: "Phone number not found" });

  const token = decryptToken(phone.metaAccessToken);
  if (!token || !phone.phoneNumberId) {
    return res.status(400).json({ success: false, error: "Credentials not fully configured" });
  }

  try {
    const client = new MetaApiClient({
      accessToken: token,
      phoneNumberId: phone.phoneNumberId,
      wabaId: phone.wabaId,
    });
    const result = await client.testConnection();

    // Save verified info back to DB
    await prisma.phoneNumber.update({
      where: { id: req.params.id },
      data: {
        displayNumber: result.phoneNumber,
        verifiedName: result.accountName,
        lastTestedAt: new Date(),
      },
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── Branding uploads ──────────────────────────────────────────────────────────

const R2_WEBHOOK = "https://primary-production-9e01d.up.railway.app/webhook/be3bfcdd-adb8-4fec-b2cb-91565ce8a23c";

async function uploadToR2(buffer, originalName, mimetype) {
  const filename = originalName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
  const form = new FormData();
  form.append("filename", filename);
  form.append("file", new File([buffer], filename, { type: mimetype }));
  const resp = await fetch(R2_WEBHOOK, { method: "POST", body: form });
  const raw = await resp.text();
  if (!resp.ok) throw new Error(`R2 webhook error ${resp.status}: ${raw}`);
  const data = JSON.parse(raw);
  if (!data.link) throw new Error(`R2 webhook returned no link. Got: ${raw}`);
  return data.link;
}

router.post("/upload-logo", uploadImage.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const url = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    await prisma.account.update({ where: { id: req.accountId }, data: { logoUrl: url } });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

router.post("/upload-favicon", uploadImage.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const url = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    await prisma.account.update({ where: { id: req.accountId }, data: { faviconUrl: url } });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

router.delete("/clear-branding", async (_req, res) => {
  await prisma.account.update({
    where: { id: _req.accountId },
    data: { logoUrl: null, faviconUrl: null },
  });
  res.json({ success: true });
});

// ── Stats + History ───────────────────────────────────────────────────────────

router.get("/stats", async (req, res) => {
  const [totalCampaigns, totalMessages] = await Promise.all([
    prisma.campaign.count({ where: { accountId: req.accountId } }),
    prisma.message.count({ where: { campaign: { accountId: req.accountId } } }),
  ]);
  res.json({ totalCampaigns, totalMessages });
});

router.delete("/clear-history", async (req, res) => {
  const campaigns = await prisma.campaign.findMany({
    where: { accountId: req.accountId },
    select: { id: true },
  });
  const ids = campaigns.map((c) => c.id);
  await prisma.message.deleteMany({ where: { campaignId: { in: ids } } });
  await prisma.campaign.deleteMany({ where: { accountId: req.accountId } });
  res.json({ success: true });
});

export default router;
