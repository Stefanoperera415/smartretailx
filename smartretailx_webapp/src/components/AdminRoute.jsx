import { Navigate } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

const AdminRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) return <div>Loading...</div>;
  if (!user || user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return children;
};

export default AdminRoute;