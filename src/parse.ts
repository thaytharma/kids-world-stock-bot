/**
 * Parsing of kids-world.dk product pages.
 *
 * The pages are server-rendered, so a plain GET is enough. Stock status is
 * carried by a single element:
 *
 *   in stock     <span class="stockStatusBullet stockStatusBullet--in_stock"><strong>På lager</strong></span>
 *   out of stock <span class="stockStatusBullet stockStatusBullet--not_in_stock"><strong>Udsolgt</strong></span>
 *
 * The add-to-cart button is rendered client-side, so it cannot corroborate the
 * marker. That makes the marker a single point of failure — hence `unknown`,
 * which the caller escalates instead of quietly reading as "out of stock".
 */

export type StockStatus = 'in_stock' | 'not_in_stock' | 'unknown';

export interface ProductSnapshot {
  status: StockStatus;
  /** The raw modifier found on the marker, e.g. `in_stock`. Null when absent or ambiguous. */
  rawMarker: string | null;
  title: string | null;
  price: string | null;
}

const MARKER = /stockStatusBullet--([a-z_]+)/gi;
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
 * which one is the main product and report ambiguity instead.
 */
function findMarker(html: string): { value: string | null; count: number } {
  const distinct = new Set([...html.matchAll(MARKER)].map((m) => m[1]!.toLowerCase()));
  return {
    value: distinct.size === 1 ? [...distinct][0]! : null,
    count: distinct.size,
  };
}

export function parseStockStatus(html: string): StockStatus {
  const { value } = findMarker(html);
  if (value === 'in_stock') return 'in_stock';
  if (value === 'not_in_stock') return 'not_in_stock';
  return 'unknown';
}

export function parseProduct(html: string): ProductSnapshot {
  return {
    status: parseStockStatus(html),
    rawMarker: findMarker(html).value,
    title: extract(html, TITLE) ?? extract(html, TITLE_FALLBACK),
    price: extract(html, PRICE),
  };
}
