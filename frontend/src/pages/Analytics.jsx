
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Building2,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  LineChart,
  Line,
} from "recharts";
import api from "../services/api";

function AnalyticsStat({ title, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {value ?? "—"}
          </p>
        </div>
        <div className="rounded-xl bg-indigo-100 p-3 text-indigo-700">
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function Analytics() {
  const [overview, setOverview] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");

    const results = await Promise.allSettled([
      api.get("/api/analytics/overview"),
      api.get("/api/analytics/departments"),
      api.get("/api/analytics/attendance-trend?days=7"),
    ]);

    const failures = [];

    if (results[0].status === "fulfilled") {
      setOverview(results[0].value.data);
    } else {
      failures.push("workforce overview");
    }

    if (results[1].status === "fulfilled") {
      const data = results[1].value.data;
      setDepartments(
        Array.isArray(data)
          ? data
          : data?.departments ?? data?.items ?? []
      );
    } else {
      failures.push("department statistics");
    }

    if (results[2].status === "fulfilled") {
      const data = results[2].value.data;
      setTrend(
        Array.isArray(data)
          ? data
          : data?.trend ?? data?.items ?? []
      );
    } else {
      failures.push("attendance trend");
    }

    if (failures.length) {
      setError(
        `Could not load: ${failures.join(", ")}. Check the backend and API response.`
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const workforce = overview?.workforce ?? {};
  const attendance = overview?.attendance ?? {};
  const attrition = overview?.attrition ?? {};

  const departmentData = departments.map((item) => ({
    name:
      item.department ??
      item.department_name ??
      item.name ??
      "Unassigned",
    employees: Number(
      item.employee_count ?? item.total_employees ?? 0
    ),
  }));

  const attendanceData = trend.map((item) => ({
    ...item,
    date: item.date ?? item.attendance_date ?? item.day ?? "",
    present: Number(item.present ?? item.present_count ?? 0),
    late: Number(item.late ?? item.late_count ?? 0),
    absent: Number(item.absent ?? item.absent_count ?? 0),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Workforce Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Analyze workforce distribution, attendance, and attrition.
          </p>
        </div>

        <button
          onClick={loadAnalytics}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsStat
          title="Total Employees"
          value={workforce.total_employees}
          icon={Users}
        />
        <AnalyticsStat
          title="Active Employees"
          value={workforce.active_employees}
          icon={Activity}
        />
        <AnalyticsStat
          title="Active Departments"
          value={workforce.total_active_departments}
          icon={Building2}
        />
        <AnalyticsStat
          title="Present Today"
          value={attendance.present}
          icon={Activity}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">
            Employees by Department
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Employee distribution across departments.
          </p>

          <div className="mt-5 h-72">
            {departmentData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="employees"
                    name="Employees"
                    fill="#6366f1"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                {loading ? "Loading..." : "No department data available."}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">
            Seven-Day Attendance Trend
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Present, late, and absent attendance records.
          </p>

          <div className="mt-5 h-72">
            {attendanceData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={attendanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="present"
                    name="Present"
                    stroke="#059669"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="late"
                    name="Late"
                    stroke="#6366f1"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="absent"
                    name="Absent"
                    stroke="#ea580c"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                {loading ? "Loading..." : "No attendance trend available."}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
        <h2 className="font-semibold text-slate-900">
          AI Attrition Summary
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-4">
            <p className="text-sm text-slate-500">Total Predictions</p>
            <p className="mt-2 text-2xl font-bold">
              {attrition.total_predictions ?? "—"}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4">
            <p className="text-sm text-slate-500">Predicted to Leave</p>
            <p className="mt-2 text-2xl font-bold">
              {attrition.predicted_to_leave ?? "—"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Analytics;
