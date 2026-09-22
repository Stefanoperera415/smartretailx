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

export default api;