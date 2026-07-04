/** Canonical URL Supabase redirects to after magic-link / email confirmation. */
export function getAuthCallbackUrl() {
  return `${window.location.origin}/auth/callback`;
}
