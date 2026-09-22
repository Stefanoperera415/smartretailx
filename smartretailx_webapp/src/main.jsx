import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider as OidcAuthProvider } from "react-oidc-context";
import "./index.css";
import App from "./App.jsx";
import { cognitoAuthConfig, userManager } from "./auth/oidcConfig";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <OidcAuthProvider userManager={userManager} {...cognitoAuthConfig}>
      <App />
    </OidcAuthProvider>
  </StrictMode>
);