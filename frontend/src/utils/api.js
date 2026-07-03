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

/** Fetch JSON from the API; throws with server `detail` on non-2xx. */
export async function fetchJson(path, options = {}) {
  const res = await fetch(getApiUrl(path), options);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* keep statusText */
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return res.json();
}

export default API_BASE;
