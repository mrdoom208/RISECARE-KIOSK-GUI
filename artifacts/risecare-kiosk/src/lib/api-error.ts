// The API answers failures with a machine-readable `error` slug and an optional
// human `message`. Only the message is safe to render, so every catch block
// should route through `apiErrorMessage` rather than interpolating `data.error`
// directly -- otherwise codes like `rate_limited` end up on screen verbatim.
const FRIENDLY_MESSAGES: Record<string, string> = {
  rate_limited: "Please try again in a few minutes.",
  invalid_name: "Please enter a valid name.",
  invalid_phone: "Please enter a valid phone number.",
  invalid_reference: "Please enter a valid reference number.",
  invalid_request: "Please check the details and try again.",
  not_found: "That record could not be found.",
  reauth_failed: "Password verification failed.",
};

export const RATE_LIMITED_MESSAGE = "Please try again in a few minutes.";

const isSlug = (value: string) => /^[a-z][a-z0-9_]*$/.test(value);

/**
 * Turns an API error body into text that is safe to show a user.
 *
 * A rate-limit response is the one case where our copy beats the server's, so
 * that always wins. Otherwise a genuine human `message` is preferred over the
 * mapped slug, since "Phone and reference are mutually exclusive" helps a kiosk
 * user more than "Please check the details". A `message` that merely echoes a
 * slug is ignored, and anything unrecognised falls back to the caller's copy so
 * a raw code can never leak through.
 */
export function apiErrorMessage(body: unknown, fallback: string, status?: number): string {
  if (status === 429) {
    return RATE_LIMITED_MESSAGE;
  }

  if (body && typeof body === "object") {
    const { error, message } = body as { error?: unknown; message?: unknown };
    const slug = typeof error === "string" ? error.trim() : "";
    const text = typeof message === "string" ? message.trim() : "";

    if (slug === "rate_limited" || text === "rate_limited") {
      return RATE_LIMITED_MESSAGE;
    }
    if (text && !isSlug(text)) {
      return text;
    }
    if (slug && FRIENDLY_MESSAGES[slug]) {
      return FRIENDLY_MESSAGES[slug];
    }
    if (text && FRIENDLY_MESSAGES[text]) {
      return FRIENDLY_MESSAGES[text];
    }
  }

  return fallback;
}
