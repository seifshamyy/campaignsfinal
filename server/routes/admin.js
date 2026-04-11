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

// All admin routes require admin auth
router.use(requireAdmin);

// GET /api/admin/config
router.get("/config", async (req, res) => {
  const config = await prisma.config.findFirst();
  if (!config) return res.status(404).json({ error: "Config not found" });

  res.json({
    appName: config.appName,
    primaryColor: config.primaryColor,
    secondaryColor: config.secondaryColor,
    logoUrl: config.logoUrl,
    faviconUrl: config.faviconUrl,
    defaultCountryCode: config.defaultCountryCode,
    sendRatePerSecond: config.sendRatePerSecond,
    metaAccessToken: config.metaAccessToken ? "••••••••" : null,
    phoneNumberId: config.phoneNumberId,
    wabaId: config.wabaId,
    hasAppPassword: !!config.appPassword,
  });
});

// PUT /api/admin/config
router.put("/config", async (req, res) => {
  const {
    appName,
    primaryColor,
    secondaryColor,
    defaultCountryCode,
    sendRatePerSecond,
    phoneNumberId,
    wabaId,
    metaAccessToken,
  } = req.body;

  const current = await prisma.config.findFirst();
  const updateData = {};
  if (appName !== undefined) updateData.appName = appName;
  if (primaryColor !== undefined) updateData.primaryColor = primaryColor;
  if (secondaryColor !== undefined) updateData.secondaryColor = secondaryColor;
  if (defaultCountryCode !== undefined) updateData.defaultCountryCode = defaultCountryCode;
  if (sendRatePerSecond !== undefined) updateData.sendRatePerSecond = parseInt(sendRatePerSecond);
  if (phoneNumberId !== undefined) updateData.phoneNumberId = phoneNumberId;
  if (wabaId !== undefined) updateData.wabaId = wabaId;

  const credentialsChanged =
    (metaAccessToken && metaAccessToken !== "••••••••") ||
    (wabaId !== undefined && wabaId !== current?.wabaId);

  if (metaAccessToken && metaAccessToken !== "••••••••") {
    updateData.metaAccessToken = encryptToken(metaAccessToken);
  }

  const config = await prisma.config.update({
    where: { id: 1 },
    data: updateData,
  });

  // Clear cached templates when credentials change — they belong to a different account.
  // Must delete in FK order: messages → campaigns → templates
  if (credentialsChanged) {
    await prisma.message.deleteMany();
    await prisma.campaign.deleteMany();
    await prisma.template.deleteMany();
  }

  res.json({ success: true, appName: config.appName, templatesCleared: credentialsChanged });
});

// POST /api/admin/test-connection
router.post("/test-connection", async (req, res) => {
  const config = await prisma.config.findFirst();
  const token = decryptToken(config?.metaAccessToken);

  if (!token || !config?.phoneNumberId) {
    return res.status(400).json({ success: false, error: "Meta credentials not configured" });
  }

  try {
    const client = new MetaApiClient({
      accessToken: token,
      phoneNumberId: config.phoneNumberId,
      wabaId: config.wabaId,
    });
    const result = await client.testConnection();
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /api/admin/password
router.put("/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const config = await prisma.config.findFirst();
  const match = await bcrypt.compare(currentPassword, config.adminPassword);
  if (!match) return res.status(401).json({ error: "Current password is incorrect" });

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.config.update({ where: { id: 1 }, data: { adminPassword: hashed } });
  res.json({ success: true });
});

// PUT /api/admin/app-password
router.put("/app-password", async (req, res) => {
  const { password } = req.body;

  if (password === "" || password === null || password === undefined) {
    // Disable app password
    await prisma.config.update({ where: { id: 1 }, data: { appPassword: null } });
    return res.json({ success: true, enabled: false });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: "App password must be at least 4 characters" });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.config.update({ where: { id: 1 }, data: { appPassword: hashed } });
  res.json({ success: true, enabled: true });
});

const R2_WEBHOOK = "https://primary-production-9e01d.up.railway.app/webhook/be3bfcdd-adb8-4fec-b2cb-91565ce8a23c";

async function uploadToR2(buffer, originalName, mimetype) {
  const filename = originalName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
  const url = `${R2_WEBHOOK}?filename=${encodeURIComponent(filename)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": mimetype, "X-Filename": filename },
    body: buffer,
  });
  const raw = await resp.text();
  console.log("[uploadToR2] status:", resp.status, "body:", raw);
  if (!resp.ok) throw new Error(`R2 webhook error ${resp.status}: ${raw}`);
  const data = JSON.parse(raw);
  if (!data.link) throw new Error(`R2 webhook returned no link. Got: ${raw}`);
  return data.link;
}

// POST /api/admin/upload-logo — uploads to R2 via webhook, stores URL in DB
router.post("/upload-logo", uploadImage.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const url = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    await prisma.config.update({ where: { id: 1 }, data: { logoUrl: url } });
    res.json({ url });
  } catch (err) {
    console.error("[upload-logo] error:", err.message);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// POST /api/admin/upload-favicon — uploads to R2 via webhook, stores URL in DB
router.post("/upload-favicon", uploadImage.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const url = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    await prisma.config.update({ where: { id: 1 }, data: { faviconUrl: url } });
    res.json({ url });
  } catch (err) {
    console.error("[upload-favicon] error:", err.message);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// DELETE /api/admin/clear-branding — wipes broken logo/favicon URLs from DB
router.delete("/clear-branding", async (_req, res) => {
  await prisma.config.update({ where: { id: 1 }, data: { logoUrl: null, faviconUrl: null } });
  res.json({ success: true });
});

// GET /api/admin/stats
router.get("/stats", async (req, res) => {
  const [totalCampaigns, totalMessages] = await Promise.all([
    prisma.campaign.count(),
    prisma.message.count(),
  ]);
  res.json({ totalCampaigns, totalMessages });
});

// DELETE /api/admin/clear-history
router.delete("/clear-history", async (req, res) => {
  await prisma.message.deleteMany();
  await prisma.campaign.deleteMany();
  res.json({ success: true });
});

export default router;
