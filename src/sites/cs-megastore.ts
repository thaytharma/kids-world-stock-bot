/**
 * Parsing of csmegastore.no product pages.
 *
 * Server-rendered like kids-world.dk, but the signals are different — and one
 * obvious-looking signal is a trap:
 *
 *  1. The schema.org offer availability:
 *       `<meta itemprop="availability" content="https://schema.org/InStock">`
 *       vs `.../OutOfStock`
 *  2. The stock bullet's colour class, `class="stock <colour>"`:
 *       green  → in stock
 *       yellow → "Fjernlager" / few left, still buyable
 *       red    → "Ikke på lager"
 *
 *  NOT the add-to-basket button. This shop renders "Legg i handlevogn"
 *  (`class="... addToCart"`) on *every* product page, including sold-out ones —
 *  confirmed on all 4 sold-out pages sampled. Reading it the way kids-world.dk
 *  does would report the watched kit as in stock on every single run, so it is
 *  deliberately ignored here.
 *
 * Verified across 49 live pages (45 in stock: 39 green, 6 yellow; 4 sold out:
 * all red) with zero disagreements between the two signals used.
 *
 * Non-product URLs answer 200 with the site chrome and no product markup at
 * all, which reads as `unknown` — the broken-bot warning then catches it rather
 * than the bot silently reporting "not in stock" forever.
 */

import { clean, distinctMatches, extract } from '../html.js';
import {
  combineVerdicts,
  hostOf,
  type ProductSnapshot,
  type SiteAdapter,
  type StockStatus,
} from './types.js';

export interface StockSignals {
  /** The schema.org availability token, lowercased, or "none"/"conflicting". */
  availability: string;
  /** The stock bullet colour, or "none"/"conflicting". */
  bullet: string;
}

const LABEL = 'csmegastore.no';

const AVAILABILITY = /itemprop="availability"[^>]*content="[^"]*?schema\.org\/([A-Za-z]+)"/g;
const BULLET = /class="stock ([a-z]+)"/g;
const TITLE = /<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/i;
/** The head's real <title>; the page also has many <title> tags inside SVGs. */
const TITLE_FALLBACK = /<title[^>]*>([\s\S]*?)<\/title>/i;
const PRICE = /<span[^>]*itemprop="price"[^>]*>([\s\S]*?)<\/span>/i;
const CURRENCY = /itemprop="priceCurrency"[^>]*content="([^"]*)"/i;

/** Ordering a backorder or pre-order is still ordering, so those count as buyable. */
const BUYABLE_AVAILABILITY = new Set([
  'instock',
  'lowstock',
  'limitedavailability',
  'preorder',
  'backorder',
]);
const UNBUYABLE_AVAILABILITY = new Set(['outofstock', 'soldout', 'discontinued']);

const BUYABLE_COLOURS = new Set(['green', 'yellow', 'orange']);
const UNBUYABLE_COLOURS = new Set(['red']);

/**
 * Read one marker that a page should carry exactly once. More than one distinct
 * value means the layout changed under us, and guessing which is the real
 * product is worse than admitting we do not know.
 */
function readOne(html: string, pattern: RegExp): string {
  const distinct = distinctMatches(html, pattern);
  if (distinct.length === 0) return 'none';
  if (distinct.length > 1) return 'conflicting';
  return distinct[0]!;
}

function verdict(value: string, buyable: Set<string>, unbuyable: Set<string>): StockStatus {
  if (buyable.has(value)) return 'in_stock';
  if (unbuyable.has(value)) return 'not_in_stock';
  return 'unknown';
}

export function readSignals(html: string): StockSignals {
  return {
    availability: readOne(html, AVAILABILITY),
    bullet: readOne(html, BULLET),
  };
}

/**
 * Same restock-biased resolution as the other shop: either signal saying
 * "buyable" is enough, and a disagreement is reported rather than hidden.
 *
 *   availability  bullet  → status        agreed
 *   instock       green   → in_stock      yes
 *   instock       yellow  → in_stock      yes
 *   outofstock    red     → not_in_stock  yes
 *   outofstock    green   → in_stock      no   (buyable wins)
 *   none          green   → in_stock      no
 *   none          red     → unknown       no   (page probably changed)
 *   none          none    → unknown       no   (not a product page)
 */
export function combineSignals(signals: StockSignals): { status: StockStatus; agreed: boolean } {
  return combineVerdicts([
    verdict(signals.availability, BUYABLE_AVAILABILITY, UNBUYABLE_AVAILABILITY),
    verdict(signals.bullet, BUYABLE_COLOURS, UNBUYABLE_COLOURS),
  ]);
}

export function parseStockStatus(html: string): StockStatus {
  return combineSignals(readSignals(html)).status;
}

/** The shop prints the amount and the currency separately, e.g. "1.399,00 NOK". */
function readPrice(html: string): string | null {
  const amount = extract(html, PRICE);
  if (amount === null) return null;
  const currency = CURRENCY.exec(html)?.[1];
  return currency === undefined || currency === '' ? amount : `${amount} ${clean(currency)}`;
}

export function parseProduct(html: string): ProductSnapshot {
  const signals = readSignals(html);
  const { status, agreed } = combineSignals(signals);
  return {
    siteLabel: LABEL,
    status,
    signals: { lagerstatus: signals.availability, 'lager-farve': signals.bullet },
    agreed,
    title: extract(html, TITLE) ?? extract(html, TITLE_FALLBACK),
    price: readPrice(html),
  };
}

export const csMegastore: SiteAdapter = {
  id: 'cs-megastore',
  label: LABEL,
  acceptLanguage: 'nb-NO,nb;q=0.9,no;q=0.8,en;q=0.7',
  matches: (url) => /(^|\.)csmegastore\.no$/i.test(hostOf(url)),
  parse: parseProduct,
};
