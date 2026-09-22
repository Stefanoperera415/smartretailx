import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

import LandingPage from "./pages/LandingPage";
import HomePage from "./pages/HomePage";
import ProductDetailPage from "./pages/ProductDetailPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import CallbackPage from "./pages/CallbackPage";
import ProfilePage from "./pages/ProfilePage";
import CartPage from "./pages/CartPage";
import CheckoutPage from "./pages/CheckoutPage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";
import PaymentFailurePage from "./pages/PaymentFailurePage";
import NotificationsPage from "./pages/NotificationsPage"; // ✅ NEW

import Dashboard from "./pages/admin/Dashboard";
import ProductsAdmin from "./pages/admin/ProductsAdmin";
import CategoriesAdmin from "./pages/admin/CategoriesAdmin";
import WarehousesAdmin from "./pages/admin/WarehousesAdmin";
import OrdersAdmin from "./pages/admin/OrdersAdmin";
import InventoryAdmin from "./pages/admin/InventoryAdmin";
import UsersAdmin from "./pages/admin/UsersAdmin";
import NotificationsAdmin from "./pages/admin/NotificationsAdmin";

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <Router>
          <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <Routes>
                <Route path="/" element={<LandingPage />} />

                <Route
                  path="/shop"
                  element={
                    <ProtectedRoute>
                      <HomePage />
                    </ProtectedRoute>
                  }
                />

                <Route path="/product/:productId" element={<ProductDetailPage />} />

                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/callback" element={<CallbackPage />} />
                <Route path="/cart" element={<CartPage />} />

                <Route
                  path="/checkout"
                  element={
                    <ProtectedRoute>
                      <CheckoutPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/payment/success" element={<PaymentSuccessPage />} />
                <Route path="/payment/failure" element={<PaymentFailurePage />} />

                {/* ✅ Customer notifications inbox */}
                <Route
                  path="/notifications"
                  element={
                    <ProtectedRoute>
                      <NotificationsPage />
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />

                <Route path="/admin" element={<AdminRoute><Dashboard /></AdminRoute>} />
                <Route path="/admin/products" element={<AdminRoute><ProductsAdmin /></AdminRoute>} />
                <Route path="/admin/categories" element={<AdminRoute><CategoriesAdmin /></AdminRoute>} />
                <Route path="/admin/warehouses" element={<AdminRoute><WarehousesAdmin /></AdminRoute>} />
                <Route path="/admin/orders" element={<AdminRoute><OrdersAdmin /></AdminRoute>} />
                <Route path="/admin/inventory" element={<AdminRoute><InventoryAdmin /></AdminRoute>} />
                <Route path="/admin/users" element={<AdminRoute><UsersAdmin /></AdminRoute>} />
                <Route path="/admin/notifications" element={<AdminRoute><NotificationsAdmin /></AdminRoute>} />
              </Routes>
            </main>
            <Footer />
          </div>
        </Router>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;