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
 * Because two signals rarely fail together, requiring both to agree would be
 * the wrong call: the costs are asymmetric. A false alarm wastes one click; a
 * missed restock loses the product. So if *either* signal says the item is
 * buyable we report in_stock, and flag the disagreement so it can be checked.
 */

export type StockStatus = 'in_stock' | 'not_in_stock' | 'unknown';

export interface StockSignals {
  /** From the status marker class. `unknown` when absent or self-contradictory. */
  marker: StockStatus;
  /** Whether a "Læg i kurv" button is present. */
  cartButton: 'present' | 'absent';
}

export interface ProductSnapshot {
  status: StockStatus;
  signals: StockSignals;
  /** False when the two signals disagreed, so alerts can say so. */
  agreed: boolean;
  title: string | null;
  price: string | null;
}

const MARKER = /stockStatusBullet--([a-z_]+)/gi;
const CART_BUTTON = /<button[^>]*class="[^"]*cartAddProduct[^"]*"/i;
const TITLE = /<h1[^>]*class="[^"]*speakable-h1[^"]*"[^>]*>([\s\S]*?)<\/h1>/i;
const TITLE_FALLBACK = /<title[^>]*>([\s\S]*?)<\/title>/i;
const PRICE = /id="productDisplayPrice"[^>]*>([\s\S]*?)</i;

/** Decode the handful of entities the site actually emits, plus numeric ones. */
function decodeEntities(input: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    aring: 'å',
    Aring: 'Å',
    aelig: 'æ',
    AElig: 'Æ',
    oslash: 'ø',
    Oslash: 'Ø',
  };
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) => named[name] ?? whole);
}

function clean(input: string): string {
  return decodeEntities(input.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function extract(html: string, pattern: RegExp): string | null {
  const found = pattern.exec(html)?.[1];
  if (found === undefined) return null;
  const text = clean(found);
  return text === '' ? null : text;
}

/**
 * A product page carries exactly one marker today. If a future layout change
 * adds more (e.g. a related-products strip), we deliberately refuse to guess
 * which one is the main product.
 */
function readMarker(html: string): StockStatus {
  const distinct = new Set([...html.matchAll(MARKER)].map((m) => m[1]!.toLowerCase()));
  if (distinct.size !== 1) return 'unknown';
  const value = [...distinct][0];
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
  const { marker, cartButton } = signals;

  if (marker === 'in_stock' && cartButton === 'present') return { status: 'in_stock', agreed: true };
  if (marker === 'not_in_stock' && cartButton === 'absent') {
    return { status: 'not_in_stock', agreed: true };
  }
  if (marker === 'in_stock' || cartButton === 'present') return { status: 'in_stock', agreed: false };
  return { status: 'unknown', agreed: false };
}

export function parseStockStatus(html: string): StockStatus {
  return combineSignals(readSignals(html)).status;
}

export function parseProduct(html: string): ProductSnapshot {
  const signals = readSignals(html);
  const { status, agreed } = combineSignals(signals);
  return {
    status,
    signals,
    agreed,
    title: extract(html, TITLE) ?? extract(html, TITLE_FALLBACK),
    price: extract(html, PRICE),
  };
}
