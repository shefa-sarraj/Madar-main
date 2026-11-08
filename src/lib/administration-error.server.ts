export function administrationError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "تعذر إتمام العملية";
  // Preserve actionable errors without returning credentials or submitted passwords.
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  return key ? message.split(key).join("[redacted]") : message;
}
