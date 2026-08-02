const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface FetchOptions {
  attempts?: number;
  timeoutMs?: number;
  /** So each shop is asked in its own language. */
  acceptLanguage?: string;
  /** Injected in tests to avoid real waiting. */
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** GET a product page as a browser would, retrying transient failures. */
export async function fetchPage(
  url: string,
  {
    attempts = 3,
    timeoutMs = 20_000,
    acceptLanguage = 'da-DK,da;q=0.9,en;q=0.8',
    sleep = defaultSleep,
    fetchImpl = fetch,
  }: FetchOptions = {},
): Promise<string> {
  let lastError = '';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': acceptLanguage,
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < attempts) await sleep(attempt * 2_000);
    }
  }

  throw new Error(`failed after ${attempts} attempts: ${lastError}`);
}
