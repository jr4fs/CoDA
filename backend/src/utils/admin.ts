// The admin account is defined by the ADMIN_EMAIL env var (server-side truth).
// Admin status is derived from the authenticated JWT's email, never from a
// client-supplied flag, so it cannot be forged.

export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

export function isAdminEmail(email?: string | null): boolean {
  const admin = getAdminEmail();
  return admin.length > 0 && (email || "").trim().toLowerCase() === admin;
}
