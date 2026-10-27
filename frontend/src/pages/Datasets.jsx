
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Eye,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import api from "../services/api";

function errorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || JSON.stringify(item)).join(", ");
  }
  return error?.message || "Something went wrong.";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function Metric({ label, value, color }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color || "text-slate-900"}`}>
        {value ?? "—"}
      </p>
    </div>
  );
}

export default function Datasets() {
  const [datasets, setDatasets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadDatasets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/api/datasets");
      const data = response.data;
      setDatasets(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.datasets)
            ? data.datasets
            : Array.isArray(data?.items)
              ? data.items
              : []
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  const uploadDataset = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please select a CSV file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("The file must be 10 MB or smaller.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      const response = await api.post("/api/datasets/upload", formData);
      const result = response.data || {};
      setMessage(
        result.message ||
          `Dataset uploaded successfully${result.dataset_id ? ` (ID ${result.dataset_id})` : ""}.`
      );
      setFile(null);
      event.target.reset();
      await loadDatasets();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const viewDetails = async (dataset) => {
    setError("");
    try {
      const response = await api.get(`/api/datasets/${dataset.id}`);
      setSelected(response.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const totalRows = datasets.reduce(
    (sum, item) => sum + Number(item.total_rows || 0),
    0
  );
  const validRows = datasets.reduce(
    (sum, item) => sum + Number(item.valid_rows || 0),
    0
  );
  const invalidRows = datasets.reduce(
    (sum, item) => sum + Number(item.invalid_rows || 0),
    0
  );
  const duplicateRows = datasets.reduce(
    (sum, item) => sum + Number(item.duplicate_rows || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Dataset Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Upload workforce CSV files and review validation results.
          </p>
        </div>
        <button
          onClick={loadDatasets}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-indigo-100 p-3 text-indigo-700">
            <Upload size={22} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Upload dataset</h2>
            <p className="text-sm text-slate-500">
              Select a CSV file up to 10 MB.
            </p>
          </div>
        </div>

        <form onSubmit={uploadDataset} className="space-y-4">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="block w-full rounded-xl border border-slate-200 p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:font-medium file:text-indigo-700"
          />
          {file && (
            <p className="text-sm text-slate-600">
              Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
          <button
            type="submit"
            disabled={uploading || !file}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload size={17} />
            {uploading ? "Uploading and validating..." : "Upload and validate"}
          </button>
        </form>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total rows" value={totalRows} />
        <Metric label="Valid rows" value={validRows} color="text-emerald-600" />
        <Metric label="Invalid rows" value={invalidRows} color="text-red-600" />
        <Metric label="Duplicate rows" value={duplicateRows} color="text-amber-600" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 p-5">
          <Database size={21} className="text-indigo-600" />
          <div>
            <h2 className="font-semibold text-slate-900">Dataset history</h2>
            <p className="text-sm text-slate-500">
              Previously uploaded datasets and their validation counts.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading datasets...</p>
        ) : datasets.length === 0 ? (
          <div className="p-10 text-center">
            <FileSpreadsheet size={34} className="mx-auto text-slate-300" />
            <p className="mt-3 font-medium text-slate-700">No datasets found</p>
            <p className="mt-1 text-sm text-slate-500">
              Upload a CSV file to start.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Dataset</th>
                  <th className="px-5 py-4">Total</th>
                  <th className="px-5 py-4">Valid</th>
                  <th className="px-5 py-4">Invalid</th>
                  <th className="px-5 py-4">Duplicates</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Uploaded</th>
                  <th className="px-5 py-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {datasets.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {item.filename || `Dataset ${item.id}`}
                      <p className="mt-1 text-xs text-slate-400">ID: {item.id}</p>
                    </td>
                    <td className="px-5 py-4">{item.total_rows ?? 0}</td>
                    <td className="px-5 py-4 text-emerald-700">{item.valid_rows ?? 0}</td>
                    <td className="px-5 py-4 text-red-700">{item.invalid_rows ?? 0}</td>
                    <td className="px-5 py-4">{item.duplicate_rows ?? 0}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {item.status || "UNKNOWN"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => viewDetails(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 font-medium hover:bg-slate-100"
                      >
                        <Eye size={15} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4">
          <section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {selected.filename || `Dataset ${selected.id}`}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Dataset ID: {selected.id}
                </p>
              </div>
              <button
                aria-label="Close details"
                onClick={() => setSelected(null)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Total" value={selected.total_rows} />
              <Metric label="Valid" value={selected.valid_rows} color="text-emerald-600" />
              <Metric label="Invalid" value={selected.invalid_rows} color="text-red-600" />
              <Metric label="Duplicates" value={selected.duplicate_rows} color="text-amber-600" />
            </div>

            <div className="mt-5">
              <h3 className="mb-2 font-semibold text-slate-800">
                Validation report
              </h3>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-xs text-slate-700">
                {JSON.stringify(selected.validation_report ?? {}, null, 2)}
              </pre>
            </div>

            <button
              onClick={() => setSelected(null)}
              className="mt-5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Close
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
