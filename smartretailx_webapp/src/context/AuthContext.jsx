/* eslint-disable react-refresh/only-export-components */
import { createContext } from "react";
import { useAuth } from "react-oidc-context";

export const AuthContext = createContext();

function mapCognitoUser(oidcUser) {
  if (!oidcUser) return null;
  const profile = oidcUser.profile || {};
  const groups = profile["cognito:groups"] || [];
  const role = groups.includes("ADMIN")
    ? "ADMIN"
    : groups.includes("STAFF")
    ? "STAFF"
    : "CUSTOMER";

  return {
    id: profile.sub,
    email: profile.email,
    firstName: profile.given_name,
    lastName: profile.family_name,
    phone: profile.phone_number,
    role,
    groups,
    idToken: oidcUser.id_token,
    accessToken: oidcUser.access_token,
  };
}

export const AuthProvider = ({ children }) => {
  const auth = useAuth();
  const user = mapCognitoUser(auth.user);
  const loading = auth.isLoading;

  const login = () => auth.signinRedirect();
  const register = () => auth.signinRedirect();

  const logout = () => {
    // 1) Clear OIDC keys synchronously
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("oidc.user:")) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error("[logout] Failed to clear OIDC keys from localStorage:", e);
    }

    // 2) Build Cognito's /logout URL
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

    let domain = import.meta.env.VITE_COGNITO_DOMAIN || "";
    if (domain && !domain.startsWith("http")) {
      domain = `https://${domain}`;
    }
    domain = domain.replace(/\/+$/, "");

    const logoutUri = import.meta.env.VITE_COGNITO_LOGOUT_URI;

    const url =
      `${domain}/logout` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&logout_uri=${encodeURIComponent(logoutUri)}`;

    // 3) Navigate immediately
    console.log("[logout] →", url);
    window.location.replace(url);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, register, oidc: auth }}
    >
      {children}
    </AuthContext.Provider>
  );
};