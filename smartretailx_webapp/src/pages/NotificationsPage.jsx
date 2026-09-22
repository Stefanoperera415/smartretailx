import { useContext, useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import * as notificationService from "../services/notificationService";
import { useNotificationStream } from "../hooks/useNotificationStream";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  BellIcon,
  CheckCircleIcon,
  EnvelopeOpenIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

const statusStyles = {
  PENDING: "bg-amber-100 text-amber-700",
  SENT: "bg-green-100 text-green-700",
  READ: "bg-gray-100 text-gray-700",
};

const typeStyles = {
  ORDER_CREATED: "bg-indigo-100 text-indigo-700",
  PAYMENT_COMPLETED: "bg-emerald-100 text-emerald-700",
  PAYMENT_FAILED: "bg-red-100 text-red-700",
};

const typeLabel = (type) =>
  (type || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const NotificationsPage = () => {
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL"); // ALL | UNREAD

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError("");
      const res = await notificationService.getNotifications({
        customerId: user.id,
      });
      const list = (res.data.data || []).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      setNotifications(list);
    } catch (err) {
      console.error(err);
      setError("Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Live stream: prepend new notifications, patch updated ones in place
  useNotificationStream(user?.id, {
    onCreated: (n) => {
      setNotifications((prev) => {
        if (prev.some((x) => x.notificationId === n.notificationId)) return prev;
        return [n, ...prev];
      });
    },
    onUpdated: (n) => {
      setNotifications((prev) =>
        prev.map((x) => (x.notificationId === n.notificationId ? n : x))
      );
    },
  });

  const handleMarkRead = async (notificationId) => {
    try {
      const res = await notificationService.markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) =>
          n.notificationId === notificationId ? res.data.data : n
        )
      );
      window.dispatchEvent(new Event("notifications:updated"));
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const filtered =
    filter === "UNREAD"
      ? notifications.filter((n) => n.status !== "READ")
      : notifications;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BellIcon className="h-6 w-6 text-indigo-600" />
          My Notifications
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
              filter === "ALL"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("UNREAD")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
              filter === "UNREAD"
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            Unread
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 mb-4">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100/80 p-12 text-center">
          <BellIcon className="h-12 w-12 mx-auto text-gray-300" />
          <p className="mt-4 text-gray-600">
            {filter === "UNREAD"
              ? "You're all caught up!"
              : "You have no notifications yet."}
          </p>
          <Link to="/shop" className="btn-primary mt-6 inline-block">
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => (
            <div
              key={n.notificationId}
              className={`bg-white rounded-xl shadow-sm border p-5 transition-all ${
                n.status !== "READ"
                  ? "border-indigo-200 ring-1 ring-indigo-100"
                  : "border-gray-100/80"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    n.status !== "READ"
                      ? "bg-indigo-50 text-indigo-600"
                      : "bg-gray-50 text-gray-500"
                  }`}
                >
                  {n.status !== "READ" ? (
                    <ClockIcon className="h-5 w-5" />
                  ) : (
                    <CheckCircleIcon className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span
                      className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                        typeStyles[n.type] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {typeLabel(n.type)}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                        statusStyles[n.status] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {n.status}
                    </span>
                  </div>
                  <p className="text-gray-800 leading-relaxed">{n.message}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString() : "—"}
                    </p>
                    {n.status !== "READ" && (
                      <button
                        onClick={() => handleMarkRead(n.notificationId)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        <EnvelopeOpenIcon className="h-4 w-4" />
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;