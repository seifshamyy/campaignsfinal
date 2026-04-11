/**
 * Generate a downloadable example CSV for a given paramSchema.
 *
 * Format:
 *   Row 1: Human-readable labels  (Phone Number, Body Variable 1, ...)
 *   Row 2: Machine-readable keys  (phone_number, body_1, ...)
 *   Rows 3-5: Example data rows
 */
export function generateExampleCsv(paramSchema) {
  const cols = paramSchema.columns;

  const labels = cols.map((c) => c.label);
  const keys = cols.map((c) => c.key);

  // Build 3 example rows with slight variation
  const exampleRows = [0, 1, 2].map((i) =>
    cols.map((col) => {
      if (col.key === "phone_number") {
        const nums = ["966501234567", "966501234568", "966501234569"];
        return nums[i];
      }
      // Vary example values slightly
      const base = col.example || `value_${i + 1}`;
      if (i === 0) return base;
      if (typeof base === "string" && base.match(/\d+$/)) {
        return base.replace(/(\d+)$/, (n) => String(parseInt(n) + i));
      }
      return `${base}_${i + 1}`;
    })
  );

  const rows = [labels, keys, ...exampleRows];
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(val) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
