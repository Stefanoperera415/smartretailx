import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import * as userService from "../services/userService";
import * as orderService from "../services/orderService";
import LoadingSpinner from "../components/LoadingSpinner";

const ProfilePage = () => {
  const { user } = useContext(AuthContext);
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      try {
        // /auth/me provisions the user in the backend DB on first call
        const profileRes = await userService.getMe();
        setProfile(profileRes.data.data);

        // Fetch this user's orders using the Cognito sub
        const ordersRes = await orderService.getOrdersByCustomer(user.id);
        setOrders(ordersRes.data.data);
      } catch (err) {
        console.error("Failed to load profile", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  if (loading) return <LoadingSpinner />;
  if (!profile) return <div className="text-center py-12">Profile not found.</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">My Profile</h1>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100/80 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Personal Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs uppercase text-gray-400 font-semibold">First Name</p>
            <p className="font-medium text-gray-800">{profile.firstName}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400 font-semibold">Last Name</p>
            <p className="font-medium text-gray-800">{profile.lastName}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400 font-semibold">Email</p>
            <p className="font-medium text-gray-800">{profile.email}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400 font-semibold">Phone</p>
            <p className="font-medium text-gray-800">{profile.phone || "N/A"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400 font-semibold">Role</p>
            <p className="font-medium text-gray-800">{profile.role}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400 font-semibold">Status</p>
            <p className="font-medium text-gray-800">{profile.status}</p>
          </div>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-gray-700 mb-4">My Orders</h2>
      {orders.length === 0 ? (
        <p className="text-gray-500">No orders yet.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.orderId}
              className="bg-white rounded-xl shadow-sm border border-gray-100/80 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
            >
              <div>
                <p className="font-medium text-gray-800">Order #{order.orderId}</p>
                <p className="text-sm text-gray-500">{order.status}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-800">
                  {order.totalAmount} {order.currency}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(order.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProfilePage;