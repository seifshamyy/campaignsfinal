import React, { useMemo } from "react";
import { CheckCircle, AlertTriangle, XCircle, Download } from "lucide-react";
import { normalizePhone, validatePhone } from "../lib/phone.js";

export function validateAndMapRows(rows, schemaColumns, columnMapping, defaultCC = "966") {
  const valid = [];
  const warnings = [];
  const errors = [];
  const seenPhones = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const mapped = {};

    for (const col of schemaColumns) {
      const srcKey = columnMapping[col.key];
      mapped[col.key] = srcKey ? row[srcKey] : undefined;
    }

    // Phone normalization
    const rawPhone = mapped.phone_number;
    const phone = normalizePhone(rawPhone, defaultCC);
    const phoneVal = validatePhone(phone);

    const rowWarnings = [];
    const rowErrors = [];

    if (!phoneVal.valid) {
      rowErrors.push(`Phone: ${phoneVal.error}`);
    } else {
      if (String(rawPhone).replace(/\D/g, "") !== phone) {
        rowWarnings.push(`Phone normalized: ${rawPhone} → ${phone}`);
      }
      if (seenPhones.has(phone)) {
        rowErrors.push("Duplicate phone number");
      } else {
        seenPhones.add(phone);
      }
    }

    // Check required fields
    for (const col of schemaColumns) {
      if (col.required && col.key !== "phone_number" && !mapped[col.key]) {
        rowErrors.push(`Missing: ${col.label}`);
      }
    }

    const finalRow = { ...mapped, phone_number: phone || mapped.phone_number };

    if (rowErrors.length > 0) {
      errors.push({ rowNum: i + 1, row: finalRow, errors: rowErrors });
    } else if (rowWarnings.length > 0) {
      warnings.push({ rowNum: i + 1, row: finalRow, warnings: rowWarnings });
      valid.push(finalRow);
    } else {
      valid.push(finalRow);
    }
  }

  return { valid, warnings, errors };
}

export default function DataPreview({ rows, schemaColumns, columnMapping, defaultCC }) {
  const { valid, warnings, errors } = useMemo(
    () => validateAndMapRows(rows, schemaColumns, columnMapping, defaultCC),
    [rows, schemaColumns, columnMapping, defaultCC]
  );

  const preview = valid.slice(0, 5);
  const cols = schemaColumns.filter((c) => c.key !== "phone_number");
  const allCols = [{ key: "phone_number", label: "Phone Number" }, ...cols];

  function downloadErrors() {
    const csvRows = [
      ["Row", "Phone", "Errors"],
      ...errors.map((e) => [e.rowNum, e.row.phone_number || "", e.errors.join("; ")]),
    ];
    const csv = csvRows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "validation_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-700">{valid.length} Valid</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Ready to send</p>
        </div>
        <div className={`card p-3 ${warnings.length > 0 ? "border-amber-200" : ""}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-4 h-4 ${warnings.length > 0 ? "text-amber-500" : "text-gray-300"}`} />
            <span className={`text-sm font-medium ${warnings.length > 0 ? "text-amber-700" : "text-gray-400"}`}>
              {warnings.length} Warnings
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Phone normalized</p>
        </div>
        <div className={`card p-3 ${errors.length > 0 ? "border-red-200" : ""}`}>
          <div className="flex items-center gap-2">
            <XCircle className={`w-4 h-4 ${errors.length > 0 ? "text-red-500" : "text-gray-300"}`} />
            <span className={`text-sm font-medium ${errors.length > 0 ? "text-red-700" : "text-gray-400"}`}>
              {errors.length} Invalid
            </span>
          </div>
          {errors.length > 0 ? (
            <button
              onClick={downloadErrors}
              className="text-xs text-red-600 hover:underline mt-0.5 flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> Download errors
            </button>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">Will be skipped</p>
          )}
        </div>
      </div>

      {/* Data preview table */}
      {preview.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Preview (first {preview.length} valid rows)
          </h4>
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  {allCols.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-gray-500 font-medium whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    {allCols.map((c) => (
                      <td key={c.key} className="px-3 py-2 text-gray-700 max-w-[150px] truncate">
                        {row[c.key] || <span className="text-gray-300 italic">empty</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
