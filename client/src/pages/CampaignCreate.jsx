import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronLeft, Send, AlertTriangle, Copy, Check } from "lucide-react";
import { api } from "../lib/api.js";
import TemplatePicker from "../components/TemplatePicker.jsx";
import FileUploader from "../components/FileUploader.jsx";
import ExampleCSV from "../components/ExampleCSV.jsx";
import ColumnMapper, { autoDetectMapping } from "../components/ColumnMapper.jsx";
import DataPreview, { validateAndMapRows } from "../components/DataPreview.jsx";
import SendProgress from "../components/SendProgress.jsx";

const STEPS = ["Choose Template", "Upload Contacts", "Review & Send"];

/** Mirror of server/services/template-parser.js buildMetaPayload — kept in sync */
function buildPayload(template, rowData) {
  const paramSchema = template.paramSchema;
  const components = [];

  const headerParams = (paramSchema.columns || []).filter((c) => c.componentType === "header");
  const bodyParams   = (paramSchema.columns || []).filter((c) => c.componentType === "body");
  const buttonParams = (paramSchema.columns || []).filter((c) => c.componentType === "button");

  if (headerParams.length > 0) {
    const first = headerParams[0];
    if (first.mediaType) {
      const mediaUrl = rowData[first.key];
      if (mediaUrl) {
        const mediaObj = { link: mediaUrl };
        if (first.mediaType === "document") {
          const fnCol = headerParams.find((c) => c.isFilename);
          if (fnCol && rowData[fnCol.key]) mediaObj.filename = rowData[fnCol.key];
        }
        components.push({ type: "header", parameters: [{ type: first.mediaType, [first.mediaType]: mediaObj }] });
      }
    } else {
      components.push({
        type: "header",
        parameters: headerParams
          .filter((c) => !c.isFilename)
          .sort((a, b) => a.paramIndex - b.paramIndex)
          .map((col) => ({ type: "text", text: String(rowData[col.key] || "") })),
      });
    }
  }

  if (bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParams
        .sort((a, b) => a.paramIndex - b.paramIndex)
        .map((col) => ({ type: "text", text: String(rowData[col.key] || "") })),
    });
  }

  const buttonsByIndex = {};
  buttonParams.forEach((col) => { buttonsByIndex[col.buttonIndex] = col; });
  Object.entries(buttonsByIndex).forEach(([index, col]) => {
    if (col.subType === "url") {
      components.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text: String(rowData[col.key] || "") }] });
    } else if (col.subType === "copy_code") {
      components.push({ type: "button", sub_type: "copy_code", index: String(index), parameters: [{ type: "coupon_code", coupon_code: String(rowData[col.key] || "") }] });
    }
  });

  const templateButtons = (template.components || []).find((c) => c.type === "BUTTONS");
  if (templateButtons) {
    (templateButtons.buttons || []).forEach((button, index) => {
      if (button.type === "FLOW" && !buttonsByIndex[index]) {
        components.push({ type: "button", sub_type: "flow", index: String(index), parameters: [{ type: "action", action: { flow_token: "unused", flow_action_data: { screen: button.navigate_screen || "WELCOME" } } }] });
      }
    });
  }

  return {
    messaging_product: "whatsapp",
    to: rowData.phone_number,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(components.length > 0 ? { components } : {}),
    },
  };
}

