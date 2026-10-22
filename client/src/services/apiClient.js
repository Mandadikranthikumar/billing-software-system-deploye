import axios from "axios";

// Helper to normalize and ensure baseURL always targets the /api prefix
const getApiBaseUrl = () => {
  const envUrl = (import.meta.env.VITE_API_URL || "").trim();
  if (!envUrl) {
    return "https://billing-software-system-deploye.onrender.com/api";
  }
  const cleanUrl = envUrl.replace(/\/+$/, "");
  if (cleanUrl.endsWith("/api")) {
    return cleanUrl;
  }
  return `${cleanUrl}/api`;
};

// Centralized Axios instance
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    "Content-Type": "application/json"
  }
});

// Request interceptor to attach JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for centralized error handling and auto-logout
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const status = error.response ? error.response.status : null;

    if (status === 401) {
      // Clear storage
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      // Redirect if not already on login page
      if (window.location.pathname !== "/login") {
        window.location.href = "/login?session_expired=true";
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
