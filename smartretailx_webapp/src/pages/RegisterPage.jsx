import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import LoadingSpinner from "../components/LoadingSpinner";

const RegisterPage = () => {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && !auth.activeNavigator) {
      auth.signinRedirect();
    }
  }, [auth]);

  return <LoadingSpinner />;
};

export default RegisterPage;