import React from "react";
import { Image, Video, FileText, Type, Globe, Zap, Link, Copy, MessageSquare } from "lucide-react";

const CATEGORY_COLORS = {
  MARKETING: "bg-purple-100 text-purple-700",
  UTILITY: "bg-blue-100 text-blue-700",
  AUTHENTICATION: "bg-orange-100 text-orange-700",
};

const HEADER_ICONS = {
  IMAGE: Image,
  VIDEO: Video,
  DOCUMENT: FileText,
  TEXT: Type,
};

const BUTTON_LABELS = {
  QUICK_REPLY: "Quick Reply",
  URL: "URL Button",
  FLOW: "Flow",
  COPY_CODE: "Copy Code",
  PHONE_NUMBER: "Call",
};

export default function TemplateCard({ template, selected, onClick }) {
  const paramCount = template.paramSchema?.columns?.filter(
    (c) => c.key !== "phone_number"
  ).length || 0;

  const HeaderIcon = template.headerType ? HEADER_ICONS[template.headerType] : null;
  const isArabic = template.language === "ar";

  return (
    <button
      onClick={onClick}
      className={`card w-full text-left p-4 transition-all hover:shadow-md hover:border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        selected ? "border-blue-500 bg-blue-50/40 shadow-md" : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate text-sm">{template.name}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {HeaderIcon && (
            <span title={`${template.headerType} header`} className="text-gray-400">
              <HeaderIcon className="w-3.5 h-3.5" />
            </span>
          )}
          <span className="badge bg-gray-100 text-gray-600 text-xs">{template.language}</span>
          <span className={`badge text-xs ${CATEGORY_COLORS[template.category] || "bg-gray-100 text-gray-600"}`}>
            {template.category}
          </span>
        </div>
      </div>

      {/* Body preview */}
      {template.bodyText && (
        <p
          className={`text-xs text-gray-600 leading-relaxed line-clamp-3 mb-3 ${
            isArabic ? "rtl-text" : ""
          }`}
        >
          {template.bodyText.slice(0, 120)}
          {template.bodyText.length > 120 ? "…" : ""}
        </p>
      )}

      {/* Footer row */}
      <div className="flex items-center gap-2 flex-wrap">
        {paramCount > 0 && (
          <span className="badge bg-amber-50 text-amber-700 text-xs">
            {paramCount} variable{paramCount !== 1 ? "s" : ""}
          </span>
        )}
        {template.buttonTypes?.map((bt) => (
          <span key={bt} className="badge bg-gray-100 text-gray-500 text-xs">
            {BUTTON_LABELS[bt] || bt}
          </span>
        ))}
      </div>

      {selected && (
        <div className="mt-3 text-xs font-medium text-blue-700 flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> Selected
        </div>
      )}
    </button>
  );
}
