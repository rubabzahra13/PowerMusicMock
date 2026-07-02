const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const getApiUrl = (path) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
};

export default API_BASE;
