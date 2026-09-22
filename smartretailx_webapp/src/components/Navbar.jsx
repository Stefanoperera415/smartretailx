import { Link } from "react-router-dom";
import { useContext, useEffect, useState, useCallback } from "react";
import { AuthContext } from "../context/AuthContext";
import { CartContext } from "../context/CartContext";
import * as notificationService from "../services/notificationService";
import { useNotificationStream } from "../hooks/useNotificationStream";
import {
  ShoppingCartIcon,
  UserIcon,
  UserGroupIcon,
  BellIcon,
} from "@heroicons/react/24/outline";

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);
  const { cartCount } = useContext(CartContext);
  const [unreadCount, setUnreadCount] = useState(0);
  const [live, setLive] = useState(false);

  const refreshCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await notificationService.getUnreadCount(user.id);
      setUnreadCount(res?.data?.data?.unread ?? 0);
    } catch {
      // keep the last known value; polling will retry
    }
  }, [user]);

  useEffect(() => {
    refreshCount();
    const handler = () => refreshCount();
    window.addEventListener("notifications:updated", handler);
    return () => window.removeEventListener("notifications:updated", handler);
  }, [refreshCount]);

  // Live stream + polling fallback — the hook calls onUnreadCount on every
  // poll and after every created event, so the badge stays correct even
  // if SSE is blocked.
  useNotificationStream(user?.id, {
    onCreated: () => setUnreadCount((c) => c + 1),
    onUpdated: () => refreshCount(),
    onUnreadCount: (n) => setUnreadCount(n),
    onConnectionChange: (ok) => setLive(ok),
  });

  return (
    <nav className="bg-white border-b border-gray-200/80 sticky top-0 z-50 backdrop-blur-sm bg-white/80">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            to="/"
            className="flex items-center space-x-2 text-2xl font-bold tracking-tight"
          >
            <span className="text-indigo-600">Smart</span>
            <span className="text-gray-800">Retail</span>
            <span className="text-indigo-600">X</span>
          </Link>

          <div className="hidden md:flex items-center space-x-6">
            <Link to="/" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">
              Home
            </Link>
            <Link to="/shop" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">
              Shop
            </Link>

            {user && (
              <Link
                to="/notifications"
                className="relative text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
                title={live ? "Live notifications connected" : "Notifications"}
              >
                <BellIcon className="h-5 w-5 inline-block" />
                {live && (
                  <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            )}

            <Link
              to="/cart"
              className="relative text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
            >
              <ShoppingCartIcon className="h-5 w-5 inline-block mr-1" />
              Cart
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-3 bg-indigo-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>

            {user ? (
              <>
                <Link to="/profile" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">
                  <UserIcon className="h-5 w-5 inline-block mr-1" />
                  Profile
                </Link>
                {user.role === "ADMIN" && (
                  <Link to="/admin" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">
                    <UserGroupIcon className="h-5 w-5 inline-block mr-1" />
                    Admin
                  </Link>
                )}
                <button
                  onClick={logout}
                  className="text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-primary text-sm py-1.5 px-4">
                  Login
                </Link>
                <Link to="/register" className="btn-secondary text-sm py-1.5 px-4">
                  Register
                </Link>
              </>
            )}
          </div>

          <div className="md:hidden flex items-center space-x-4">
            <Link to="/shop" className="text-sm font-medium text-gray-600">
              Shop
            </Link>
            {user && (
              <Link to="/notifications" className="relative">
                <BellIcon className="h-6 w-6 text-gray-600" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            <Link to="/cart" className="relative">
              <ShoppingCartIcon className="h-6 w-6 text-gray-600" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-indigo-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
            {user ? (
              <button onClick={logout} className="text-sm font-medium text-gray-600">
                Logout
              </button>
            ) : (
              <Link to="/login" className="text-sm font-medium text-indigo-600">
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;