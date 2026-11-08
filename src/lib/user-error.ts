/** Keep known Arabic validation feedback, never database or transport diagnostics. */
export function userError(
  error: unknown,
  fallback = "تعذر تنفيذ الإجراء. تحقق من الاتصال وحاول مرة أخرى.",
) {
  const message =
    error && typeof error === "object" && "message" in error ? String(error.message).trim() : "";
  if (/row-level security|permission denied/i.test(message))
    return "ليست لديك صلاحية لتنفيذ هذا الإجراء.";
  if (/^[\u0600-\u06ff\s\d.,،؛:!?؟()ـ-]+$/u.test(message) && message.length <= 300) return message;
  return fallback;
}
