import { Router } from "express";
import { prisma } from "../index.js";
import { requireAuth } from "../middleware/auth.js";
import { MetaApiClient, decryptToken } from "../services/meta-api.js";
import { parseTemplateToSchema, extractTemplateFields } from "../services/template-parser.js";
import { generateExampleCsv } from "../services/csv-generator.js";

const router = Router();
router.use(requireAuth);

// GET /api/templates?phoneNumberId=xxx
// Returns all templates for the account (or filtered by phone number)
router.get("/", async (req, res) => {
  const { phoneNumberId } = req.query;

  if (phoneNumberId) {
    // Verify this phone number belongs to the current account
    const phone = await prisma.phoneNumber.findFirst({
      where: { id: phoneNumberId, accountId: req.accountId },
    });
    if (!phone) return res.status(404).json({ error: "Phone number not found" });

    const templates = await prisma.template.findMany({
      where: { phoneNumberId, status: "APPROVED" },
      orderBy: { name: "asc" },
    });
    return res.json(templates);
  }

  // No filter: return all approved templates across all phone numbers for this account
  const phoneNumbers = await prisma.phoneNumber.findMany({
    where: { accountId: req.accountId },
    select: { id: true },
  });
  const phoneIds = phoneNumbers.map((p) => p.id);

  const templates = await prisma.template.findMany({
    where: { phoneNumberId: { in: phoneIds }, status: "APPROVED" },
    orderBy: { name: "asc" },
    include: { phoneNumber: { select: { id: true, label: true, displayNumber: true } } },
  });
  return res.json(templates);
});

// GET /api/templates/:id
router.get("/:id", async (req, res) => {
  const template = await prisma.template.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: "Template not found" });

  // Verify it belongs to the current account
  const phone = await prisma.phoneNumber.findFirst({
    where: { id: template.phoneNumberId, accountId: req.accountId },
  });
  if (!phone) return res.status(404).json({ error: "Template not found" });

  res.json(template);
});

// POST /api/templates/sync — body: { phoneNumberId }
router.post("/sync", async (req, res) => {
  const { phoneNumberId } = req.body;
  if (!phoneNumberId) {
    return res.status(400).json({ error: "phoneNumberId is required" });
  }

  const phone = await prisma.phoneNumber.findFirst({
    where: { id: phoneNumberId, accountId: req.accountId },
  });
  if (!phone) return res.status(404).json({ error: "Phone number not found" });

  const token = decryptToken(phone.metaAccessToken);
  if (!token || !phone.wabaId) {
    return res.status(400).json({
      error: "Meta credentials not configured for this phone number.",
    });
  }

  try {
    const client = new MetaApiClient({
      accessToken: token,
      phoneNumberId: phone.phoneNumberId,
      wabaId: phone.wabaId,
    });

    const metaTemplates = await client.fetchTemplates();
    const approved = metaTemplates.filter((t) => t.status === "APPROVED");

    let added = 0;
    let updated = 0;

    for (const t of approved) {
      const components = t.components || [];
      const paramSchema = parseTemplateToSchema(components);
      const fields = extractTemplateFields(components);

      const data = {
        phoneNumberId,
        metaTemplateId: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components,
        paramSchema,
        exampleCsvHeaders: paramSchema.columns.map((c) => c.key),
        bodyText: fields.bodyText,
        headerType: fields.headerType,
        headerText: fields.headerText,
        footerText: fields.footerText,
        buttonTypes: fields.buttonTypes,
        lastSyncedAt: new Date(),
      };

      const existing = await prisma.template.findUnique({
        where: { phoneNumberId_name_language: { phoneNumberId, name: t.name, language: t.language } },
      });

      if (existing) {
        await prisma.template.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.template.create({ data });
        added++;
      }
    }

    // Remove templates for this phone number that are no longer in Meta
    const metaKeys = new Set(approved.map((t) => `${t.name}:${t.language}`));
    const local = await prisma.template.findMany({
      where: { phoneNumberId },
      select: { id: true, name: true, language: true },
    });
    let removed = 0;
    for (const t of local) {
      if (!metaKeys.has(`${t.name}:${t.language}`)) {
        await prisma.template.delete({ where: { id: t.id } }).catch(() => {});
        removed++;
      }
    }

    res.json({ synced: approved.length, added, updated, removed });
  } catch (err) {
    console.error("Template sync error:", err);
    res.status(502).json({ error: err.message || "Failed to sync templates from Meta" });
  }
});

// GET /api/templates/:id/example-csv
router.get("/:id/example-csv", async (req, res) => {
  const template = await prisma.template.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: "Template not found" });

  const csv = generateExampleCsv(template.paramSchema);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${template.name}_example.csv"`);
  res.send(csv);
});

export default router;
