import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { prisma } from "../index.js";
import { signToken, requireAuth } from "../middleware/auth.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts. Try again in a minute." },
});

// POST /api/auth/login — account user login
router.post("/login", loginLimiter, async (req, res) => {
  const { slug, password } = req.body;

  if (!slug) return res.status(400).json({ error: "Account slug is required" });

  const account = await prisma.account.findFirst({
    where: { slug: slug.trim().toLowerCase(), isActive: true },
  });
  if (!account) return res.status(401).json({ error: "Account not found" });

  // If no appPassword is set, login freely
  if (!account.appPassword) {
    const token = signToken({ accountId: account.id, isAdmin: false });
    res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 });
    return res.json({ token, accountSlug: account.slug });
  }

  const match = await bcrypt.compare(password || "", account.appPassword);
  if (!match) return res.status(401).json({ error: "Incorrect password" });

  const token = signToken({ accountId: account.id, isAdmin: false });
  res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 });
  res.json({ token, accountSlug: account.slug });
});

// POST /api/auth/admin-login — account admin login
router.post("/admin-login", loginLimiter, async (req, res) => {
  const { slug, password } = req.body;

  if (!slug) return res.status(400).json({ error: "Account slug is required" });
  if (!password) return res.status(400).json({ error: "Password required" });

  const account = await prisma.account.findFirst({
    where: { slug: slug.trim().toLowerCase(), isActive: true },
  });
  if (!account) return res.status(401).json({ error: "Account not found" });

  const match = await bcrypt.compare(password, account.adminPassword);
  if (!match) return res.status(401).json({ error: "Incorrect admin password" });

  const token = signToken({ accountId: account.id, isAdmin: true });
  res.cookie("token", token, { httpOnly: true, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 });
  res.cookie("adminToken", token, { httpOnly: true, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 });
  res.json({ token, isAdmin: true, accountSlug: account.slug });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  const account = await prisma.account.findUnique({
    where: { id: req.accountId },
    select: { slug: true, appName: true },
  });
  res.json({
    isAuthenticated: true,
    isAdmin: req.user.isAdmin || false,
    accountId: req.accountId,
    accountSlug: account?.slug,
    accountName: account?.appName,
  });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.clearCookie("adminToken");
  res.json({ success: true });
});

// GET /api/auth/config-public?slug=<account-slug>
// Returns non-sensitive branding for the login page
router.get("/config-public", async (req, res) => {
  const slug = req.query.slug?.trim().toLowerCase();

  let account = null;
  if (slug) {
    account = await prisma.account.findFirst({
      where: { slug, isActive: true },
    });
  }

  // Fall back to first account if no slug given (supports single-tenant use)
  if (!account && !slug) {
    account = await prisma.account.findFirst({ where: { isActive: true } });
  }

  res.json({
    appName: account?.appName || "Campaign Manager",
    primaryColor: account?.primaryColor || "#1e40af",
    secondaryColor: account?.secondaryColor || "#7c3aed",
    logoUrl: account?.logoUrl || null,
    faviconUrl: account?.faviconUrl || null,
    requiresPassword: !!account?.appPassword,
    accountFound: !!account,
  });
});
