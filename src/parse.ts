/**
 * Shop-agnostic entry point for reading a product page.
 *
 * Each shop's markup, signals and language live in its own adapter under
 * ./sites — see ./sites/kids-world.ts and ./sites/cs-megastore.ts. They do not
 * share a stock signal: the same-looking add-to-basket button means "buyable"
 * on one shop and nothing at all on the other, so each reads its own pair.
 */

import { siteFor } from './sites/index.js';
import type { ProductSnapshot, StockStatus } from './sites/types.js';

export type { ProductSnapshot, StockStatus } from './sites/types.js';

export function parseProduct(url: string, html: string): ProductSnapshot {
  return siteFor(url).parse(html);
}

export function parseStockStatus(url: string, html: string): StockStatus {
  return parseProduct(url, html).status;
}
