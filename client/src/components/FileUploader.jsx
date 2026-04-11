import React, { useRef, useState } from "react";
import { Upload, FileSpreadsheet, X, AlertTriangle } from "lucide-react";
import { api } from "../lib/api.js";

export default function FileUploader({ onParsed, template }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);

  async function processFile(file) {
    if (!file) return;

    const ext = file.name.split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext)) {
      setError("Only CSV and Excel (.xlsx, .xls) files are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large. Maximum size is 10 MB.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await api.parseFile(file);
      setFileInfo({ name: file.name, rowCount: result.rowCount, columns: result.columns });
      onParsed({ ...result, fileName: file.name });
    } catch (err) {
      setError(err.message || "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function onInputChange(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  function clear() {
    setFileInfo(null);
    setError(null);
    onParsed(null);
  }

  if (fileInfo) {
    return (
      <div className="card p-4 border-green-200 bg-green-50/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-green-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{fileInfo.name}</p>
              <p className="text-xs text-gray-500">
                {fileInfo.rowCount.toLocaleString()} rows · {fileInfo.columns.length} columns
              </p>
            </div>
          </div>
          <button
            onClick={clear}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
            title="Remove file"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-all ${
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
        } ${loading ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={onInputChange}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-2">
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <p className="text-sm text-gray-500">Parsing file...</p>
            </>
          ) : (
            <>
              <Upload className={`w-8 h-8 ${dragging ? "text-blue-500" : "text-gray-300"}`} />
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Drop your file here or <span className="text-blue-600">browse</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">CSV or Excel (.xlsx) · Max 10 MB</p>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
