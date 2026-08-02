import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  combineSignals,
  csMegastore,
  parseProduct,
  parseStockStatus,
  readSignals,
  type StockSignals,
} from '../../src/sites/cs-megastore.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '..', 'fixtures', name), 'utf8');

describe('readSignals on real pages', () => {
  it('reads both signals as sold out on the watched Luna kit', () => {
    expect(readSignals(fixture('cs-out-of-stock.html'))).toEqual({
      availability: 'outofstock',
      bullet: 'red',
    });
  });

  it('reads both signals as in stock on a real in-stock page', () => {
    expect(readSignals(fixture('cs-in-stock.html'))).toEqual({
      availability: 'instock',
      bullet: 'green',
    });
  });

  it('reads a "Fjernlager" page as in stock, with the yellow bullet', () => {
    expect(readSignals(fixture('cs-low-stock.html'))).toEqual({
      availability: 'instock',
      bullet: 'yellow',
    });
  });

  it('finds no signals at all on a page that is not a product', () => {
    expect(readSignals(fixture('cs-no-signals.html'))).toEqual({
      availability: 'none',
      bullet: 'none',
    });
  });
});

/**
 * The whole reason this shop needs its own parser. If the kids-world.dk rule
 * ("cart button present ⇒ buyable") were reused here, the watched kit would be
 * reported as in stock on every run and the alert would be worthless.
 */
describe('the add-to-basket button is not a stock signal here', () => {
  it('renders on the sold-out page, yet the page still reads as sold out', () => {
    const html = fixture('cs-out-of-stock.html');
    expect(html).toMatch(/<button[^>]*class="[^"]*addToCart[^"]*"/i);
    expect(parseStockStatus(html)).toBe('not_in_stock');
  });

  it('is ignored entirely, so a page with only that button is not in stock', () => {
    const html =
      '<button id="buybtn1" class="m-button u-w-100 addToCart " data-itemid="1">Legg i handlevogn</button>';
    expect(parseStockStatus(html)).toBe('unknown');
  });
});

describe('availability reading', () => {
  const availability = (html: string) => readSignals(html).availability;

  it('reads the schema.org token out of the offer markup', () => {
    const html = '<meta itemprop="availability" content="https://schema.org/InStock" />';
    expect(availability(html)).toBe('instock');
  });

  it('accepts the http:// form of the schema.org URL', () => {
    const html = '<meta itemprop="availability" content="http://schema.org/OutOfStock" />';
    expect(availability(html)).toBe('outofstock');
  });

  it('refuses to guess between conflicting tokens', () => {
    const html = `
      <meta itemprop="availability" content="https://schema.org/InStock" />
      <meta itemprop="availability" content="https://schema.org/OutOfStock" />`;
    expect(availability(html)).toBe('conflicting');
  });

  it('accepts repeated identical tokens', () => {
    const html = `
      <meta itemprop="availability" content="https://schema.org/InStock" />
      <meta itemprop="availability" content="https://schema.org/InStock" />`;
    expect(availability(html)).toBe('instock');
  });
});

describe('stock bullet reading', () => {
  const bullet = (html: string) => readSignals(html).bullet;

  it('reads the colour off the real bullet markup', () => {
    expect(bullet('<b><span class="stock green"></span>Lager</b>')).toBe('green');
  });

  it('refuses to guess between conflicting colours', () => {
    const html = '<span class="stock green"></span><span class="stock red"></span>';
    expect(bullet(html)).toBe('conflicting');
  });

  it('accepts the repeated identical bullets a real page carries', () => {
    const html = `
      <b><span class="stock red"></span>Ikke på lager</b>
      <div class="productAvailability"><span class="stock red"></span>Varen er ikke på lager.</div>`;
    expect(bullet(html)).toBe('red');
  });
});

describe('combineSignals', () => {
  const cases: Array<[StockSignals, string, boolean]> = [
    [{ availability: 'instock', bullet: 'green' }, 'in_stock', true],
    [{ availability: 'instock', bullet: 'yellow' }, 'in_stock', true],
    [{ availability: 'lowstock', bullet: 'orange' }, 'in_stock', true],
    [{ availability: 'outofstock', bullet: 'red' }, 'not_in_stock', true],
    [{ availability: 'soldout', bullet: 'red' }, 'not_in_stock', true],
    // Either signal saying "buyable" wins, because a missed restock costs more.
    [{ availability: 'outofstock', bullet: 'green' }, 'in_stock', false],
    [{ availability: 'instock', bullet: 'red' }, 'in_stock', false],
    [{ availability: 'none', bullet: 'green' }, 'in_stock', false],
    [{ availability: 'instock', bullet: 'none' }, 'in_stock', false],
    // Nothing buyable and nothing certain: admit we do not know.
    [{ availability: 'none', bullet: 'red' }, 'unknown', false],
    [{ availability: 'outofstock', bullet: 'none' }, 'unknown', false],
    [{ availability: 'none', bullet: 'none' }, 'unknown', false],
    [{ availability: 'conflicting', bullet: 'conflicting' }, 'unknown', false],
  ];

  it.each(cases)('%o -> %s (agreed: %s)', (signals, status, agreed) => {
    expect(combineSignals(signals)).toEqual({ status, agreed });
  });

  it('treats a pre-order or backorder as buyable', () => {
    expect(combineSignals({ availability: 'backorder', bullet: 'none' }).status).toBe('in_stock');
    expect(combineSignals({ availability: 'preorder', bullet: 'none' }).status).toBe('in_stock');
  });

  it('never reports not_in_stock while either signal says buyable', () => {
    for (const [signals] of cases) {
      const buyable = ['instock', 'lowstock'].includes(signals.availability) ||
        ['green', 'yellow', 'orange'].includes(signals.bullet);
      if (buyable) expect(combineSignals(signals).status).toBe('in_stock');
    }
  });

  it('treats an unrecognised availability token as unknown, not as in stock', () => {
    expect(combineSignals({ availability: 'instoreonly', bullet: 'none' }).status).toBe('unknown');
  });
});

