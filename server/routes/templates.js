import { Router } from "express";
import { prisma } from "../index.js";
import { requireAuth } from "../middleware/auth.js";
import { MetaApiClient, decryptToken } from "../services/meta-api.js";
import { parseTemplateToSchema, extractTemplateFields } from "../services/template-parser.js";
import { generateExampleCsv } from "../services/csv-generator.js";

const router = Router();
router.use(requireAuth);

// GET /api/templates
router.get("/", async (req, res) => {
  const templates = await prisma.template.findMany({
    where: { status: "APPROVED" },
    orderBy: { name: "asc" },
  });
  res.json(templates);
});

// GET /api/templates/:id
router.get("/:id", async (req, res) => {
  const template = await prisma.template.findUnique({
    where: { id: req.params.id },
  });
  if (!template) return res.status(404).json({ error: "Template not found" });
  res.json(template);
});

// POST /api/templates/sync
router.post("/sync", async (req, res) => {
  const config = await prisma.config.findFirst();
  const token = decryptToken(config?.metaAccessToken);

  if (!token || !config?.wabaId) {
    return res.status(400).json({ error: "Meta credentials not configured. Go to Admin panel." });
  }

  try {
    const client = new MetaApiClient({
      accessToken: token,
      phoneNumberId: config.phoneNumberId,
      wabaId: config.wabaId,
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
        metaTemplateId: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: components,
        paramSchema: paramSchema,
        exampleCsvHeaders: paramSchema.columns.map((c) => c.key),
        bodyText: fields.bodyText,
        headerType: fields.headerType,
        headerText: fields.headerText,
        footerText: fields.footerText,
        buttonTypes: fields.buttonTypes,
        lastSyncedAt: new Date(),
      };

      const existing = await prisma.template.findUnique({
        where: { name_language: { name: t.name, language: t.language } },
      });

      if (existing) {
        await prisma.template.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.template.create({ data });
        added++;
      }
    }

    // Remove templates no longer in Meta
    const metaNames = new Set(approved.map((t) => `${t.name}:${t.language}`));
    const local = await prisma.template.findMany({ select: { id: true, name: true, language: true } });
    const toRemove = local.filter((t) => !metaNames.has(`${t.name}:${t.language}`));
    let removed = 0;
    for (const t of toRemove) {
      await prisma.template.delete({ where: { id: t.id } }).catch(() => {});
      removed++;
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
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${template.name}_example.csv"`
  );
  res.send(csv);
});

export default router;
