import { useEffect, useState } from "react";
import * as userService from "../../services/userService";
import LoadingSpinner from "../../components/LoadingSpinner";

const ALL_ROLES = ["CUSTOMER", "STAFF", "ADMIN"];

const roleBadgeColor = (role) => {
  if (role === "ADMIN") return "bg-purple-100 text-purple-700";
  if (role === "STAFF") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
};

const UsersAdmin = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchUsers = async () => {
    try {
      const res = await userService.getAllUsers();
      setUsers(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    if (
      !window.confirm(
        `Change this user's role to ${newRole}?\n\nThey must log out and log back in for the change to take effect.`
      )
    ) {
      return;
    }

    setUpdatingId(userId);
    try {
      await userService.updateUserRole(userId, newRole);
      await fetchUsers();
      alert(
        "Role updated successfully.\n\nIMPORTANT: The user must log out and log back in before the new role takes effect."
      );
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Failed to update role");
      // Refresh anyway to show the actual current state
      fetchUsers();
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (userId) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      try {
        await userService.deleteUser(userId);
        fetchUsers();
      } catch (err) {
        console.error(err);
        alert("Failed to delete user");
      }
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Manage Users</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => {
                const isUpdating = updatingId === user.id;
                return (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-800">
                      {user.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={isUpdating}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 ${roleBadgeColor(
                          user.role
                        )}`}
                      >
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {isUpdating && (
                        <span className="ml-2 text-xs text-gray-500">saving…</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                        user.status === "ACTIVE"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
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

export default UsersAdmin;