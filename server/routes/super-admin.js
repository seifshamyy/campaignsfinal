import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { prisma } from "../index.js";
import { requireSuperAdmin, signToken } from "../middleware/auth.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts. Try again in a minute." },
});

// POST /api/super-admin/login
router.post("/login", loginLimiter, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password required" });

  const superAdmin = await prisma.superAdmin.findFirst();
  if (!superAdmin) return res.status(500).json({ error: "Super admin not configured" });

  const match = await bcrypt.compare(password, superAdmin.password);
  if (!match) return res.status(401).json({ error: "Incorrect password" });

  const token = signToken({ isSuperAdmin: true }, "12h");
  res.cookie("superAdminToken", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ token });
});

// POST /api/super-admin/logout
router.post("/logout", (req, res) => {
  res.clearCookie("superAdminToken");
  res.json({ success: true });
});

// GET /api/super-admin/me
router.get("/me", requireSuperAdmin, (req, res) => {
  res.json({ isAuthenticated: true, isSuperAdmin: true });
});

// All routes below require super admin auth
router.use(requireSuperAdmin);

// GET /api/super-admin/stats — global stats across all accounts
router.get("/stats", async (req, res) => {
  const [totalAccounts, totalCampaigns, totalMessages, totalPhoneNumbers] = await Promise.all([
    prisma.account.count(),
    prisma.campaign.count(),
    prisma.message.count(),
    prisma.phoneNumber.count(),
  ]);
  res.json({ totalAccounts, totalCampaigns, totalMessages, totalPhoneNumbers });
});

// GET /api/super-admin/accounts
router.get("/accounts", async (req, res) => {
  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { campaigns: true, phoneNumbers: true },
      },
    },
  });
  res.json(accounts);
});

// POST /api/super-admin/accounts — create new account
router.post("/accounts", async (req, res) => {
  const { slug, name, adminPassword, appPassword } = req.body;

  if (!slug || !name || !adminPassword) {
    return res.status(400).json({ error: "slug, name, and adminPassword are required" });
  }

  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const existing = await prisma.account.findFirst({ where: { slug: cleanSlug } });
  if (existing) return res.status(409).json({ error: "An account with this slug already exists" });

  if (adminPassword.length < 6) {
    return res.status(400).json({ error: "Admin password must be at least 6 characters" });
  }

  const hashedAdmin = await bcrypt.hash(adminPassword, 12);
  const hashedApp = appPassword ? await bcrypt.hash(appPassword, 12) : null;

  const account = await prisma.account.create({
    data: {
      slug: cleanSlug,
      name,
      adminPassword: hashedAdmin,
      appPassword: hashedApp,
    },
  });

  res.json({ success: true, account: { id: account.id, slug: account.slug, name: account.name } });
});

// GET /api/super-admin/accounts/:id
router.get("/accounts/:id", async (req, res) => {
  const account = await prisma.account.findUnique({
    where: { id: req.params.id },
    include: {
      phoneNumbers: { select: { id: true, label: true, displayNumber: true, isActive: true } },
      _count: { select: { campaigns: true } },
    },
  });
  if (!account) return res.status(404).json({ error: "Account not found" });
  res.json(account);
});

// PUT /api/super-admin/accounts/:id
router.put("/accounts/:id", async (req, res) => {
  const { name, adminPassword, isActive } = req.body;
  const update = {};

  if (name !== undefined) update.name = name;
  if (isActive !== undefined) update.isActive = isActive;
  if (adminPassword) {
    if (adminPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    update.adminPassword = await bcrypt.hash(adminPassword, 12);
  }

  const account = await prisma.account.update({
    where: { id: req.params.id },
    data: update,
  });

  res.json({ success: true, account: { id: account.id, slug: account.slug, name: account.name, isActive: account.isActive } });
});

// DELETE /api/super-admin/accounts/:id
router.delete("/accounts/:id", async (req, res) => {
  const campaignCount = await prisma.campaign.count({
    where: { accountId: req.params.id },
  });

  if (campaignCount > 0 && !req.query.force) {
    return res.status(409).json({
      error: `Account has ${campaignCount} campaigns. Pass ?force=1 to delete anyway.`,
      campaignCount,
    });
  }

  // Cascade: messages → campaigns → templates → phone_numbers → account
  await prisma.$transaction(async (tx) => {
    const campaigns = await tx.campaign.findMany({
      where: { accountId: req.params.id },
      select: { id: true },
    });
    const campaignIds = campaigns.map((c) => c.id);
    await tx.message.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await tx.campaign.deleteMany({ where: { accountId: req.params.id } });

    const phones = await tx.phoneNumber.findMany({
      where: { accountId: req.params.id },
      select: { id: true },
    });
    const phoneIds = phones.map((p) => p.id);
    await tx.template.deleteMany({ where: { phoneNumberId: { in: phoneIds } } });
    await tx.phoneNumber.deleteMany({ where: { accountId: req.params.id } });

    await tx.account.delete({ where: { id: req.params.id } });
  });

  res.json({ success: true });
});

// PUT /api/super-admin/password — change super admin password
router.put("/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }

  const superAdmin = await prisma.superAdmin.findFirst();
  const match = await bcrypt.compare(currentPassword, superAdmin.password);
  if (!match) return res.status(401).json({ error: "Current password is incorrect" });

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.superAdmin.update({ where: { id: 1 }, data: { password: hashed } });
  res.json({ success: true });
});

export default router;
