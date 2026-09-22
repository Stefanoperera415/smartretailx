import { useEffect, useState } from "react";
import * as notificationService from "../../services/notificationService";
import LoadingSpinner from "../../components/LoadingSpinner";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";

const NotificationsAdmin = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const fetchNotifications = async () => {
    try {
      const res = await notificationService.getNotifications();
      setNotifications(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleResend = async (notificationId) => {
    setBusyId(notificationId);
    try {
      await notificationService.sendNotification(notificationId);
      await fetchNotifications();
    } catch (err) {
      alert(
        err.response?.data?.error ||
          err.response?.data?.reason ||
          "Failed to resend notification"
      );
      await fetchNotifications();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Notifications</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {notifications.map((n) => {
                const busy = busyId === n.notificationId;
                return (
                  <tr key={n.notificationId}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-800">
                      {n.notificationId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {n.customerId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">
                        {n.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                          n.status === "SENT"
                            ? "bg-green-100 text-green-700"
                            : n.status === "PENDING"
                            ? "bg-yellow-100 text-yellow-700"
                            : n.status === "READ"
                            ? "bg-gray-100 text-gray-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {n.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 max-w-md text-gray-600">
                      <span className="line-clamp-2">{n.message}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleResend(n.notificationId)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
                        title="Re-send this notification"
                      >
                        <PaperAirplaneIcon className="h-4 w-4" />
                        {busy ? "Sending…" : "Resend"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default NotificationsAdmin;