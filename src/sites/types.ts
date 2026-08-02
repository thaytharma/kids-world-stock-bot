export type StockStatus = 'in_stock' | 'not_in_stock' | 'unknown';

export interface ProductSnapshot {
  /** Which shop this reading came from, e.g. "kids-world.dk". Named in alerts. */
  siteLabel: string;
  status: StockStatus;
  /**
   * The raw per-signal readings, keyed by a name the shop's parser chooses.
   * Free-form on purpose: the shops have different signals, and nothing outside
   * the parser interprets these — they are only logged and shown in alerts.
   */
  signals: Record<string, string>;
  /** False when the shop's signals disagreed, so alerts can say so. */
  agreed: boolean;
  title: string | null;
  price: string | null;
}

export interface SiteAdapter {
  id: string;
  /** Host shown to a human, e.g. "kids-world.dk". */
  label: string;
  /** Sent as Accept-Language, so each shop answers in its own language. */
  acceptLanguage: string;
  matches(url: string): boolean;
  parse(html: string): ProductSnapshot;
}

/**
 * Resolve independent per-signal verdicts into one status, biased towards
 * catching a restock.
 *
 * The costs are asymmetric: a false alarm wastes one click, a missed restock
 * loses the product. So a single signal saying "buyable" is enough to report
 * in_stock, and any disagreement is flagged so the alert can admit it. Only
 * when nothing is buyable and nothing is certain do we report unknown, which is
 * what the broken-bot warning watches for.
 */
export function combineVerdicts(verdicts: StockStatus[]): {
  status: StockStatus;
  agreed: boolean;
} {
  const distinct = new Set(verdicts);
  const unanimous = distinct.size === 1 ? [...distinct][0]! : null;
  if (unanimous !== null && unanimous !== 'unknown') return { status: unanimous, agreed: true };
  if (distinct.has('in_stock')) return { status: 'in_stock', agreed: false };
  return { status: 'unknown', agreed: false };
}

/** Hostname of a URL, or "" if it is not a URL at all — never throws. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