describe('parseStockStatus', () => {
  it('reports sold out for the watched product', () => {
    expect(parseStockStatus(fixture('cs-out-of-stock.html'))).toBe('not_in_stock');
  });

  it('reports in stock for a real in-stock product', () => {
    expect(parseStockStatus(fixture('cs-in-stock.html'))).toBe('in_stock');
  });

  it('reports in stock for a "Fjernlager" product, which is still orderable', () => {
    expect(parseStockStatus(fixture('cs-low-stock.html'))).toBe('in_stock');
  });

  it('reports unknown for a non-product page, which answers 200 with no markup', () => {
    expect(parseStockStatus(fixture('cs-no-signals.html'))).toBe('unknown');
    expect(parseStockStatus('')).toBe('unknown');
  });
});

describe('parseProduct', () => {
  it('extracts the watched product, decoding the ™ and – it emits', () => {
    expect(parseProduct(fixture('cs-out-of-stock.html'))).toMatchObject({
      siteLabel: 'csmegastore.no',
      status: 'not_in_stock',
      agreed: true,
      title: 'Ombyggingssett til Luna™ babyseng 140 cm – Hvit',
      price: '1.399,00 NOK',
    });
  });

  it('extracts details from the in-stock page', () => {
    const product = parseProduct(fixture('cs-in-stock.html'));
    expect(product.status).toBe('in_stock');
    expect(product.agreed).toBe(true);
    expect(product.title).toBe('Leander Classic™ vugge, Lange ophængsbånd 4 stk. – Hvid');
    expect(product.price).toMatch(/ NOK$/);
  });

  it('reports the signals it read, so an uncertain alert can show them', () => {
    expect(parseProduct(fixture('cs-low-stock.html')).signals).toEqual({
      lagerstatus: 'instock',
      'lager-farve': 'yellow',
    });
  });

  it('appends the currency the shop prints separately from the amount', () => {
    const html = `
      <span itemprop="priceCurrency" content="NOK">NOK</span>
      <span itemprop="price" content="1399">1.399,00<meta itemprop="availability" /></span>`;
    expect(parseProduct(html).price).toBe('1.399,00 NOK');
  });

  it('falls back to the bare amount when no currency is given', () => {
    expect(parseProduct('<span itemprop="price" content="99">99,00</span>').price).toBe('99,00');
  });

  it('prefers the product h1 over the many <title> tags inside the page SVGs', () => {
    const product = parseProduct(fixture('cs-out-of-stock.html'));
    expect(product.title).not.toMatch(/^[0-9A-F-]{36}$/);
  });

  it('falls back to the document title when the h1 is missing', () => {
    expect(parseProduct('<title>Fallback navn</title>').title).toBe('Fallback navn');
  });

  it('collapses whitespace and strips nested markup in the title', () => {
    const html = '<h1 itemprop="name">\n  Leander <em>Luna</em>\n  140 cm\n</h1>';
    expect(parseProduct(html).title).toBe('Leander Luna 140 cm');
  });

  it('returns nulls rather than empty strings when nothing is found', () => {
    expect(parseProduct('<html></html>')).toEqual({
      siteLabel: 'csmegastore.no',
      status: 'unknown',
      signals: { lagerstatus: 'none', 'lager-farve': 'none' },
      agreed: false,
      title: null,
      price: null,
    });
  });
});

describe('adapter', () => {
  it('claims its own hostnames, with or without www', () => {
    expect(csMegastore.matches('https://www.csmegastore.no/i/24512506/x')).toBe(true);
    expect(csMegastore.matches('https://csmegastore.no/i/24512506/x')).toBe(true);
  });

  it('does not claim the other shop, or a lookalike host', () => {
    expect(csMegastore.matches('https://www.kids-world.dk/foo-p-1.html')).toBe(false);
    expect(csMegastore.matches('https://csmegastore.no.evil.example/i/1')).toBe(false);
  });

  it('asks the shop for Norwegian, not Danish', () => {
    expect(csMegastore.acceptLanguage).toMatch(/^nb-NO/);
  });
});
