import axios from "axios";

// Centralized Axios instance
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "https://billing-software-system-deploye.onrender.com/api",
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
