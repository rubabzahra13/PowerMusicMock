// Backend base URL.
// - Local dev: falls back to the FastAPI dev server on localhost:8000.
// - Production: frontend and backend share one Vercel deployment/domain, so
//   requests go to the same origin ('' → relative /api/... paths).
// - VITE_API_URL overrides both if the backend ever lives elsewhere.
const API_BASE =
  import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8000');

export const getApiUrl = (path) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
};

export default API_BASE;
