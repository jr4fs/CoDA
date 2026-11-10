import axios from "axios";
import { store } from "../store/store";
import { clearUser } from "../store/userSlice";

// In a same-origin production deploy (frontend + API served behind one domain)
// leave VITE_API_URL unset: an empty base makes requests relative to the page
// origin (e.g. "/api/..."), so no domain needs to be baked into the build.
// In dev, fall back to the local Node backend.
const apiBaseUrl =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.PROD ? "" : "http://localhost:8080");

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      // The public /demo runs on MSW-mocked data; never bounce it to /login even
      // if some request slips through to the real backend.
      const inDemo = window.location.pathname.startsWith("/demo");
      if (!inDemo) {
        store.dispatch(clearUser());
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export type ApiClient = typeof apiClient;