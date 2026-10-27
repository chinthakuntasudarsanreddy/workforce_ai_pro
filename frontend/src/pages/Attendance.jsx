
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Clock,
  LogIn,
  LogOut,
  RefreshCw,
  Plus,
  Users,
  BriefcaseBusiness,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import api from "../services/api";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDate = (value) => {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

const formatTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const hoursLabel = (minutes) => {
  const n = Number(minutes || 0);
  return `${Math.floor(n / 60)}h ${n % 60}m`;
};

const errorMessage = (error) =>
  error?.response?.data?.detail ||
  error?.response?.data?.message ||
  error?.message ||
  "Something went wrong. Please try again.";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function StatCard({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
        </div>
        <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
          <Icon size={21} />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="py-10 text-center">
      <CalendarDays className="mx-auto mb-3 text-slate-300" size={32} />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

export default function Attendance() {
  const [tab, setTab] = useState("attendance");
  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [overview, setOverview] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [employees, setEmployees] = useState([]);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [overviewDate, setOverviewDate] = useState(today());

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showShiftForm, setShowShiftForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    name: "",
    start_time: "09:00",
    end_time: "18:00",
    break_minutes: 60,
  });
  const [assignForm, setAssignForm] = useState({
    employee_id: "",
    shift_id: "",
    effective_from: today(),
    effective_until: "",
  });

  const role = String(user?.role || "").toUpperCase();
  const canManage = role === "ADMIN" || role === "HR";
  const canViewOverview = ["ADMIN", "HR", "MANAGER"].includes(role);

  const loadUser = useCallback(async () => {
    const response = await api.get("/api/auth/me");
    setUser(response.data);
    return response.data;
  }, []);

  const loadAttendance = useCallback(async () => {
    const params = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;

    const response = await api.get("/api/attendance/me", { params });
    setRecords(response.data?.records || []);
  }, [startDate, endDate]);

  const loadOverview = useCallback(async () => {
    if (!canViewOverview) return;
    const response = await api.get("/api/attendance/overview", {
      params: { attendance_date: overviewDate },
    });
    setOverview(response.data?.records || []);
  }, [canViewOverview, overviewDate]);

  const loadShifts = useCallback(async () => {
    const response = await api.get("/api/shifts/");
    setShifts(Array.isArray(response.data) ? response.data : []);
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!canViewOverview) return;
    const response = await api.get("/api/shifts/assignments");
    setAssignments(Array.isArray(response.data) ? response.data : []);
  }, [canViewOverview]);

  const loadEmployees = useCallback(async () => {
    if (!canManage) return;
    const response = await api.get("/api/employees/", {
      params: { page: 1, page_size: 100, employee_status: "ACTIVE" },
    });
    const data = response.data;
    setEmployees(Array.isArray(data) ? data : data?.items || []);
  }, [canManage]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const currentUser = await loadUser();
      const currentRole = String(currentUser?.role || "").toUpperCase();
      const isManager = ["ADMIN", "HR", "MANAGER"].includes(currentRole);
      const isHR = ["ADMIN", "HR"].includes(currentRole);

      const jobs = [
        api.get("/api/attendance/me", {
          params: {
            ...(startDate ? { start_date: startDate } : {}),
            ...(endDate ? { end_date: endDate } : {}),
          },
        }).then((r) => setRecords(r.data?.records || [])),
        api.get("/api/shifts/").then((r) =>
          setShifts(Array.isArray(r.data) ? r.data : [])
        ),
      ];

      if (isManager) {
        jobs.push(
          api.get("/api/attendance/overview", {
            params: { attendance_date: overviewDate },
          }).then((r) => setOverview(r.data?.records || [])),
          api.get("/api/shifts/assignments").then((r) =>
            setAssignments(Array.isArray(r.data) ? r.data : [])
          )
        );
      }

      if (isHR) {
        jobs.push(
          api.get("/api/employees/", {
            params: {
              page: 1,
              page_size: 100,
              employee_status: "ACTIVE",
            },
          }).then((r) => {
            const data = r.data;
            setEmployees(Array.isArray(data) ? data : data?.items || []);
          })
        );
      }

      const results = await Promise.allSettled(jobs);
      const failed = results.find((r) => r.status === "rejected");
      if (failed) setError(errorMessage(failed.reason));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loadUser, startDate, endDate, overviewDate]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const todayRecord = useMemo(
    () => records.find((r) => String(r.attendance_date).slice(0, 10) === today()),
    [records]
  );

  const workedMinutes = Number(todayRecord?.work_minutes || 0);
  const attendanceCount = records.length;
  const completedDays = records.filter((r) => r.clock_in && r.clock_out).length;

  const doClockAction = async (action) => {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const response = await api.post(`/api/attendance/${action}`);
      setNotice(response.data?.message || "Attendance updated successfully.");
      await refreshAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const createShift = async (event) => {
    event.preventDefault();
    setBusy("create-shift");
    setError("");
    setNotice("");
    try {
      const response = await api.post("/api/shifts/", {
        ...shiftForm,
        break_minutes: Number(shiftForm.break_minutes),
      });
      setNotice(response.data?.message || "Shift created successfully.");
      setShiftForm({
        name: "",
        start_time: "09:00",
        end_time: "18:00",
        break_minutes: 60,
      });
      setShowShiftForm(false);
      await loadShifts();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const assignShift = async (event) => {
    event.preventDefault();
    setBusy("assign-shift");
    setError("");
    setNotice("");
    try {
      const payload = {
        employee_id: Number(assignForm.employee_id),
        shift_id: Number(assignForm.shift_id),
        effective_from: assignForm.effective_from,
        effective_until: assignForm.effective_until || null,
      };
      const response = await api.post("/api/shifts/assign", payload);
      setNotice(response.data?.message || "Shift assigned successfully.");
      setShowAssignForm(false);
      setAssignForm({
        employee_id: "",
        shift_id: "",
        effective_from: today(),
        effective_until: "",
      });
      await loadAssignments();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy("");
    }
  };

  const shiftById = useMemo(
    () => Object.fromEntries(shifts.map((s) => [s.id, s])),
    [shifts]
  );
  const employeeById = useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees]
  );

  const tabs = [
    { id: "attendance", label: "My Attendance" },
    ...(canViewOverview ? [{ id: "overview", label: "Team Overview" }] : []),
    { id: "shifts", label: "Shifts" },
    ...(canViewOverview ? [{ id: "assignments", label: "Assignments" }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-indigo-600">
            Workforce Management
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Attendance & Shifts
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Record your working hours and manage shift schedules.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={loading}
          className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Could not complete the request</p>
            <p className="mt-1 break-words">{error}</p>
            {String(error).toLowerCase().includes("employee profile") && (
              <p className="mt-2">
                Ask ADMIN/HR to link your login account to an active employee
                profile before recording attendance.
              </p>
            )}
          </div>
          <button onClick={() => setError("")} className="text-xs font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button
            onClick={() => setNotice("")}
            className="ml-auto text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's status"
          value={todayRecord?.clock_out ? "Completed" : todayRecord?.clock_in ? "Working" : "Not started"}
          detail={todayRecord?.status || "No clock-in recorded"}
          icon={Activity}
        />
        <StatCard
          label="Clock-in"
          value={formatTime(todayRecord?.clock_in)}
          detail="Today's check-in"
          icon={LogIn}
        />
        <StatCard
          label="Clock-out"
          value={formatTime(todayRecord?.clock_out)}
          detail="Today's check-out"
          icon={LogOut}
        />
        <StatCard
          label="Recorded work time"
          value={hoursLabel(workedMinutes)}
          detail={`${attendanceCount} attendance record(s) loaded`}
          icon={Clock}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-900">Today's attendance</h2>
            <p className="mt-1 text-sm text-slate-500">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={Boolean(busy) || Boolean(todayRecord?.clock_in)}
              onClick={() => doClockAction("clock-in")}
              className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-700`}
            >
              <LogIn size={17} />
              {busy === "clock-in" ? "Clocking in..." : "Clock In"}
            </button>
            <button
              type="button"
              disabled={
                Boolean(busy) ||
                !todayRecord?.clock_in ||
                Boolean(todayRecord?.clock_out)
              }
              onClick={() => doClockAction("clock-out")}
              className={`${buttonClass} bg-slate-900 text-white hover:bg-slate-800`}
            >
              <LogOut size={17} />
              {busy === "clock-out" ? "Clocking out..." : "Clock Out"}
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Clock-in time</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {formatTime(todayRecord?.clock_in)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Clock-out time</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {formatTime(todayRecord?.clock_out)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Total recorded</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {hoursLabel(workedMinutes)}
            </p>
          </div>
        </div>
        {todayRecord?.clock_in && !todayRecord?.clock_out && (
          <p className="mt-3 text-xs text-amber-700">
            Your shift is in progress. Clock out when your workday is complete.
          </p>
        )}
      </div>

      <div className="border-b border-slate-200">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
                tab === item.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "attendance" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="font-semibold text-slate-900">Attendance history</h2>
              <p className="mt-1 text-sm text-slate-500">
                Review your recorded check-in and check-out times.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-500">
                Start date
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs text-slate-500">
                End date
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Clock in</th>
                  <th className="px-3 py-3">Clock out</th>
                  <th className="px-3 py-3">Work time</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-4 font-medium text-slate-800">
                      {formatDate(record.attendance_date)}
                    </td>
                    <td className="px-3 py-4">{formatTime(record.clock_in)}</td>
                    <td className="px-3 py-4">{formatTime(record.clock_out)}</td>
                    <td className="px-3 py-4">
                      {hoursLabel(record.work_minutes)}
                    </td>
                    <td className="px-3 py-4">
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                        {record.status || "—"}
                      </span>
                    </td>
                    <td className="max-w-40 truncate px-3 py-4 text-slate-500">
                      {record.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && records.length === 0 && (
              <EmptyState message="No attendance records found for this date range." />
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {completedDays} completed day(s) among the records currently loaded.
          </p>
        </section>
      )}

      {tab === "overview" && canViewOverview && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-semibold text-slate-900">Team attendance overview</h2>
              <p className="mt-1 text-sm text-slate-500">
                Attendance records available for the selected date.
              </p>
            </div>
            <label className="text-xs text-slate-500">
              Attendance date
              <input
                type="date"
                value={overviewDate}
                onChange={(e) => setOverviewDate(e.target.value)}
                className={`${inputClass} mt-1`}
              />
            </label>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Employee ID</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Clock in</th>
                  <th className="px-3 py-3">Clock out</th>
                  <th className="px-3 py-3">Work time</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {overview.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-4 font-semibold">#{record.employee_id}</td>
                    <td className="px-3 py-4">{formatDate(record.attendance_date)}</td>
                    <td className="px-3 py-4">{formatTime(record.clock_in)}</td>
                    <td className="px-3 py-4">{formatTime(record.clock_out)}</td>
                    <td className="px-3 py-4">{hoursLabel(record.work_minutes)}</td>
                    <td className="px-3 py-4">{record.status || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && overview.length === 0 && (
              <EmptyState message="No team attendance records found for this date." />
            )}
          </div>
        </section>
      )}

      {tab === "shifts" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold text-slate-900">Available shifts</h2>
              <p className="mt-1 text-sm text-slate-500">
                Active shifts configured in the system.
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => setShowShiftForm((v) => !v)}
                className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-700`}
              >
                <Plus size={16} />
                {showShiftForm ? "Cancel" : "Create shift"}
              </button>
            )}
          </div>

          {showShiftForm && canManage && (
            <form onSubmit={createShift} className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-slate-600">
                Shift name
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  className={`${inputClass} mt-1`}
                  placeholder="General shift"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Start time
                <input
                  type="time"
                  required
                  value={shiftForm.start_time}
                  onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                End time
                <input
                  type="time"
                  required
                  value={shiftForm.end_time}
                  onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Break (minutes)
                <input
                  type="number"
                  min="0"
                  max="240"
                  value={shiftForm.break_minutes}
                  onChange={(e) => setShiftForm({ ...shiftForm, break_minutes: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <div className="sm:col-span-2 lg:col-span-4">
                <button
                  type="submit"
                  disabled={busy === "create-shift"}
                  className={`${buttonClass} bg-slate-900 text-white hover:bg-slate-800`}
                >
                  {busy === "create-shift" ? "Saving..." : "Save shift"}
                </button>
              </div>
            </form>
          )}

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shifts.map((shift) => (
              <div key={shift.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                    <Clock size={20} />
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Active
                  </span>
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{shift.name}</h3>
                <p className="mt-2 text-sm text-slate-600">
                  {String(shift.start_time).slice(0, 5)} – {String(shift.end_time).slice(0, 5)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Break: {shift.break_minutes ?? 0} minutes
                </p>
                <p className="mt-1 text-xs text-slate-400">Shift ID: {shift.id}</p>
              </div>
            ))}
          </div>
          {!loading && shifts.length === 0 && (
            <EmptyState message="No active shifts found. ADMIN/HR can create the first shift." />
          )}
        </section>
      )}

      {tab === "assignments" && canViewOverview && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-semibold text-slate-900">Shift assignments</h2>
              <p className="mt-1 text-sm text-slate-500">
                Review current assignments and their effective dates.
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => setShowAssignForm((v) => !v)}
                className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-700`}
              >
                <Users size={16} />
                {showAssignForm ? "Cancel" : "Assign shift"}
              </button>
            )}
          </div>

          {showAssignForm && canManage && (
            <form onSubmit={assignShift} className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-slate-600">
                Employee
                <select
                  required
                  value={assignForm.employee_id}
                  onChange={(e) => setAssignForm({ ...assignForm, employee_id: e.target.value })}
                  className={`${inputClass} mt-1`}
                >
                  <option value="">Select employee</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name || employee.name || `Employee #${employee.id}`} (#{employee.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Shift
                <select
                  required
                  value={assignForm.shift_id}
                  onChange={(e) => setAssignForm({ ...assignForm, shift_id: e.target.value })}
                  className={`${inputClass} mt-1`}
                >
                  <option value="">Select shift</option>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Effective from
                <input
                  type="date"
                  required
                  value={assignForm.effective_from}
                  onChange={(e) => setAssignForm({ ...assignForm, effective_from: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Effective until (optional)
                <input
                  type="date"
                  min={assignForm.effective_from}
                  value={assignForm.effective_until}
                  onChange={(e) => setAssignForm({ ...assignForm, effective_until: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              {employees.length === 0 && (
                <p className="text-xs text-amber-700 sm:col-span-2 lg:col-span-4">
                  No active employees were loaded. Check employee permissions and ensure active employees exist.
                </p>
              )}
              <div className="sm:col-span-2 lg:col-span-4">
                <button
                  type="submit"
                  disabled={
                    busy === "assign-shift" ||
                    employees.length === 0 ||
                    shifts.length === 0
                  }
                  className={`${buttonClass} bg-slate-900 text-white hover:bg-slate-800`}
                >
                  {busy === "assign-shift" ? "Assigning..." : "Save assignment"}
                </button>
              </div>
            </form>
          )}

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Employee</th>
                  <th className="px-3 py-3">Shift</th>
                  <th className="px-3 py-3">Effective from</th>
                  <th className="px-3 py-3">Effective until</th>
                  <th className="px-3 py-3">Assignment ID</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const employee = employeeById[assignment.employee_id];
                  const shift = shiftById[assignment.shift_id];
                  return (
                    <tr key={assignment.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-4">
                        {employee?.full_name || employee?.name || `Employee #${assignment.employee_id}`}
                      </td>
                      <td className="px-3 py-4">
                        {shift?.name || `Shift #${assignment.shift_id}`}
                      </td>
                      <td className="px-3 py-4">{formatDate(assignment.effective_from)}</td>
                      <td className="px-3 py-4">{formatDate(assignment.effective_until)}</td>
                      <td className="px-3 py-4 text-slate-500">#{assignment.id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && assignments.length === 0 && (
              <EmptyState message="No active shift assignments found." />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
