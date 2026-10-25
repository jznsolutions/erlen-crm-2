/** Nur interne Pfade zulassen (verhindert Open Redirects wie //evil.de oder /\evil.de). */
export function safeRedirectPath(next: unknown, fallback = "/dashboard"): string {
  return typeof next === "string" && /^\/(?![/\\])[\w\-/?=&%.]*$/.test(next) ? next : fallback;
}
