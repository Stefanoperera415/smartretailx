import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import LoadingSpinner from "../components/LoadingSpinner";

const CallbackPage = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.isLoading && auth.isAuthenticated) {
      // ✅ Send the user to the shop after successful login
      navigate("/shop", { replace: true });
    }
  }, [auth.isLoading, auth.isAuthenticated, navigate]);

  if (auth.error) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Login failed</h1>
        <p className="text-gray-600">{auth.error.message}</p>
        <button
          onClick={() => auth.signinRedirect()}
          className="btn-primary mt-6"
        >
          Try again
        </button>
      </div>
    );
  }

  return <LoadingSpinner />;
};

export default CallbackPage;