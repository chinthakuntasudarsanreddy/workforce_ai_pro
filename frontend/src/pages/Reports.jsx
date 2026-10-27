
import { useCallback, useEffect, useState } from "react";
import { Download, FileBarChart, RefreshCw, AlertCircle } from "lucide-react";
import api from "../services/api";

function formatLabel(value) {
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function SummaryValue({ value }) {
  if (value === null || value === undefined) return <span>—</span>;

  if (Array.isArray(value)) {
    if (!value.length) return <span>No records</span>;

    return (
      <div className="space-y-3">
        {value.map((item, index) => (
          <div
            key={item?.id ?? index}
            className="rounded-xl border border-slate-200 p-3"
          >
            <SummaryValue value={item} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(value).map(([key, item]) => (
          <div
            key={key}
            className="min-w-0 rounded-xl bg-slate-50 p-3"
          >
            <p className="mb-1 text-xs font-medium text-slate-500">
              {formatLabel(key)}
            </p>
            <div className="break-words text-sm font-semibold text-slate-800">
              <SummaryValue value={item} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";

  return String(value);
}

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/api/reports/summary");
      setSummary(response.data);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Could not load the report summary. Check your login and backend."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const exportReport = async () => {
    setExporting(true);
    setError("");

    try {
      const response = await api.get("/api/reports/export", {
        responseType: "blob",
      });

      const contentType =
        response.headers["content-type"] || "application/octet-stream";
      const blob = new Blob([response.data], { type: contentType });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = contentType.includes("json")
        ? "workforce-report.json"
        : contentType.includes("pdf")
          ? "workforce-report.pdf"
          : contentType.includes("spreadsheet")
            ? "workforce-report.xlsx"
            : "workforce-report.csv";

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Report export failed. Check the export endpoint requirements."
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-100 p-3 text-indigo-700">
              <FileBarChart size={25} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Workforce Reports
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Review workforce summary data and export a report.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadSummary}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={exportReport}
            disabled={exporting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Download size={16} />
            {exporting ? "Exporting..." : "Export Report"}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p>{typeof error === "string" ? error : "Request failed."}</p>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">
          Report Summary
        </h2>

        {loading ? (
          <div className="flex items-center gap-3 py-10 text-sm text-slate-500">
            <RefreshCw size={18} className="animate-spin" />
            Loading report data...
          </div>
        ) : summary === null ? (
          <p className="py-8 text-sm text-slate-500">
            No summary data is available.
          </p>
        ) : (
          <SummaryValue value={summary} />
        )}
      </section>
    </div>
  );
}
