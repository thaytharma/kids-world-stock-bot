import type { StockStatus } from './parse.js';

export interface ProductState {
  status: StockStatus | 'fetch_error';
  /** Consecutive runs where the status was neither in_stock nor not_in_stock. */
  brokenRuns: number;
  /** True once we have warned about the current broken streak, so we warn once. */
  brokenWarningSent: boolean;
  /**
   * True once a restock notification for the current in-stock streak was
   * actually delivered. Tracked separately from `status` so a delivery failure
   * retries next run instead of being lost.
   */
  restockNotified: boolean;
  lastCheckedAt: string;
  lastInStockAt?: string;
  title?: string;
  price?: string;
}

export interface BotState {
  version: 1;
  products: Record<string, ProductState>;
}

export const emptyState = (): BotState => ({ version: 1, products: {} });

export function parseState(raw: string): BotState {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'products' in parsed &&
      typeof (parsed as BotState).products === 'object'
    ) {
      return { version: 1, products: (parsed as BotState).products ?? {} };
    }
  } catch {
    // Fall through: a corrupt state file must not stop the bot from checking.
  }
  return emptyState();
}

export function serializeState(state: BotState): string {
  const products = Object.fromEntries(
    Object.entries(state.products).sort(([a], [b]) => a.localeCompare(b)),
  );
  return `${JSON.stringify({ ...state, products }, null, 2)}\n`;
}

export async function loadState(path: string): Promise<BotState> {
  const { readFile } = await import('node:fs/promises');
  try {
    return parseState(await readFile(path, 'utf8'));
  } catch {
    return emptyState();
  }
}

export async function saveState(path: string, state: BotState): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, serializeState(state), 'utf8');
}
