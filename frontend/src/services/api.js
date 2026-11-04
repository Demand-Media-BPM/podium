import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL,
  timeout: 8000,
  headers: { 'Content-Type': 'application/json' },
  // Sends the HttpOnly session cookie to the API. The JWT is never readable by JavaScript
  // and is never stored in localStorage/sessionStorage.
  withCredentials: true,
});

// AuthContext registers a callback here so that an expired session (a 401 from any
// non-auth endpoint) signs the user out in the UI.
let unauthorizedHandler = null;

export const setUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler;
};

// Login/me are expected to return 401 and are handled by their callers.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/me', '/auth/logout'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    if (status === 401 && unauthorizedHandler && !AUTH_ENDPOINTS.some((p) => url.startsWith(p))) {
      unauthorizedHandler();
    }
    return Promise.reject(error);
  }
);

export const getHealth = async () => {
  const { data } = await api.get('/health');
  return data;
};

export default api;
