import React from "react";
import { CheckCircle, AlertCircle } from "lucide-react";

/**
 * Auto-detect best column mapping using fuzzy matching.
 */
export function autoDetectMapping(fileColumns, schemaColumns) {
  const mapping = {};
  const lc = (s) => s.toLowerCase().replace(/[\s_-]/g, "");

  for (const col of schemaColumns) {
    const key = lc(col.key);
    const label = lc(col.label);

    // Exact or fuzzy match
    const match = fileColumns.find((fc) => {
      const f = lc(fc);
      return (
        f === key ||
        f === label ||
        f.includes(key) ||
        key.includes(f) ||
        f.includes(label) ||
        label.includes(f)
      );
    });

    if (match) {
      mapping[col.key] = match;
    }
  }

  return mapping;
}

export default function ColumnMapper({ schemaColumns, fileColumns, mapping, onChange }) {
  const requiredCols = schemaColumns.filter((c) => c.required);
  const allMapped = requiredCols.every((c) => mapping[c.key]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Map Columns</h3>
        {allMapped ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="w-3.5 h-3.5" /> All required columns mapped
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle className="w-3.5 h-3.5" /> Some required columns not mapped
          </span>
        )}
      </div>

      <div className="card divide-y divide-gray-50">
        {schemaColumns.map((col) => {
          const mapped = mapping[col.key];
          const isMissing = col.required && !mapped;

          return (
            <div key={col.key} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{col.label}</span>
                  {col.required ? (
                    <span className="badge bg-red-50 text-red-600 text-xs">required</span>
                  ) : (
                    <span className="badge bg-gray-100 text-gray-500 text-xs">optional</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">{col.description}</p>
              </div>
              <div className="w-48">
                <select
                  value={mapping[col.key] || ""}
                  onChange={(e) =>
                    onChange({ ...mapping, [col.key]: e.target.value || undefined })
                  }
                  className={`input text-xs py-1.5 ${
                    isMissing ? "border-amber-300 focus:ring-amber-400" : ""
                  }`}
                >
                  <option value="">— not mapped —</option>
                  {fileColumns.map((fc) => (
                    <option key={fc} value={fc}>
                      {fc}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
