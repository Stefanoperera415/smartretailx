import { UserManager, WebStorageStateStore } from "oidc-client-ts";

export const cognitoAuthConfig = {
  authority: import.meta.env.VITE_COGNITO_AUTHORITY,
  client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
  redirect_uri: import.meta.env.VITE_COGNITO_REDIRECT_URI,
  post_logout_redirect_uri: import.meta.env.VITE_COGNITO_LOGOUT_URI,
  response_type: "code",
  scope: "email openid profile",
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.localStorage }),
};

export const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN;
export const cognitoClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

// Shared UserManager instance – used by react-oidc-context AND api.js
export const userManager = new UserManager(cognitoAuthConfig);