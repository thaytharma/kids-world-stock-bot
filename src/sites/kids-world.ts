/**
 * Parsing of kids-world.dk product pages.
 *
 * The pages are server-rendered, so a plain GET is enough. Two independent
 * signals both indicate stock, and both are in the server HTML:
 *
 *  1. The status marker:
 *       in stock     `stockStatusBullet--in_stock`     → "På lager"
 *       out of stock `stockStatusBullet--not_in_stock`  → "Udsolgt"
 *  2. The "Læg i kurv" button (`class="... cartAddProduct"`), which the server
 *     omits entirely when the item cannot be bought.
 *
 * Verified across 45 live pages (40 in stock, 5 sold out) with zero
 * disagreements. Note the marker's *label* varies ("På lager", "På lager -
 * Sendes indenfor 24 timer"), so only the class modifier is read.
 *
 * The cart button is only trustworthy here because this shop omits it when the
 * item is unbuyable — csmegastore.no renders it regardless, which is why that
 * shop reads different signals. See ./cs-megastore.ts.
 */

import { distinctMatches, extract } from '../html.js';
import {
  combineVerdicts,
  hostOf,
  type ProductSnapshot,
  type SiteAdapter,
  type StockStatus,
} from './types.js';

export interface StockSignals {
  /** From the status marker class. `unknown` when absent or self-contradictory. */
  marker: StockStatus;
  /** Whether a "Læg i kurv" button is present. */
  cartButton: 'present' | 'absent';
}

const LABEL = 'kids-world.dk';

const MARKER = /stockStatusBullet--([a-z_]+)/gi;
const CART_BUTTON = /<button[^>]*class="[^"]*cartAddProduct[^"]*"/i;
const TITLE = /<h1[^>]*class="[^"]*speakable-h1[^"]*"[^>]*>([\s\S]*?)<\/h1>/i;
const TITLE_FALLBACK = /<title[^>]*>([\s\S]*?)<\/title>/i;
const PRICE = /id="productDisplayPrice"[^>]*>([\s\S]*?)</i;

/**
 * A product page carries exactly one marker today. If a future layout change
 * adds more (e.g. a related-products strip), we deliberately refuse to guess
 * which one is the main product.
 */
function readMarker(html: string): StockStatus {
  const distinct = distinctMatches(html, MARKER);
  if (distinct.length !== 1) return 'unknown';
  const value = distinct[0];
  if (value === 'in_stock') return 'in_stock';
  if (value === 'not_in_stock') return 'not_in_stock';
  return 'unknown';
}

export function readSignals(html: string): StockSignals {
  return {
    marker: readMarker(html),
    cartButton: CART_BUTTON.test(html) ? 'present' : 'absent',
  };
}

/**
 * Resolve the two signals into one status, biased towards catching a restock.
 *
 *   marker        cart      → status        agreed
 *   in_stock      present   → in_stock      yes
 *   not_in_stock  absent    → not_in_stock  yes
 *   in_stock      absent    → in_stock      no
 *   not_in_stock  present   → in_stock      no   (buyable wins)
 *   unknown       present   → in_stock      no
 *   unknown       absent    → unknown       no   (page probably changed)
 */
export function combineSignals(signals: StockSignals): { status: StockStatus; agreed: boolean } {
  return combineVerdicts([
    signals.marker,
    signals.cartButton === 'present' ? 'in_stock' : 'not_in_stock',
  ]);
}

export function parseStockStatus(html: string): StockStatus {
  return combineSignals(readSignals(html)).status;
}

export function parseProduct(html: string): ProductSnapshot {
  const signals = readSignals(html);
  const { status, agreed } = combineSignals(signals);
  return {
    siteLabel: LABEL,
    status,
    signals: { marker: signals.marker, 'kurv-knap': signals.cartButton },
    agreed,
    title: extract(html, TITLE) ?? extract(html, TITLE_FALLBACK),
    price: extract(html, PRICE),
  };
}

export const kidsWorld: SiteAdapter = {
  id: 'kids-world',
  label: LABEL,
  acceptLanguage: 'da-DK,da;q=0.9,en;q=0.8',
  matches: (url) => /(^|\.)kids-world\.dk$/i.test(hostOf(url)),
  parse: parseProduct,
};
