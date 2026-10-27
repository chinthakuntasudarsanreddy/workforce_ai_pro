
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  Send,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import api from "../services/api";

function getError(error) {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string"
    ? detail
    : detail
      ? JSON.stringify(detail)
      : error?.message || "Request failed.";
}

function getToken() {
  return localStorage.getItem("workforce_access_token");
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default function Chat() {
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const socketRef = useRef(null);
  const selectedRef = useRef(null);
  const bottomRef = useRef(null);
  const seenIdsRef = useRef(new Set());

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const loadUnread = useCallback(async () => {
    try {
      const response = await api.get("/api/chat/unread-count");
      setUnreadCount(response.data?.unread_count || 0);
    } catch {
      // The chat screen remains usable if the unread count fails.
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      setError("");
      const response = await api.get("/api/chat/contacts");
      const list = Array.isArray(response.data) ? response.data : [];
      setContacts(list);
      setSelected((current) => {
        if (current && list.some((item) => item.id === current.id)) {
          return current;
        }
        return null;
      });
    } catch (err) {
      setError(getError(err));
    }
  }, []);

  const loadHistory = useCallback(async (contactId) => {
    setLoading(true);
    setError("");
    seenIdsRef.current = new Set();

    try {
      const response = await api.get(
        `/api/chat/messages/${contactId}?limit=100&offset=0`
      );

      const list = Array.isArray(response.data) ? response.data : [];
      list.forEach((message) => seenIdsRef.current.add(message.id));
      setMessages(list);

      // Mark received messages as read.
      const incomingUnread = list.filter(
        (message) =>
          message.sender_user_id === contactId &&
          message.read_at == null
      );

      await Promise.allSettled(
        incomingUnread.map((message) =>
          api.patch(`/api/chat/messages/${message.id}/read`)
        )
      );

      await loadUnread();
    } catch (err) {
      setMessages([]);
      setError(getError(err));
    } finally {
      setLoading(false);
    }
  }, [loadUnread]);

  useEffect(() => {
    loadContacts();
    loadUnread();
  }, [loadContacts, loadUnread]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }

    loadHistory(selected.id);
  }, [selected, loadHistory]);

  useEffect(() => {
    if (!selected) return;

    const token = getToken();
    if (!token) {
      setError("Please log in again to use chat.");
      return;
    }

    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${scheme}//${window.location.hostname}:8000/api/chat/ws/${selected.id}?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = () => {
      setConnected(false);
      setError("WebSocket connection failed. Check that the backend is running.");
    };

    socket.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        const message = payload.message;

        if (payload.type === "error") {
          setError(payload.detail || "Chat error.");
          return;
        }

        if (!message) return;

        if (payload.type === "read_receipt") {
          setMessages((current) =>
            current.map((item) =>
              item.id === message.id ? message : item
            )
          );
          return;
        }

        if (
          payload.type === "new_message" ||
          payload.type === "message_sent"
        ) {
          if (!seenIdsRef.current.has(message.id)) {
            seenIdsRef.current.add(message.id);
            setMessages((current) => [...current, message]);
          }

          const activeContact = selectedRef.current;
          const isIncoming =
            message.recipient_user_id === getCurrentUserIdFromMessage(
              message,
              activeContact
            ) &&
            message.sender_user_id === activeContact?.id;

          if (payload.type === "new_message" && isIncoming) {
            try {
              await api.patch(`/api/chat/messages/${message.id}/read`);
              await loadUnread();
            } catch {
              // The unread counter can be refreshed later.
            }
          }

          if (payload.type === "new_message") {
            loadUnread();
          }
        }
      } catch {
        setError("Received an invalid WebSocket response.");
      }
    };

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setConnected(false);
    };
  }, [selected, loadUnread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(event) {
    event.preventDefault();
    const messageText = draft.trim();

    if (!messageText || !selected || sending) return;

    setError("");
    setSending(true);

    try {
      // REST is used to send so that the backend persists the message once.
      const response = await api.post("/api/chat/messages", {
        recipient_user_id: selected.id,
        message: messageText,
      });

      const message = response.data;
      if (!seenIdsRef.current.has(message.id)) {
        seenIdsRef.current.add(message.id);
        setMessages((current) => [...current, message]);
      }

      setDraft("");
      await loadUnread();
    } catch (err) {
      setError(getError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Chat</h1>
          <p className="mt-1 text-sm text-slate-500">
            Communicate with active users in real time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700">
            Unread: {unreadCount}
          </span>
          <button
            onClick={() => {
              loadContacts();
              loadUnread();
              if (selected) loadHistory(selected.id);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid h-[70vh] min-h-[500px] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:grid-cols-[280px_1fr]">
        <aside className="overflow-y-auto border-b border-slate-200 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="font-semibold text-slate-800">Contacts</h2>
            <MessageCircle size={18} className="text-indigo-600" />
          </div>

          {contacts.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              No other active users found.
            </p>
          ) : (
            contacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => setSelected(contact)}
                className={`w-full border-b border-slate-100 p-4 text-left hover:bg-slate-50 ${
                  selected?.id === contact.id ? "bg-indigo-50" : ""
                }`}
              >
                <p className="font-medium text-slate-900">
                  {contact.full_name}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {contact.email}
                </p>
                <p className="mt-1 text-xs text-indigo-600">
                  {contact.role}
                </p>
              </button>
            ))
          )}
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                {selected?.full_name || "Select a contact"}
              </h2>
              {selected && (
                <p className="text-xs text-slate-500">
                  {selected.email}
                </p>
              )}
            </div>

            <span className={`inline-flex items-center gap-1.5 text-xs ${
              connected ? "text-emerald-700" : "text-slate-500"
            }`}>
              {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
              {connected ? "Live" : "Offline"}
            </span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {!selected ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">
                Choose a contact to view your conversation.
              </div>
            ) : loading ? (
              <p className="text-center text-sm text-slate-500">
                Loading messages...
              </p>
            ) : messages.length === 0 ? (
              <p className="pt-10 text-center text-sm text-slate-500">
                No messages yet. Start the conversation.
              </p>
            ) : (
              messages.map((message) => {
                const mine =
                  message.recipient_user_id === selected.id;

                return (
                  <div
                    key={message.id}
                    className={`flex ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm ${
                      mine
                        ? "rounded-br-sm bg-indigo-600 text-white"
                        : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                    }`}>
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {message.message}
                      </p>
                      <p className={`mt-1 text-right text-[11px] ${
                        mine ? "text-indigo-100" : "text-slate-400"
                      }`}>
                        {formatTime(message.sent_at)}
                        {mine && message.read_at ? " · Read" : ""}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-200 p-3">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={selected ? "Write a message..." : "Select a contact first"}
              maxLength={5000}
              disabled={!selected || sending}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!selected || !draft.trim() || sending}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send size={16} />
              Send
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

// The current user's ID is not exposed by the chat endpoint.
// For incoming messages, the active contact is the sender and the
// current user is the recipient. This helper keeps that check explicit.
function getCurrentUserIdFromMessage(message, activeContact) {
  if (!activeContact) return null;
  return message.recipient_user_id;
}
