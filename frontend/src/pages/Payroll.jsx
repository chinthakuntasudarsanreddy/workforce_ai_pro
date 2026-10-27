import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  CircleDollarSign,
  Download,
  FileText,
  RefreshCw,
  Wallet,
} from "lucide-react";
import api from "../services/api";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const now = new Date();

function currency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function errorMessage(error) {
  const detail = error?.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => `${item.loc?.slice(-1)[0] || "Field"}: ${item.msg}`).join("; ");
  }

  if (typeof detail === "string") return detail;

  if (error?.response?.status === 401) {
    return "Your session has expired. Please sign in again.";
  }

  if (error?.response?.status === 403) {
    return "You do not have permission to perform this action.";
  }

  return error?.message || "Something went wrong. Please try again.";
}

function extractRecords(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.payroll_records)) return data.payroll_records;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.payroll)) return data.payroll;
  return [];
}

function amount(record, ...fields) {
  for (const field of fields) {
    if (record?.[field] !== undefined && record?.[field] !== null) {
      return Number(record[field]) || 0;
    }
  }
  return 0;
}

function Status({ value }) {
  const status = String(value || "GENERATED").toUpperCase();
  const style =
    status === "PAID"
      ? "bg-emerald-50 text-emerald-700"
      : status === "GENERATED"
        ? "bg-blue-50 text-blue-700"
        : "bg-amber-50 text-amber-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style}`}>
      {status}
    </span>
  );
}

