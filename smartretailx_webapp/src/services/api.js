import axios from "axios";
import { userManager } from "../auth/oidcConfig";

const api = axios.create();

api.interceptors.request.use(
  async (config) => {
    try {
      const user = await userManager.getUser();
      if (user && user.id_token) {
        config.headers.Authorization = `Bearer ${user.id_token}`;
      }
    } catch (err) {
      console.error("Failed to attach Cognito token:", err);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ NEW: on 401, try one silent renew then retry the original request.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retried
    ) {
      original._retried = true;
      try {
        const renewed = await userManager.signinSilent();
        if (renewed?.id_token) {
          original.headers.Authorization = `Bearer ${renewed.id_token}`;
          return api(original);
        }
      } catch (e) {
        // silent renew failed — let the app handle it
        console.log("Silent renew failed:", e);
      }
    }
    return Promise.reject(error);
  }
);

export default api;