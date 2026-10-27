
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  RefreshCw,
  Send,
  Megaphone,
  LoaderCircle,
  AlertCircle,
  Inbox,
  MailOpen,
  Filter,
} from "lucide-react";
import api from "../services/api";

const NOTIFICATION_TYPES = [
  "GENERAL",
  "LEAVE",
  "PAYROLL",
  "ATTENDANCE",
  "SYSTEM",
];

const EMPTY_ANNOUNCEMENT = {
  title: "",
  message: "",
  notification_type: "GENERAL",
};

function getErrorMessage(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || "Invalid input").join(", ");
  }

  return error?.message || "Something went wrong. Please try again.";
}

function formatDate(value) {
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

function typeStyle(type) {
  switch (String(type || "").toUpperCase()) {
    case "LEAVE":
      return "bg-purple-100 text-purple-800";
    case "PAYROLL":
      return "bg-green-100 text-green-800";
    case "ATTENDANCE":
      return "bg-blue-100 text-blue-800";
    case "SYSTEM":
      return "bg-gray-200 text-gray-800";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

function TypeBadge({ type }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${typeStyle(
        type
      )}`}
    >
      {type || "GENERAL"}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, iconStyle }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`rounded-xl p-3 ${iconStyle}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [sending, setSending] = useState(false);

  const [announcement, setAnnouncement] = useState(EMPTY_ANNOUNCEMENT);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const role = String(user?.role || "").toUpperCase();
  const canAnnounce = role === "ADMIN" || role === "HR";

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const userResponse = await api.get("/api/auth/me");
      setUser(userResponse.data);

      const [listResponse, countResponse] = await Promise.all([
        api.get("/api/notifications/", {
          params: {
            unread_only: unreadOnly,
            limit: 100,
            offset: 0,
          },
        }),
        api.get("/api/notifications/unread-count"),
      ]);

      setNotifications(listResponse.data?.notifications || []);
      setUnreadCount(countResponse.data?.unread_count || 0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function handleMarkRead(notificationId) {
    setError("");
    setSuccess("");
    setMarkingId(notificationId);

    try {
      await api.patch(`/api/notifications/${notificationId}/read`);

      setNotifications((previous) =>
        previous.map((item) =>
          item.id === notificationId
            ? { ...item, is_read: true, read_at: new Date().toISOString() }
            : item
        )
      );

      setUnreadCount((previous) => Math.max(0, previous - 1));
      setSuccess("Notification marked as read.");

      // Refresh to keep the unread-only filter and count in sync.
      await loadNotifications();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMarkingId(null);
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return;

    setError("");
    setSuccess("");
    setMarkingAll(true);

    try {
      const response = await api.patch("/api/notifications/read-all");

      setSuccess(
        response.data?.message || "All notifications marked as read."
      );

      await loadNotifications();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setMarkingAll(false);
    }
  }

  function handleAnnouncementChange(event) {
    const { name, value } = event.target;

    setAnnouncement((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleSendAnnouncement(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const title = announcement.title.trim();
    const message = announcement.message.trim();

    if (!title || !message) {
      setError("Please enter both an announcement title and message.");
      return;
    }

    const confirmed = window.confirm(
      "Send this announcement to all active users?"
    );

    if (!confirmed) return;

    setSending(true);

    try {
      const response = await api.post("/api/notifications/announcement", {
        title,
        message,
        notification_type: announcement.notification_type,
      });

      const recipients = response.data?.recipients_count;

      setSuccess(
        `${response.data?.message || "Announcement sent successfully."}${
          recipients !== undefined ? ` Recipients: ${recipients}.` : ""
        }`
      );

      setAnnouncement(EMPTY_ANNOUNCEMENT);
      await loadNotifications();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Bell className="text-blue-600" size={27} />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Stay up to date with announcements and workforce activities.
          </p>
          {user && (
            <p className="mt-1 text-xs text-gray-500">
              {user.full_name || user.email || "User"} · {role || "USER"}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={loadNotifications}
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
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Unread Notifications"
          value={unreadCount}
          icon={Bell}
          iconStyle="bg-blue-100 text-blue-700"
        />
        <StatCard
          label="Notifications Displayed"
          value={notifications.length}
          icon={Inbox}
          iconStyle="bg-purple-100 text-purple-700"
        />
      </div>

      {canAnnounce && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Megaphone className="text-blue-600" size={22} />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Send Announcement
              </h2>
              <p className="text-sm text-gray-500">
                Announcements are sent to all active users.
              </p>
            </div>
          </div>

          <form onSubmit={handleSendAnnouncement} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <label
                  htmlFor="announcement-title"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Title
                </label>
                <input
                  id="announcement-title"
                  name="title"
                  type="text"
                  minLength={1}
                  maxLength={200}
                  required
                  value={announcement.title}
                  onChange={handleAnnouncementChange}
                  placeholder="Enter announcement title"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="announcement-type"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  Notification Type
                </label>
                <select
                  id="announcement-type"
                  name="notification_type"
                  value={announcement.notification_type}
                  onChange={handleAnnouncementChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {NOTIFICATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="announcement-message"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Message
              </label>
              <textarea
                id="announcement-message"
                name="message"
                rows={4}
                minLength={1}
                maxLength={5000}
                required
                value={announcement.message}
                onChange={handleAnnouncementChange}
                placeholder="Write your announcement..."
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-right text-xs text-gray-400">
                {announcement.message.length}/5000
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? (
                  <LoaderCircle className="animate-spin" size={17} />
                ) : (
                  <Send size={17} />
                )}
                {sending ? "Sending..." : "Send to All Active Users"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Your Notifications
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Most recent notifications appear first.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
              <Filter size={16} />
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => setUnreadOnly(event.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Unread only
            </label>

            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll || unreadCount === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {markingAll ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <CheckCheck size={16} />
              )}
              Mark all read
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <LoaderCircle className="mr-3 animate-spin text-blue-600" size={25} />
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-12 text-center">
            <MailOpen className="mx-auto mb-3 text-gray-400" size={36} />
            <p className="font-medium text-gray-700">
              {unreadOnly
                ? "No unread notifications"
                : "No notifications yet"}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {unreadOnly
                ? "You are all caught up."
                : "New announcements and updates will appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((item) => (
              <article
                key={item.id}
                className={`rounded-xl border p-4 transition ${
                  item.is_read
                    ? "border-gray-200 bg-white"
                    : "border-blue-200 bg-blue-50/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-1 rounded-full p-2 ${
                      item.is_read
                        ? "bg-gray-100 text-gray-500"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    <Bell size={18} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className={`break-words text-sm ${
                          item.is_read
                            ? "font-medium text-gray-800"
                            : "font-bold text-gray-900"
                        }`}
                      >
                        {item.title}
                      </h3>
                      <TypeBadge type={item.notification_type} />
                      {!item.is_read && (
                        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                          New
                        </span>
                      )}
                    </div>

                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-600">
                      {item.message}
                    </p>

                    <p className="mt-3 text-xs text-gray-400">
                      {formatDate(item.created_at)}
                    </p>
                  </div>

                  {!item.is_read && (
                    <button
                      type="button"
                      title="Mark as read"
                      aria-label={`Mark notification ${item.id} as read`}
                      disabled={markingId === item.id}
                      onClick={() => handleMarkRead(item.id)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {markingId === item.id ? (
                        <LoaderCircle className="animate-spin" size={15} />
                      ) : (
                        <Check size={15} />
                      )}
                      <span className="hidden sm:inline">Mark read</span>
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && notifications.length === 100 && (
          <p className="mt-4 text-center text-xs text-gray-500">
            Showing up to 100 notifications. Older notifications may not be displayed.
          </p>
        )}
      </section>
    </div>
  );
}
