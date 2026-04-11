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

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password required" });

  const config = await prisma.config.findFirst();
  if (!config) return res.status(500).json({ error: "App not configured" });

  // If no appPassword is set, any password works (open access)
  if (!config.appPassword) {
    const token = signToken({ isAdmin: false });
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });
    return res.json({ token });
  }

  const match = await bcrypt.compare(password, config.appPassword);
  if (!match) return res.status(401).json({ error: "Incorrect password" });

  const token = signToken({ isAdmin: false });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ token });
});

// POST /api/auth/admin-login
router.post("/admin-login", loginLimiter, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password required" });

  const config = await prisma.config.findFirst();
  if (!config) return res.status(500).json({ error: "App not configured" });

  const match = await bcrypt.compare(password, config.adminPassword);
  if (!match) return res.status(401).json({ error: "Incorrect admin password" });

  const token = signToken({ isAdmin: true });
  // Set both cookies so requireAuth and requireAdmin both work
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.cookie("adminToken", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.json({ token, isAdmin: true });
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => {
  res.json({ isAuthenticated: true, isAdmin: req.user.isAdmin || false });
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.clearCookie("adminToken");
  res.json({ success: true });
});

// GET /api/auth/config-public
// Returns non-sensitive config for the login page (appName, branding)
router.get("/config-public", async (req, res) => {
  const config = await prisma.config.findFirst();
  res.json({
    appName: config?.appName || "Campaign Manager",
    primaryColor: config?.primaryColor || "#1e40af",
    secondaryColor: config?.secondaryColor || "#7c3aed",
    logoUrl: config?.logoUrl || null,
    faviconUrl: config?.faviconUrl || null,
    requiresPassword: !!config?.appPassword,
  });
});

export default router;
