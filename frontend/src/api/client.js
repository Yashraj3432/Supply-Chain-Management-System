import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const ACCESS_KEY = "scm_access";
const REFRESH_KEY = "scm_refresh";

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ access, refresh }) {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const access = tokens.access;
  if (access) config.headers.Authorization = `Bearer ${access}`;
  return config;
});

// On 401, try one token refresh and replay the request. Concurrent 401s share the refresh call.
let refreshing = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthCall = original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");
    if (status === 401 && !original._retry && !isAuthCall && tokens.refresh) {
      original._retry = true;
      try {
        refreshing =
          refreshing ||
          axios.post(`${API_URL}/auth/refresh/`, { refresh: tokens.refresh }).finally(() => {
            refreshing = null;
          });
        const { data } = await refreshing;
        tokens.set(data);
        original.headers.Authorization = `Bearer ${data.access}`;
        return api(original);
      } catch (refreshError) {
        tokens.clear();
        window.dispatchEvent(new Event("scm:logout"));
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

/** Extract a human readable message from an API error. */
export function errorMessage(err, fallback = "Something went wrong.") {
  const data = err?.response?.data;
  if (!data) return err?.message || fallback;
  if (typeof data === "string") return fallback;
  if (data.errors && typeof data.errors === "object") {
    const parts = Object.entries(data.errors).map(([field, msgs]) => {
      const text = Array.isArray(msgs) ? msgs.map((m) => (typeof m === "object" ? JSON.stringify(m) : m)).join(" ") : String(msgs);
      return field === "non_field_errors" ? text : `${field.replace(/_/g, " ")}: ${text}`;
    });
    if (parts.length) return parts.join(" • ");
  }
  return data.detail || fallback;
}

/** Download a CSV export from an authenticated endpoint. */
export async function downloadCsv(path, params, filename) {
  const res = await api.get(path, { params: { ...params, export: "csv" }, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default api;