function PayloadPreview({ template, sampleRow }) {
  const [tab, setTab] = useState("curl");
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    api.getAdminConfig().then(setConfig).catch(() => {});
  }, []);

  if (!template || !sampleRow) return null;

  const payload = buildPayload(template, sampleRow);
  const phoneNumberId = config?.phoneNumberId || "YOUR_PHONE_NUMBER_ID";
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const curlText =
    `curl -X POST "${url}" \\\n` +
    `  -H "Authorization: Bearer YOUR_TOKEN" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '${JSON.stringify(payload)}'`;

  const jsonText = JSON.stringify(payload, null, 2);
  const active = tab === "curl" ? curlText : jsonText;

  function handleCopy() {
    navigator.clipboard.writeText(active);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card overflow-hidden border-amber-200">
      <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-amber-800">API Payload — first recipient</p>
          <div className="flex rounded-lg overflow-hidden border border-amber-200 text-xs">
            {["curl", "json"].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1 font-medium transition-colors ${tab === t ? "bg-amber-600 text-white" : "bg-white text-amber-700 hover:bg-amber-50"}`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="bg-slate-900 text-green-400 text-xs p-4 overflow-auto max-h-72 leading-relaxed whitespace-pre-wrap break-all">
        {active}
      </pre>
      {tab === "curl" && (
        <p className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-200">
          Replace <code className="bg-amber-100 px-1 rounded font-mono">YOUR_TOKEN</code> with your Meta access token, then run in terminal to test independently.
        </p>
      )}
    </div>
  );
}

function TemplatePreview({ template, sampleRow }) {
  if (!template) return null;
  const isArabic = template.language === "ar";

  function fillVars(text) {
    if (!text) return text;
    return text.replace(/\{\{(\d+)\}\}/g, (_, n) => {
      const col = template.paramSchema?.columns?.find((c) => c.key === `body_${n}`);
      const val = sampleRow?.[`body_${n}`];
      return val
        ? `**${val}**`
        : `[Variable ${n}]`;
    });
  }

  return (
    <div className="card overflow-hidden">
      <div className="bg-[#075e54] px-4 py-2.5 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
          W
        </div>
        <span className="text-white text-sm font-medium">WhatsApp Preview</span>
      </div>
      <div className="bg-[#e5ddd5] p-4">
        <div className={`bg-white rounded-xl shadow-sm max-w-[280px] overflow-hidden ${isArabic ? "ml-auto" : ""}`}>
          {template.headerType === "TEXT" && template.headerText && (
            <div className="px-3 pt-3 pb-1">
              <p className={`text-sm font-semibold text-gray-900 ${isArabic ? "rtl-text" : ""}`}>
                {template.headerText}
              </p>
            </div>
          )}
          {["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerType) && (
            <div className="h-24 bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
              {template.headerType} placeholder
            </div>
          )}
          {template.bodyText && (
            <div className="px-3 py-2">
              <p className={`text-sm text-gray-800 leading-relaxed whitespace-pre-wrap ${isArabic ? "rtl-text" : ""}`}>
                {fillVars(template.bodyText)}
              </p>
            </div>
          )}
          {template.footerText && (
            <div className="px-3 pb-2">
              <p className="text-xs text-gray-400">{template.footerText}</p>
            </div>
          )}
          {template.buttonTypes?.length > 0 && (
            <div className="border-t border-gray-100">
              {template.buttonTypes.map((bt, i) => (
                <div key={i} className="px-3 py-2 text-center text-xs font-medium text-blue-600 border-b border-gray-50 last:border-0">
                  {bt === "QUICK_REPLY" ? "Quick Reply" : bt === "URL" ? "Open Link" : bt === "COPY_CODE" ? "Copy Code" : bt}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CampaignCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [campaignName, setCampaignName] = useState("");
  const [defaultCC, setDefaultCC] = useState("966");
  const [sending, setSending] = useState(false);
  const [campaignId, setCampaignId] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    api.getAdminConfig().catch(() => {});
    fetch("/api/auth/config-public", { credentials: "include" })
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (config?.defaultCountryCode) setDefaultCC(config.defaultCountryCode);
  }, [config]);

  // Auto-map columns when file is parsed or template changes
  useEffect(() => {
    if (parsedData && selectedTemplate?.paramSchema) {
      const mapping = autoDetectMapping(
        parsedData.columns,
        selectedTemplate.paramSchema.columns
      );
      setColumnMapping(mapping);
    }
  }, [parsedData, selectedTemplate]);

  // Auto-generate campaign name
  useEffect(() => {
    if (selectedTemplate) {
      const date = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      setCampaignName(`${selectedTemplate.name} — ${date}`);
    }
  }, [selectedTemplate]);

  const schemaColumns = selectedTemplate?.paramSchema?.columns || [];

  const validation = parsedData
    ? validateAndMapRows(parsedData.rows || [], schemaColumns, columnMapping, defaultCC)
    : null;

  const allRequiredMapped = schemaColumns
    .filter((c) => c.required)
    .every((c) => columnMapping[c.key]);

  const needsMapping =
    parsedData &&
    selectedTemplate?.paramSchema?.columns?.some(
      (c) => c.key !== "phone_number" && !columnMapping[c.key]
    );

  function handleTemplateSelect(t) {
    setSelectedTemplate(t);
    setParsedData(null);
    setColumnMapping({});
    setStep(1);
  }

  function handleParsed(data) {
    setParsedData(data);
    if (data && selectedTemplate?.paramSchema) {
      const mapping = autoDetectMapping(data.columns, selectedTemplate.paramSchema.columns);
      setColumnMapping(mapping);
    }
  }

  async function handleSend() {
    if (!selectedTemplate || !validation?.valid.length) return;
    setConfirmOpen(false);
    setSending(true);
    setSendError(null);

    try {
      // Build rows with mapped data from full dataset
      const allRows = parsedData.rows || [];
      const mappedRows = allRows.map((row) => {
        const mapped = {};
        for (const col of schemaColumns) {
          const srcKey = columnMapping[col.key];
          if (srcKey) mapped[col.key] = row[srcKey];
        }
        return mapped;
      });

      const result = await api.createCampaign({
        name: campaignName,
        templateId: selectedTemplate.id,
        rows: mappedRows,
        originalFileName: parsedData.fileName,
      });

      setCampaignId(result.campaign.id);
      setStep(3); // Progress step
    } catch (err) {
      setSendError(err.message || "Failed to start campaign");
      setSending(false);
    }
  }

  // Step 4: Sending progress
  if (step === 3 && campaignId) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Sending Campaign</h1>
            <p className="page-subtitle">{campaignName}</p>
          </div>
        </div>
        <SendProgress campaignId={campaignId} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">New Campaign</h1>
          <p className="page-subtitle">Send WhatsApp template messages to your contact list</p>
        </div>
      </div>

      {/* Step progress */}
      <div className="flex items-center">
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <div className="flex items-center gap-2 px-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  i < step
                    ? "text-white border-transparent"
                    : i === step
                    ? "bg-white text-slate-800 border-slate-300"
                    : "bg-white border-slate-200 text-slate-400"
                }`}
                style={i < step ? { background: "var(--brand)", borderColor: "var(--brand)" } : i === step ? { borderColor: "var(--brand)", color: "var(--brand)" } : {}}
              >
                {i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i <= step ? "text-slate-800" : "text-slate-400"}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="h-px flex-1 mx-2 transition-colors"
                style={{ background: i < step ? "var(--brand)" : "#e2e8f0" }}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Choose Template */}
      {step === 0 && (
        <div>
          <TemplatePicker selected={selectedTemplate} onSelect={handleTemplateSelect} />
        </div>
      )}

      {/* Step 2: Upload Contacts */}
      {step === 1 && selectedTemplate && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: template info + upload */}
          <div className="lg:col-span-2 space-y-4">
            {/* Required columns */}
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Required Columns for "{selectedTemplate.name}"
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-gray-100">
                      <th className="pb-2 text-gray-500 font-medium">Column</th>
                      <th className="pb-2 text-gray-500 font-medium">Description</th>
                      <th className="pb-2 text-gray-500 font-medium">Example</th>
                      <th className="pb-2 text-gray-500 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {schemaColumns.map((col) => (
                      <tr key={col.key}>
                        <td className="py-2 font-mono text-blue-700">{col.key}</td>
                        <td className="py-2 text-gray-600 pr-4">{col.description}</td>
                        <td className="py-2 text-gray-400 font-mono">{col.example}</td>
                        <td className="py-2">
                          {col.required ? (
                            <span className="badge bg-red-50 text-red-600">required</span>
                          ) : (
                            <span className="badge bg-gray-100 text-gray-400">optional</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Download + Upload */}
            <div className="flex items-center gap-2 flex-wrap">
              <ExampleCSV templateId={selectedTemplate.id} templateName={selectedTemplate.name} />
              <span className="text-xs text-gray-400">or upload your own file below</span>
            </div>

            <FileUploader onParsed={handleParsed} template={selectedTemplate} />

            {/* Warnings from parser */}
            {parsedData?.warnings?.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                {w}
              </div>
            ))}

            {/* Column mapper — show if not all auto-mapped */}
            {parsedData && (needsMapping || !allRequiredMapped) && (
              <ColumnMapper
                schemaColumns={schemaColumns}
                fileColumns={parsedData.columns}
                mapping={columnMapping}
                onChange={setColumnMapping}
              />
            )}

            {/* Data preview */}
            {parsedData && validation && (
              <DataPreview
                rows={parsedData.rows || []}
                schemaColumns={schemaColumns}
                columnMapping={columnMapping}
                defaultCC={defaultCC}
              />
            )}
          </div>

          {/* Right: template preview */}
          <div className="space-y-4">
            <TemplatePreview
              template={selectedTemplate}
              sampleRow={validation?.valid?.[0]}
            />
          </div>
        </div>
      )}

      {/* Step 3: Review & Send */}
      {step === 2 && selectedTemplate && validation && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="card p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                <div>
                  <p className="text-xs text-gray-500">Template</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{selectedTemplate.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Recipients</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">
                    {validation.valid.length} contacts
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Skipped (invalid)</p>
                  <p className="text-sm font-medium text-red-600 mt-0.5">
                    {validation.errors.length} rows
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Estimated Time</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">
                    ~{Math.ceil(validation.valid.length / 10)}s at 10 msg/sec
                  </p>
                </div>
              </div>
            </div>

            {/* ── API Payload Preview ── */}
            <PayloadPreview template={selectedTemplate} sampleRow={validation.valid[0]} />

            {sendError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {sendError}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={!validation.valid.length || sending}
                className="btn btn-primary text-base py-3 px-6 rounded-xl disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
                {sending ? "Starting..." : `Send to ${validation.valid.length} contacts`}
              </button>
              <button
                onClick={() => navigate("/")}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>

          <div>
            <TemplatePreview
              template={selectedTemplate}
              sampleRow={validation.valid[0]}
            />
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      {step < 3 && (
        <div className="flex items-center justify-between pt-2">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="btn-secondary"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <div />
          )}

          {step === 1 && parsedData && allRequiredMapped && validation?.valid.length > 0 && (
            <button onClick={() => setStep(2)} className="btn-primary">
              Review & Send <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Send</h3>
            <p className="text-sm text-gray-600 mb-5">
              You are about to send{" "}
              <strong>{validation?.valid.length} WhatsApp messages</strong>.
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleSend}
                className="btn btn-primary flex-1"
              >
                <Send className="w-4 h-4" /> Send Now
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
