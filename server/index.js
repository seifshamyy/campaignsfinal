import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import templateRoutes from "./routes/templates.js";
import campaignRoutes from "./routes/campaigns.js";
import uploadRoutes from "./routes/uploads.js";
import superAdminRoutes from "./routes/super-admin.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

// Allow iframe embedding from Chatwoot
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");
  next();
});

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ── API Routes ──────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/super-admin", superAdminRoutes);

// ── Static client ───────────────────────────────────────────────────────────
const clientDist = path.join(__dirname, "../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

// ── Seed: ensure SuperAdmin exists ──────────────────────────────────────────
async function seed() {
  const superAdmin = await prisma.superAdmin.findFirst();
  if (!superAdmin) {
    const password = process.env.SUPER_ADMIN_PASSWORD || "superadmin";
    const hashed = await bcrypt.hash(password, 12);
    await prisma.superAdmin.create({ data: { id: 1, password: hashed } });
    console.log(`[seed] Super admin created.`);
    console.log(`[seed] ⚠️  Default password: "${password}" — CHANGE THIS at /super-admin`);
  }
}

// ── Start ───────────────────────────────────────────────────────────────────
seed()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`WhatsApp Campaign Manager running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to seed:", err);
    process.exit(1);
  });

export { prisma };
