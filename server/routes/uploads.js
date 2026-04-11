import { Router } from "express";
import fs from "fs";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { requireAuth } from "../middleware/auth.js";
import { uploadFile } from "../middleware/upload.js";

const router = Router();
router.use(requireAuth);

// POST /api/upload/parse
router.post("/parse", uploadFile.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const ext = req.file.originalname.split(".").pop().toLowerCase();

  try {
    let rows = [];

    if (ext === "csv") {
      const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""); // Strip BOM
      const result = Papa.parse(content, { header: true, skipEmptyLines: true });
      rows = result.data;
    } else {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error("No worksheets found in file");

      const headers = [];
      sheet.getRow(1).eachCell((cell, col) => {
        headers[col - 1] = String(cell.value ?? `column_${col}`);
      });

      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // Skip header
        const obj = {};
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          const header = headers[col - 1];
          if (!header) return;
          let val = cell.value;
          if (val && typeof val === "object" && "result" in val) val = val.result;
          if (val && typeof val === "object" && "text" in val) val = val.text;
          obj[header] = val ?? "";
        });
        if (Object.values(obj).some((v) => v !== "")) rows.push(obj);
      });
    }

    fs.unlinkSync(filePath); // Delete temp file immediately

    if (rows.length === 0) {
      return res.status(400).json({ error: "File is empty" });
    }

    const columns = Object.keys(rows[0]);
    const preview = rows.slice(0, 10);
    const warnings = [];

    // Check for large files
    if (rows.length > 10000) {
      warnings.push(`Large file: ${rows.length} rows. Estimated send time: ~${Math.round(rows.length / 10 / 60)} minutes at 10 msg/sec.`);
    }
    if (rows.length > 50000) {
      warnings.push("Very large file (>50k rows). Meta may throttle your account. Consider sending in smaller batches.");
    }

    res.json({
      columns,
      rowCount: rows.length,
      preview,
      rows, // full dataset returned to client for processing
      warnings,
    });
  } catch (err) {
    // Clean up on error
    try { fs.unlinkSync(filePath); } catch {}
    console.error("Parse error:", err);
    res.status(400).json({ error: `Failed to parse file: ${err.message}` });
  }
});

export default router;
