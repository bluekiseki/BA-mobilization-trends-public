// Codes returned when an account-level action needs a more recent login than the current session.
// `SESSION_EXPIRED` comes from better-auth's delete-user, `SESSION_NOT_FRESH` from the fresh-session middleware
// and the auth worker's own checks.
export function isSessionStaleCode(code: unknown): boolean {
  return code === 'SESSION_EXPIRED' || code === 'SESSION_NOT_FRESH';
}
