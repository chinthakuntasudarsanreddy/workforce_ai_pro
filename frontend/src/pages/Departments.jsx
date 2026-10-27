
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Search,
  Plus,
  Pencil,
  X,
  Users,
  RefreshCw,
  Power,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import api from "../services/api";

const emptyForm = {
  name: "",
  description: "",
};

function getErrorMessage(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(", ");
  }

  if (error?.response?.status === 401) {
    return "Your session has expired. Please log in again.";
  }
  if (error?.response?.status === 403) {
    return "Your account does not have permission to perform this action.";
  }

  return "Something went wrong. Please try again.";
}

export default function Departments() {
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadDepartments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/api/departments/", {
        params: search.trim() ? { search: search.trim() } : {},
      });

      setDepartments(
        Array.isArray(response.data) ? response.data : []
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDepartments();
    }, 250);

    return () => clearTimeout(timer);
  }, [loadDepartments]);

  function openCreateModal() {
    setEditingDepartment(null);
    setForm(emptyForm);
    setError("");
    setNotice("");
    setModalOpen(true);
  }

  function openEditModal(department) {
    setEditingDepartment(department);
    setForm({
      name: department.name || "",
      description: department.description || "",
    });
    setError("");
    setNotice("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingDepartment(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const name = form.name.trim();
    const description = form.description.trim();

    if (!name) {
      setError("Department name is required.");
      return;
    }

    if (name.length > 100) {
      setError("Department name cannot exceed 100 characters.");
      return;
    }

    const payload = {
      name,
      description: description || null,
    };

    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (editingDepartment) {
        await api.patch(
          `/api/departments/${editingDepartment.id}`,
          payload
        );
        setNotice("Department updated successfully.");
      } else {
        await api.post("/api/departments/", payload);
        setNotice("Department created successfully.");
      }

      setModalOpen(false);
      setEditingDepartment(null);
      setForm(emptyForm);
      await loadDepartments();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(department) {
    const confirmed = window.confirm(
      `Deactivate "${department.name}"? It will remain in the database, but be marked inactive.`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      await api.delete(`/api/departments/${department.id}`);
      setNotice(`${department.name} was deactivated.`);
      await loadDepartments();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const activeCount = departments.filter(
    (department) => department.is_active
  ).length;

  const employeeTotal = departments.reduce(
    (total, department) =>
      total + Number(department.employee_count || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-indigo-600">
            Organization
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Departments
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage departments and view their employee counts.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <Plus size={18} />
          Add Department
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <CheckCircle2 size={18} />
          {notice}
          <button
            type="button"
            className="ml-auto"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            className="ml-auto"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Departments Found"
          value={departments.length}
          icon={<Building2 size={21} />}
        />
        <StatCard
          title="Active Departments"
          value={activeCount}
          icon={<CheckCircle2 size={21} />}
        />
        <StatCard
          title="Employees in Results"
          value={employeeTotal}
          icon={<Users size={21} />}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">
              Department Directory
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Search by department name.
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1 sm:w-72">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search departments..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <button
              type="button"
              onClick={loadDepartments}
              disabled={loading}
              title="Refresh departments"
              className="rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                size={18}
                className={loading ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">Department</th>
                <th className="px-5 py-4 font-semibold">Description</th>
                <th className="px-5 py-4 font-semibold">Employees</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 text-right font-semibold">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-slate-500"
                  >
                    Loading departments...
                  </td>
                </tr>
              ) : error && departments.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-slate-500"
                  >
                    Could not load departments. Use Refresh to try again.
                  </td>
                </tr>
              ) : departments.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center"
                  >
                    <Building2
                      size={32}
                      className="mx-auto mb-3 text-slate-300"
                    />
                    <p className="font-medium text-slate-700">
                      No departments found
                    </p>
                    <p className="mt-1 text-slate-500">
                      Try another search or create a department.
                    </p>
                  </td>
                </tr>
              ) : (
                departments.map((department) => (
                  <tr
                    key={department.id}
                    className="transition hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                          <Building2 size={20} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">
                            {department.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            ID: {department.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="max-w-xs px-5 py-4 text-slate-600">
                      <span className="line-clamp-2">
                        {department.description || "—"}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 font-medium text-slate-700">
                        <Users size={15} />
                        {department.employee_count ?? 0}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          department.is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {department.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(department)}
                          disabled={!department.is_active}
                          title="Edit department"
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Pencil size={16} />
                        </button>

                        {department.is_active && (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(department)}
                            title="Deactivate department"
                            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          >
                            <Power size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Showing {departments.length} department
          {departments.length === 1 ? "" : "s"} in the current results.
        </div>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="department-modal-title"
            className="my-auto w-full max-w-lg rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2
                  id="department-modal-title"
                  className="text-lg font-bold text-slate-900"
                >
                  {editingDepartment
                    ? "Edit Department"
                    : "Add Department"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enter the department details below.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close dialog"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div>
                <label
                  htmlFor="department-name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Department Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="department-name"
                  type="text"
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  placeholder="e.g. Engineering"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Maximum 100 characters.
                </p>
              </div>

              <div>
                <label
                  htmlFor="department-description"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Description
                </label>
                <textarea
                  id="department-description"
                  rows={4}
                  value={form.description}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      description: event.target.value,
                    })
                  }
                  placeholder="Describe the department's responsibilities..."
                  className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editingDepartment
                      ? "Save Changes"
                      : "Create Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  );
}