export default function Payroll() {
  const [profile, setProfile] = useState(null);
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [period, setPeriod] = useState({
    employee_id: "",
    pay_month: String(now.getMonth() + 1),
    pay_year: String(now.getFullYear()),
    allowances: "0",
    bonus: "0",
    incentives: "0",
    deductions: "0",
    tax_rate: "0",
  });

  const role = String(profile?.role || "").toUpperCase();
  const canManage = ["ADMIN", "HR"].includes(role);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const profileResponse = await api.get("/api/auth/me");
      const currentProfile = profileResponse.data;
      setProfile(currentProfile);

      if (["ADMIN", "HR"].includes(String(currentProfile?.role || "").toUpperCase())) {
        const [payrollResult, employeesResult] = await Promise.all([
          api.get("/api/payroll/"),
          api.get("/api/employees/"),
        ]);

        setRecords(extractRecords(payrollResult.data));

        const employeeData = employeesResult.data;
        const employeeList = Array.isArray(employeeData)
          ? employeeData
          : employeeData?.employees || employeeData?.items || [];

        setEmployees(employeeList);
      } else {
        const payrollResult = await api.get("/api/payroll/my");
        setRecords(extractRecords(payrollResult.data));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function updatePeriod(field, value) {
    setPeriod((previous) => ({ ...previous, [field]: value }));
  }

  async function generatePayroll(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const employeeId = Number(period.employee_id);
    const payMonth = Number(period.pay_month);
    const payYear = Number(period.pay_year);
    const allowances = Number(period.allowances);
    const bonus = Number(period.bonus);
    const incentives = Number(period.incentives);
    const deductions = Number(period.deductions);
    const taxRate = Number(period.tax_rate);

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      setError("Select an employee before generating payroll.");
      return;
    }

    if (!Number.isInteger(payMonth) || payMonth < 1 || payMonth > 12) {
      setError("Pay month must be between 1 and 12.");
      return;
    }

    if (!Number.isInteger(payYear) || payYear < 2000 || payYear > 2100) {
      setError("Pay year must be between 2000 and 2100.");
      return;
    }

    if (
      [allowances, bonus, incentives, deductions, taxRate].some(
        (value) => !Number.isFinite(value) || value < 0
      ) ||
      taxRate > 100
    ) {
      setError("Amounts must be non-negative, and tax rate must not exceed 100%.");
      return;
    }

    setGenerating(true);

    try {
      const payload = {
        employee_id: employeeId,
        pay_year: payYear,
        pay_month: payMonth,
        allowances,
        bonus,
        incentives,
        deductions,
        tax_rate: taxRate,
      };

      const response = await api.post("/api/payroll/generate", payload);

      setSuccess(
        response.data?.message ||
          `Payroll generated for ${MONTHS[payMonth - 1]} ${payYear}.`
      );

      await loadData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  async function markPaid(record) {
    setError("");
    setSuccess("");
    setWorkingId(record.id);

    try {
      // Backend route is PATCH, not POST.
      const response = await api.patch(`/api/payroll/${record.id}/pay`);
      setSuccess(response.data?.message || "Payroll marked as paid.");
      await loadData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWorkingId(null);
    }
  }

  async function downloadPayslip(record) {
    setError("");
    setDownloadingId(record.id);

    try {
      const response = await api.get(`/api/payroll/${record.id}/payslip`, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: response.headers?.["content-type"] || "application/pdf",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payslip_${record.employee_id}_${record.pay_year}_${String(record.pay_month).padStart(2, "0")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  }

  const totalNet = records.reduce(
    (sum, record) => sum + amount(record, "net_pay", "net_salary", "net_amount"),
    0
  );

  const paidRecords = records.filter(
    (record) => String(record.status).toUpperCase() === "PAID"
  );

  const totalPaid = paidRecords.reduce(
    (sum, record) => sum + amount(record, "net_pay", "net_salary", "net_amount"),
    0
  );

  const stats = [
    {
      title: "Payroll Records",
      value: records.length,
      icon: FileText,
      color: "bg-indigo-50 text-indigo-600",
    },
    {
      title: "Total Net Pay",
      value: currency(totalNet),
      icon: CircleDollarSign,
      color: "bg-blue-50 text-blue-600",
    },
    {
      title: "Paid Records",
      value: paidRecords.length,
      icon: CheckCircle,
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      title: "Amount Paid",
      value: currency(totalPaid),
      icon: Wallet,
      color: "bg-violet-50 text-violet-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-indigo-600">
            Compensation management
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Payroll & Payslips
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Generate payroll for an employee and manage salary records.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle size={18} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <div key={stat.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-500">{stat.title}</p>
                  <p className="mt-3 text-2xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`rounded-xl p-3 ${stat.color}`}>
                  <Icon size={21} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canManage && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-slate-900">Generate Employee Payroll</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose an employee and enter the pay period and optional salary adjustments.
          </p>

          <form onSubmit={generatePayroll} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="sm:col-span-2">
              <label htmlFor="employee_id" className="mb-2 block text-sm font-medium text-slate-700">
                Employee *
              </label>
              <select
                id="employee_id"
                required
                value={period.employee_id}
                onChange={(event) => updatePeriod("employee_id", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-500"
              >
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name || employee.user?.full_name || employee.employee_code || `Employee ${employee.id}`}
                    {employee.employee_code ? ` (${employee.employee_code})` : ""}
                  </option>
                ))}
              </select>
              {employees.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  No employees were returned. Create or check employee records first.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="pay_month" className="mb-2 block text-sm font-medium text-slate-700">
                Pay month *
              </label>
              <select
                id="pay_month"
                required
                value={period.pay_month}
                onChange={(event) => updatePeriod("pay_month", event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-indigo-500"
              >
                {MONTHS.map((month, index) => (
                  <option key={month} value={index + 1}>{month}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="pay_year" className="mb-2 block text-sm font-medium text-slate-700">
                Pay year *
              </label>
              <input
                id="pay_year"
                type="number"
                min="2000"
                max="2100"
                step="1"
                required
                value={period.pay_year}
                onChange={(event) => updatePeriod("pay_year", event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-500"
              />
            </div>

            {[
              ["allowances", "Allowances"],
              ["bonus", "Bonus"],
              ["incentives", "Incentives"],
              ["deductions", "Other deductions"],
            ].map(([field, label]) => (
              <div key={field}>
                <label htmlFor={field} className="mb-2 block text-sm font-medium text-slate-700">
                  {label} (INR)
                </label>
                <input
                  id={field}
                  type="number"
                  min="0"
                  step="0.01"
                  value={period[field]}
                  onChange={(event) => updatePeriod(field, event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-500"
                />
              </div>
            ))}

            <div>
              <label htmlFor="tax_rate" className="mb-2 block text-sm font-medium text-slate-700">
                Tax withholding (%)
              </label>
              <input
                id="tax_rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={period.tax_rate}
                onChange={(event) => updatePeriod("tax_rate", event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={generating || employees.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={17} className={generating ? "animate-spin" : ""} />
                {generating ? "Generating..." : "Generate Payroll"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-semibold text-slate-900">Payroll History</h2>
          <p className="mt-1 text-sm text-slate-500">
            {records.length} payroll record{records.length === 1 ? "" : "s"}
          </p>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading payroll records...</div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="mx-auto text-slate-400" size={32} />
            <p className="mt-3 font-semibold text-slate-800">No payroll records found</p>
            <p className="mt-1 text-sm text-slate-500">
              {canManage ? "Select an employee above to generate payroll." : "Your payslips will appear here when they are available."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">Employee ID</th>
                  <th className="px-5 py-4">Pay period</th>
                  <th className="px-5 py-4">Base salary</th>
                  <th className="px-5 py-4">Gross pay</th>
                  <th className="px-5 py-4">Net pay</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {record.employee_id}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {record.pay_period || `${MONTHS[Number(record.pay_month) - 1] || "—"} ${record.pay_year || ""}`}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {currency(amount(record, "base_salary"))}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {currency(amount(record, "gross_pay"))}
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {currency(amount(record, "net_pay"))}
                    </td>
                    <td className="px-5 py-4">
                      <Status value={record.status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {canManage && record.status !== "PAID" && (
                          <button
                            type="button"
                            onClick={() => markPaid(record)}
                            disabled={workingId === record.id}
                            className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            {workingId === record.id ? "Saving..." : "Mark paid"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => downloadPayslip(record)}
                          disabled={downloadingId === record.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Download size={14} />
                          {downloadingId === record.id ? "Downloading..." : "Payslip"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
