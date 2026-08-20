// Retry helpers with exponential backoff + jitter for the kiosk's outbound
// calls (activation + sync). Network errors and retryable statuses are retried;
// terminal statuses are returned immediately so callers can act on them.

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  retryStatuses?: number[];
}

export interface RetryResult {
  status: number;
  data: any;
}

const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function postJsonWithBackoff(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  opts: RetryOptions = {},
): Promise<RetryResult> {
  const attempts = opts.attempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const maxDelayMs = opts.maxDelayMs ?? 60000;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const retryStatuses = opts.retryStatuses ?? RETRYABLE_STATUSES;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!retryStatuses.includes(res.status)) {
        return { status: res.status, data };
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < attempts - 1) {
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitter = delay * 0.5 * Math.random();
      await sleep(delay + jitter);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Request failed after retries");
}
