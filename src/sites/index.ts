import { csMegastore } from './cs-megastore.js';
import { kidsWorld } from './kids-world.js';
import type { SiteAdapter } from './types.js';

export const SITES: SiteAdapter[] = [kidsWorld, csMegastore];

/**
 * The parser for a URL's shop. Throws rather than falling back to a guess: a
 * typo'd or moved URL then surfaces as a broken-bot warning instead of a
 * product that silently never comes back in stock.
 */
export function siteFor(url: string): SiteAdapter {
  const site = SITES.find((candidate) => candidate.matches(url));
  if (site === undefined) throw new Error(`no parser for ${url} — unsupported shop`);
  return site;
}

export type { ProductSnapshot, SiteAdapter, StockStatus } from './types.js';
