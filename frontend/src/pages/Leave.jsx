
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  LoaderCircle,
  RefreshCw,
  Send,
  XCircle,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import api from "../services/api";

const LEAVE_TYPES = [
  { value: "ANNUAL", label: "Annual Leave" },
  { value: "SICK", label: "Sick Leave" },
  { value: "CASUAL", label: "Casual Leave" },
  { value: "UNPAID", label: "Unpaid Leave" },
  { value: "OTHER", label: "Other" },
];

const EMPTY_FORM = {
  start_date: "",
  end_date: "",
  leave_type: "CASUAL",
  reason: "",
};

function getErrorMessage(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item.msg || "Invalid input")
      .join(", ");
  }

  return error?.message || "Something went wrong. Please try again.";
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusClasses(status) {
  switch (String(status || "").toUpperCase()) {
    case "APPROVED":
      return "bg-green-100 text-green-800";
    case "REJECTED":
      return "bg-red-100 text-red-800";
    case "PENDING":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
        status
      )}`}
    >
      {status || "UNKNOWN"}
    </span>
  );
}

function StatCard({ title, count, icon: Icon, color }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{count}</p>
        </div>
        <div className={`rounded-xl p-3 ${color}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

export default function Leave() {
  const [user, setUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [myLeaves, setMyLeaves] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewComments, setReviewComments] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const role = String(user?.role || "").toUpperCase();
  const isAdminOrHR = role === "ADMIN" || role === "HR";

  const stats = useMemo(() => {
    const all = myLeaves || [];

    return {
      total: all.length,
      pending: all.filter(
        (item) => item.status?.toUpperCase() === "PENDING"
      ).length,
      approved: all.filter(
        (item) => item.status?.toUpperCase() === "APPROVED"
      ).length,
      rejected: all.filter(
        (item) => item.status?.toUpperCase() === "REJECTED"
      ).length,
    };
  }, [myLeaves]);

  const loadLeaves = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const userResponse = await api.get("/api/auth/me");
      const currentUser = userResponse.data;
      setUser(currentUser);

      const currentRole = String(currentUser?.role || "").toUpperCase();
      const canReview = ["ADMIN", "HR"].includes(currentRole);

      const requests = [
        api.get("/api/leave/my"),
        ...(canReview ? [api.get("/api/leave/pending")] : []),
      ];

      const responses = await Promise.all(requests);

      setMyLeaves(responses[0]?.data?.leave_requests || []);
      setPendingLeaves(
        canReview ? responses[1]?.data?.leave_requests || [] : []
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.start_date || !form.end_date) {
      setError("Please select both the start date and end date.");
      return;
    }

    if (form.end_date < form.start_date) {
      setError("End date cannot be before start date.");
      return;
    }

    if (form.reason.trim().length < 3) {
      setError("Please provide a meaningful reason of at least 3 characters.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        start_date: form.start_date,
        end_date: form.end_date,
        leave_type: form.leave_type,
        reason: form.reason.trim(),
      };

      const response = await api.post("/api/leave/apply", payload);

      setSuccess(
        response.data?.message || "Leave application submitted successfully."
      );
      setForm(EMPTY_FORM);

      await loadLeaves();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(leaveId, decision) {
    setError("");
    setSuccess("");

    const action = decision === "APPROVED" ? "approve" : "reject";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} leave request #${leaveId}?`
    );

    if (!confirmed) return;

    setReviewingId(leaveId);

    try {
      const payload = {
        decision,
        review_comment: (reviewComments[leaveId] || "").trim() || null,
      };

      const response = await api.patch(
        `/api/leave/${leaveId}/review`,
        payload
      );

      setSuccess(
        response.data?.message ||
          `Leave request ${decision.toLowerCase()} successfully.`
      );

      setReviewComments((previous) => {
        const updated = { ...previous };
        delete updated[leaveId];
        return updated;
      });

      await loadLeaves();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setReviewingId(null);
    }
  }

  function updateReviewComment(leaveId, value) {
    setReviewComments((previous) => ({
      ...previous,
      [leaveId]: value,
    }));
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <LoaderCircle className="animate-spin text-blue-600" size={32} />
        <span className="ml-3 text-gray-600">Loading leave management...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Leave Management
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Apply for leave, track your requests, and review pending applications.
          </p>
          {user && (
            <p className="mt-1 text-xs text-gray-500">
              Signed in as {user.full_name || user.email || "User"} · {role || "USER"}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={loadLeaves}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="My Applications"
          count={stats.total}
          icon={FileText}
          color="bg-blue-100 text-blue-700"
        />
        <StatCard
          title="Pending"
          count={stats.pending}
          icon={Clock3}
          color="bg-amber-100 text-amber-700"
        />
        <StatCard
          title="Approved"
          count={stats.approved}
          icon={CheckCircle2}
          color="bg-green-100 text-green-700"
        />
        <StatCard
          title="Rejected"
          count={stats.rejected}
          icon={XCircle}
          color="bg-red-100 text-red-700"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm xl:col-span-1">
          <div className="mb-5 flex items-center gap-2">
            <CalendarDays className="text-blue-600" size={21} />
            <h2 className="text-lg font-semibold text-gray-900">
              Apply for Leave
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="leave_type"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Leave Type
              </label>
              <select
                id="leave_type"
                name="leave_type"
                value={form.leave_type}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {LEAVE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="start_date"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Start Date
              </label>
              <input
                id="start_date"
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label
                htmlFor="end_date"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                End Date
              </label>
              <input
                id="end_date"
                type="date"
                name="end_date"
                min={form.start_date || undefined}
                value={form.end_date}
                onChange={handleChange}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label
                htmlFor="reason"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Reason
              </label>
              <textarea
                id="reason"
                name="reason"
                rows={4}
                minLength={3}
                maxLength={2000}
                value={form.reason}
                onChange={handleChange}
                required
                placeholder="Explain why you need leave..."
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-right text-xs text-gray-400">
                {form.reason.length}/2000
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : (
                <Send size={17} />
              )}
              {submitting ? "Submitting..." : "Submit Leave Request"}
            </button>
          </form>
        </section>

        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-5 flex items-center gap-2">
            <FileText className="text-blue-600" size={21} />
            <h2 className="text-lg font-semibold text-gray-900">
              My Leave History
            </h2>
          </div>

          {myLeaves.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center">
              <CalendarDays className="mx-auto mb-3 text-gray-400" size={32} />
              <p className="font-medium text-gray-700">No leave applications yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Submit a leave request using the form.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Dates</th>
                    <th className="px-3 py-3">Reason</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Review Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {myLeaves.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-gray-100 align-top last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-3 py-4 font-medium text-gray-900">
                        {item.leave_type}
                        <p className="mt-1 text-xs text-gray-400">
                          Request #{item.id}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-gray-600">
                        {formatDate(item.start_date)}
                        <div className="my-1 text-xs text-gray-400">to</div>
                        {formatDate(item.end_date)}
                      </td>
                      <td className="max-w-48 px-3 py-4 text-gray-600">
                        <p className="break-words">{item.reason}</p>
                        <p className="mt-2 text-xs text-gray-400">
                          Submitted: {formatDateTime(item.created_at)}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <StatusBadge status={item.status} />
                        {item.reviewed_at && (
                          <p className="mt-2 text-xs text-gray-400">
                            Reviewed: {formatDateTime(item.reviewed_at)}
                          </p>
                        )}
                      </td>
                      <td className="max-w-48 px-3 py-4 text-gray-600">
                        {item.review_comment || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {isAdminOrHR && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Pending Leave Requests
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Review applications submitted by active employees.
              </p>
            </div>
            <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
              {pendingLeaves.length} pending
            </span>
          </div>

          {pendingLeaves.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center">
              <CheckCircle2 className="mx-auto mb-3 text-green-500" size={32} />
              <p className="font-medium text-gray-700">
                No pending leave requests
              </p>
              <p className="mt-1 text-sm text-gray-500">
                New requests will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingLeaves.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-gray-200 p-4 sm:p-5"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900">
                          Leave Request #{item.id}
                        </h3>
                        <StatusBadge status={item.status} />
                      </div>

                      <p className="mt-2 text-sm text-gray-600">
                        Employee ID: {item.employee_id}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        Type: <strong>{item.leave_type}</strong>
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        {formatDate(item.start_date)} – {formatDate(item.end_date)}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Submitted: {formatDateTime(item.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Reason
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">
                      {item.reason}
                    </p>
                  </div>

                  <div className="mt-4">
                    <label
                      htmlFor={`review-comment-${item.id}`}
                      className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700"
                    >
                      <MessageSquare size={16} />
                      Review Comment (optional)
                    </label>
                    <textarea
                      id={`review-comment-${item.id}`}
                      rows={2}
                      maxLength={2000}
                      value={reviewComments[item.id] || ""}
                      onChange={(event) =>
                        updateReviewComment(item.id, event.target.value)
                      }
                      placeholder="Add a comment for the employee..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      disabled={reviewingId === item.id}
                      onClick={() => handleReview(item.id, "REJECTED")}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {reviewingId === item.id ? (
                        <LoaderCircle className="animate-spin" size={17} />
                      ) : (
                        <XCircle size={17} />
                      )}
                      Reject
                    </button>

                    <button
                      type="button"
                      disabled={reviewingId === item.id}
                      onClick={() => handleReview(item.id, "APPROVED")}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {reviewingId === item.id ? (
                        <LoaderCircle className="animate-spin" size={17} />
                      ) : (
                        <CheckCircle2 size={17} />
                      )}
                      Approve
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
