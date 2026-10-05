import axios from "axios";
import { store } from "../store/store";
import { clearUser } from "../store/userSlice";

export const MLapiClient = axios.create({
  baseURL: "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

MLapiClient.interceptors.request.use(
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

MLapiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      // The public /demo runs on MSW-mocked data; never bounce it to /login.
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

export type MLApiClient = typeof MLapiClient;