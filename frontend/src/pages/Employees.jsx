
import { useCallback, useEffect, useState } from "react";
import {
  Search,
  RefreshCw,
  Users,
  Plus,
  Pencil,
  UserX,
  X,
} from "lucide-react";
import api from "../services/api";

const emptyForm = {
  full_name: "",
  email: "",
  password: "",
  employee_code: "",
  department_id: "",
  manager_id: "",
  job_title: "",
  phone: "",
  hire_date: new Date().toISOString().slice(0, 10),
  employment_type: "FULL_TIME",
  salary: "",
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = { page: 1, page_size: 100 };
      if (search.trim()) params.search = search.trim();
      if (status) params.employee_status = status;

      const response = await api.get("/api/employees/", { params });
      setEmployees(response.data.items ?? []);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to load employees. Check your login and permissions."
      );
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  const loadDepartments = useCallback(async () => {
    try {
      const response = await api.get("/api/departments/");
      const data = response.data;
      setDepartments(
        Array.isArray(data) ? data : data.items ?? data.departments ?? []
      );
    } catch {
      setDepartments([]);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
    loadDepartments();
  }, [loadEmployees, loadDepartments]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  function openEdit(employee) {
    setEditing(employee);
    setForm({
      ...emptyForm,
      full_name: employee.full_name ?? "",
      employee_code: employee.employee_code ?? "",
      department_id: employee.department_id?.toString() ?? "",
      manager_id: employee.manager_id?.toString() ?? "",
      job_title: employee.job_title ?? "",
      phone: employee.phone ?? "",
      hire_date: employee.hire_date ?? "",
      employment_type: employee.employment_type ?? "FULL_TIME",
      salary: employee.salary ?? "",
    });
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  function changeField(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function saveEmployee(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        full_name: form.full_name.trim(),
        department_id: form.department_id
          ? Number(form.department_id)
          : null,
        manager_id: form.manager_id ? Number(form.manager_id) : null,
        job_title: form.job_title.trim(),
        phone: form.phone.trim() || null,
        hire_date: form.hire_date,
        employment_type: form.employment_type,
        salary: form.salary === "" ? null : Number(form.salary),
      };

      if (editing) {
        await api.patch(`/api/employees/${editing.id}`, payload);
        setSuccess("Employee updated successfully.");
      } else {
        await api.post("/api/employees/", {
          ...payload,
          email: form.email.trim(),
          password: form.password,
          employee_code: form.employee_code.trim(),
        });
        setSuccess("Employee created successfully.");
      }

      setModalOpen(false);
      await loadEmployees();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((item) => item.msg).join(", ")
            : "Unable to save employee. Please check the entered values."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivateEmployee(employee) {
    if (
      !window.confirm(
        `Deactivate ${employee.full_name}? They will no longer be active.`
      )
    ) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      await api.delete(`/api/employees/${employee.id}`);
      setSuccess(`${employee.full_name} has been deactivated.`);
      await loadEmployees();
    } catch (err) {
      setError(
        err.response?.data?.detail || "Unable to deactivate this employee."
      );
    }
  }

  const activeCount = employees.filter(
    (employee) => employee.status === "ACTIVE"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Employee Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage employee profiles, departments and employment details.
          </p>
        </div>

        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={18} />
          Add Employee
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Employees found</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {employees.length}
              </p>
            </div>
            <Users className="text-blue-600" size={28} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Active in current results</p>
          <p className="mt-2 text-3xl font-bold text-green-600">
            {activeCount}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-48 flex-1">
            <Search
              className="absolute left-3 top-3 text-slate-400"
              size={18}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, code or job title..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ON_LEAVE">On leave</option>
          </select>

          <button
            onClick={loadEmployees}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-3 py-3 font-medium">Employee</th>
                <th className="px-3 py-3 font-medium">Department</th>
                <th className="px-3 py-3 font-medium">Job title</th>
                <th className="px-3 py-3 font-medium">Hire date</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">
                    Loading employees...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-500">
                    No employees found.
                  </td>
                </tr>
              ) : (
                employees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-3 py-4">
                      <p className="font-semibold text-slate-800">
                        {employee.full_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {employee.email}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {employee.employee_code}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      {employee.department || "Unassigned"}
                    </td>
                    <td className="px-3 py-4">{employee.job_title}</td>
                    <td className="px-3 py-4">
                      {formatDate(employee.hire_date)}
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          employee.status === "ACTIVE"
                            ? "bg-green-100 text-green-700"
                            : employee.status === "ON_LEAVE"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {employee.status}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex gap-2">
                        <button
                          title="Edit employee"
                          onClick={() => openEdit(employee)}
                          className="rounded-lg border border-slate-200 p-2 hover:bg-blue-50"
                        >
                          <Pencil size={15} />
                        </button>
                        {employee.status !== "INACTIVE" && (
                          <button
                            title="Deactivate employee"
                            onClick={() => deactivateEmployee(employee)}
                            className="rounded-lg border border-slate-200 p-2 text-red-600 hover:bg-red-50"
                          >
                            <UserX size={15} />
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

        <p className="mt-3 text-xs text-slate-400">
          Showing up to 100 matching employees. Deactivation preserves the
          employee record.
        </p>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editing ? "Edit employee" : "Add employee"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editing
                    ? "Update employment information."
                    : "Create an employee account and profile."}
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-2 hover:bg-slate-100"
                aria-label="Close form"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveEmployee} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Full name *
                  <input
                    name="full_name"
                    value={form.full_name}
                    onChange={changeField}
                    required
                    minLength={2}
                    maxLength={150}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  />
                </label>

                {!editing && (
                  <>
                    <label className="text-sm font-medium text-slate-700">
                      Email *
                      <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={changeField}
                        required
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                      />
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                      Temporary password * (minimum 12 characters)
                      <input
                        type="password"
                        name="password"
                        value={form.password}
                        onChange={changeField}
                        required
                        minLength={12}
                        maxLength={72}
                        autoComplete="new-password"
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                      />
                    </label>

                    <label className="text-sm font-medium text-slate-700">
                      Employee code *
                      <input
                        name="employee_code"
                        value={form.employee_code}
                        onChange={changeField}
                        required
                        maxLength={30}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                      />
                    </label>
                  </>
                )}

                <label className="text-sm font-medium text-slate-700">
                  Job title *
                  <input
                    name="job_title"
                    value={form.job_title}
                    onChange={changeField}
                    required
                    maxLength={120}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Department
                  <select
                    name="department_id"
                    value={form.department_id}
                    onChange={changeField}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  >
                    <option value="">Unassigned</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Manager employee ID (optional)
                  <input
                    type="number"
                    min="1"
                    name="manager_id"
                    value={form.manager_id}
                    onChange={changeField}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Phone
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={changeField}
                    maxLength={25}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Hire date *
                  <input
                    type="date"
                    name="hire_date"
                    value={form.hire_date}
                    onChange={changeField}
                    required
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Employment type
                  <select
                    name="employment_type"
                    value={form.employment_type}
                    onChange={changeField}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  >
                    <option value="FULL_TIME">Full time</option>
                    <option value="PART_TIME">Part time</option>
                    <option value="CONTRACT">Contract</option>
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Salary (optional)
                  <input
                    type="number"
                    name="salary"
                    value={form.salary}
                    onChange={changeField}
                    min="0"
                    step="0.01"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                  />
                </label>
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editing
                      ? "Save changes"
                      : "Create employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
