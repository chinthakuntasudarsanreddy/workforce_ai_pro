import { useCallback, useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";

import {
  Activity,
  AlertCircle,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  DollarSign,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Users,
  X,
  BrainCircuit,
  LockKeyhole,
  Mail,
  ArrowRight,
  RefreshCw,
  BarChart3,
  Database,
  FileBarChart,
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

import api from "./services/api";

import Employees from "./pages/Employees";
import Departments from "./pages/Departments";
import Attendance from "./pages/Attendance";
import Leave from "./pages/Leave";
import Payroll from "./pages/Payroll";
import Notifications from "./pages/Notifications";
import Attrition from "./pages/Attrition";
import Chat from "./pages/Chat";
import Analytics from "./pages/Analytics";
import Datasets from "./pages/Datasets";
import Reports from "./pages/Reports";

const navigation = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Workforce Analytics", path: "/analytics", icon: BarChart3 },
  { label: "Reports", path: "/reports", icon: FileBarChart },
  { label: "Dataset Management", path: "/datasets", icon: Database },
  { label: "Employees", path: "/employees", icon: Users },
  { label: "Departments", path: "/departments", icon: Building2 },
  { label: "Attendance", path: "/attendance", icon: Clock },
  { label: "Leave Management", path: "/leave", icon: CalendarDays },
  { label: "Payroll", path: "/payroll", icon: DollarSign },
  { label: "Notifications", path: "/notifications", icon: Bell },
  { label: "Team Chat", path: "/chat", icon: MessageCircle },
  { label: "AI Attrition", path: "/attrition", icon: BrainCircuit },
];

function getErrorMessage(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item.msg || JSON.stringify(item))
      .join(", ");
  }

  return (
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/api/auth/login", {
        email: email.trim(),
        password,
      });

      const token =
        response.data?.access_token ||
        response.data?.token;

      if (!token) {
        throw new Error(
          "The login response did not contain an access token."
        );
      }

      localStorage.setItem("workforce_access_token", token);

      try {
        const profileResponse = await api.get("/api/auth/me");
        onLogin(profileResponse.data);
      } catch (profileError) {
        localStorage.removeItem("workforce_access_token");
        throw profileError;
      }
    } catch (loginError) {
      setError(getErrorMessage(loginError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-gradient-to-br from-indigo-700 to-violet-900 p-10 text-white md:flex">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/15 p-3">
              <Activity size={28} />
            </div>
            <div>
              <h1 className="text-xl font-bold">WorkForce AI Pro</h1>
              <p className="text-sm text-indigo-200">
                Workforce Intelligence Platform
              </p>
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-4xl font-bold leading-tight">
              Manage your workforce with confidence.
            </h2>
            <p className="text-indigo-100">
              Employees, attendance, payroll, communication, and
              AI-powered workforce analytics in one place.
            </p>
          </div>

          <p className="text-sm text-indigo-200">
            Workforce management made smarter.
          </p>
        </div>

        <div className="p-7 sm:p-10">
          <div className="mb-8 md:hidden">
            <div className="mb-3 inline-flex rounded-xl bg-indigo-100 p-3 text-indigo-700">
              <Activity size={28} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              WorkForce AI Pro
            </h1>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">
            Welcome back
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to access your workforce dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Email address
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 focus-within:border-indigo-500">
                <Mail size={18} className="text-slate-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="w-full py-3 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 focus-within:border-indigo-500">
                <LockKeyhole size={18} className="text-slate-400" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="w-full py-3 outline-none"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, description }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <h3 className="mt-3 text-3xl font-bold text-slate-900">
            {value ?? "—"}
          </h3>
          {description && (
            <p className="mt-2 text-xs text-slate-500">{description}</p>
          )}
        </div>
        <div className={`rounded-xl p-3 ${color}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [attendanceTrend, setAttendanceTrend] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    const requests = await Promise.allSettled([
      api.get("/api/analytics/overview"),
      api.get("/api/analytics/departments"),
      api.get("/api/analytics/attendance-trend?days=7"),
      api.get("/api/leave/pending"),
    ]);

    const failed = [];

    if (requests[0].status === "fulfilled") {
      setOverview(requests[0].value.data);
    } else {
      failed.push("workforce overview");
    }

    if (requests[1].status === "fulfilled") {
      const data = requests[1].value.data;
      setDepartments(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.departments)
            ? data.departments
            : Array.isArray(data?.items)
              ? data.items
              : []
      );
    } else {
      failed.push("department analytics");
    }

    if (requests[2].status === "fulfilled") {
      const data = requests[2].value.data;
      setAttendanceTrend(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.trend)
            ? data.trend
            : Array.isArray(data?.items)
              ? data.items
              : []
      );
    } else {
      failed.push("attendance trend");
    }

    if (requests[3].status === "fulfilled") {
      const data = requests[3].value.data;

      if (typeof data === "number") {
        setPendingLeaves(data);
      } else if (typeof data?.pending_count === "number") {
        setPendingLeaves(data.pending_count);
      } else if (typeof data?.total === "number") {
        setPendingLeaves(data.total);
      } else if (Array.isArray(data)) {
        setPendingLeaves(data.length);
      } else if (Array.isArray(data?.items)) {
        setPendingLeaves(data.items.length);
      } else if (Array.isArray(data?.leaves)) {
        setPendingLeaves(data.leaves.length);
      } else if (Array.isArray(data?.pending_leaves)) {
        setPendingLeaves(data.pending_leaves.length);
      } else {
        setPendingLeaves(null);
      }
    } else {
      failed.push("pending leaves");
      setPendingLeaves(null);
    }

    if (failed.length) {
      setError(
        `Some information could not be loaded: ${failed.join(
          ", "
        )}. Check the browser Network tab for the failed API request.`
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const workforce = overview?.workforce || {};
  const attendance = overview?.attendance || {};
  const attrition = overview?.attrition || {};

  const numberOrDash = (value) =>
    value === undefined || value === null ? "—" : value;

  const departmentChartData = departments.map((item) => ({
    ...item,
    department:
      item.department ??
      item.department_name ??
      item.name ??
      "Unassigned",
    employee_count: Number(
      item.employee_count ?? item.total_employees ?? 0
    ),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Overview of your workforce and daily operations.
          </p>
        </div>

        <button
          onClick={loadDashboard}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Employees"
          value={loading && !overview ? "..." : numberOrDash(workforce.total_employees)}
          icon={Users}
          color="bg-indigo-100 text-indigo-700"
          description={`${workforce.active_employees ?? 0} active employees`}
        />

        <StatCard
          title="Departments"
          value={loading && !overview ? "..." : numberOrDash(workforce.total_active_departments)}
          icon={Building2}
          color="bg-sky-100 text-sky-700"
          description="Active departments"
        />

        <StatCard
          title="Present Today"
          value={loading && !overview ? "..." : numberOrDash(attendance.present)}
          icon={CheckCircle2}
          color="bg-emerald-100 text-emerald-700"
          description={`${attendance.late ?? 0} late arrivals`}
        />

        <StatCard
          title="Pending Leaves"
          value={loading && pendingLeaves === null ? "..." : numberOrDash(pendingLeaves)}
          icon={CalendarDays}
          color="bg-amber-100 text-amber-700"
          description="Awaiting review"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="font-semibold text-slate-900">
              Employees by Department
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Workforce distribution across active departments.
            </p>
          </div>

          <div className="h-72">
            {departmentChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="department" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="employee_count"
                    name="Employees"
                    fill="#6366f1"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                {loading ? "Loading department data..." : "No department data available."}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="font-semibold text-slate-900">
              Attendance Trend
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Daily attendance records for the last seven days.
            </p>
          </div>

          <div className="h-72">
            {attendanceTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="present" name="Present" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="late" name="Late" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="absent" name="Absent" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                {loading ? "Loading attendance data..." : "No attendance trend available."}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <BrainCircuit size={20} className="text-indigo-600" />
              AI Workforce Intelligence
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Review attrition predictions and risk statistics generated by
              your workforce intelligence model.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <div className="rounded-xl border border-indigo-100 bg-white/80 px-4 py-3">
                <p className="text-xs text-slate-500">Total Predictions</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {numberOrDash(attrition.total_predictions)}
                </p>
              </div>

              <div className="rounded-xl border border-indigo-100 bg-white/80 px-4 py-3">
                <p className="text-xs text-slate-500">Predicted to Leave</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {numberOrDash(attrition.predicted_to_leave)}
                </p>
              </div>

              <div className="rounded-xl border border-indigo-100 bg-white/80 px-4 py-3">
                <p className="text-xs text-slate-500">Employees on Leave</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {numberOrDash(workforce.employees_on_leave)}
                </p>
              </div>
            </div>
          </div>

          <NavLink
            to="/attrition"
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Open AI Attrition
          </NavLink>
        </div>
      </section>
    </div>
  );
}

function AppLayout({ user, onLogout }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("workforce_access_token");
    onLogout();
    navigate("/login", { replace: true });
  };

  const displayName =
    user?.full_name ||
    user?.name ||
    user?.email ||
    "User";

  const role = user?.role || "EMPLOYEE";

  return (
    <div className="min-h-screen bg-slate-50">
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-950 text-white transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-500 p-2">
              <Activity size={23} />
            </div>
            <div>
              <h1 className="font-bold">WorkForce AI Pro</h1>
              <p className="text-xs text-slate-400">
                Workforce Intelligence
              </p>
            </div>
          </div>

          <button
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 hover:bg-white/10 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-500/20 font-bold text-indigo-200">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-slate-400">
                {role}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Workspace
          </p>

          {navigation.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => setSidebarOpen(false)}
              end={path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-950/30"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-300 transition hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut size={19} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={22} />
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Workforce Management
              </p>
              <p className="hidden text-xs text-slate-500 sm:block">
                Manage your organization in one place
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NavLink
              to="/notifications"
              aria-label="Notifications"
              className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
            >
              <Bell size={19} />
            </NavLink>
            <div className="hidden text-right sm:block">
              <p className="max-w-40 truncate text-sm font-semibold text-slate-800">
                {displayName}
              </p>
              <p className="text-xs text-slate-500">{role}</p>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/datasets" element={<Datasets />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/departments" element={<Departments />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/leave" element={<Leave />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/attrition" element={<Attrition />} />

            <Route
              path="/profile"
              element={
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h1 className="text-xl font-bold text-slate-900">
                    My Profile
                  </h1>
                  <p className="mt-2 text-slate-600">{displayName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {user?.email || ""}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Role: {role}
                  </p>
                </div>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      const token = localStorage.getItem("workforce_access_token");

      if (!token) {
        if (!cancelled) setCheckingSession(false);
        return;
      }

      try {
        const response = await api.get("/api/auth/me");
        if (!cancelled) setUser(response.data);
      } catch {
        localStorage.removeItem("workforce_access_token");
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    };

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <RefreshCw
            className="mx-auto animate-spin text-indigo-600"
            size={32}
          />
          <p className="mt-3 text-sm text-slate-500">
            Loading your workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <Login onLogin={setUser} />
            )
          }
        />

        <Route
          path="/*"
          element={
            user ? (
              <AppLayout user={user} onLogout={() => setUser(null)} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
