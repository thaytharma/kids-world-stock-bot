import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  combineSignals,
  parseProduct,
  parseStockStatus,
  readSignals,
  type StockSignals,
} from '../src/parse.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

describe('readSignals on real pages', () => {
  it('reads both signals as sold out on the watched Leander Luna kit', () => {
    expect(readSignals(fixture('out-of-stock.html'))).toEqual({
      marker: 'not_in_stock',
      cartButton: 'absent',
    });
  });

  it('reads both signals as sold out on a second real sold-out page', () => {
    expect(readSignals(fixture('out-of-stock-2.html'))).toEqual({
      marker: 'not_in_stock',
      cartButton: 'absent',
    });
  });

  it('reads both signals as in stock on a real in-stock page', () => {
    expect(readSignals(fixture('in-stock.html'))).toEqual({
      marker: 'in_stock',
      cartButton: 'present',
    });
  });

  it('still finds the cart button when the marker is gone', () => {
    expect(readSignals(fixture('marker-missing.html'))).toEqual({
      marker: 'unknown',
      cartButton: 'present',
    });
  });
});

describe('marker reading', () => {
  it('ignores the label text, which varies between in-stock products', () => {
    const withDelivery =
      '<span class="stockStatusBullet stockStatusBullet--in_stock"><strong>P&aring; lager - Sendes indenfor 24 timer</strong></span>';
    expect(readSignals(withDelivery).marker).toBe('in_stock');
  });

  it('treats an unrecognised marker value as unknown', () => {
    const html = '<span class="stockStatusBullet stockStatusBullet--on_backorder">Bestilt</span>';
    expect(readSignals(html).marker).toBe('unknown');
  });

  it('refuses to guess between conflicting markers', () => {
    const html = `
      <span class="stockStatusBullet stockStatusBullet--not_in_stock">Udsolgt</span>
      <span class="stockStatusBullet stockStatusBullet--in_stock">På lager</span>`;
    expect(readSignals(html).marker).toBe('unknown');
  });

  it('accepts repeated identical markers', () => {
    const html = `
      <span class="stockStatusBullet stockStatusBullet--in_stock">På lager</span>
      <span class="stockStatusBullet stockStatusBullet--in_stock">På lager</span>`;
    expect(readSignals(html).marker).toBe('in_stock');
  });
});

describe('cart button detection', () => {
  const cartButton = (html: string) => readSignals(html).cartButton;

  it('matches the real button markup', () => {
    const html =
      '<button class="bigButton button success cartAddProduct " data-products-id="104390">L&aelig;g i kurv</button>';
    expect(cartButton(html)).toBe('present');
  });

  it('is absent when there is no such button', () => {
    expect(cartButton('<button class="button button--favorites">Gem</button>')).toBe('absent');
  });

  it('does not mistake the basket link in the site header for a buy button', () => {
    const header = `
      <a href="/shopping_cart.php"><span>Indk&oslash;bskurv</span></a>
      <a href="/shopping_cart.php" class="cart-top-button button success">G&aring; til indk&oslash;bskurven</a>
      <div id="productAddToCartBox">Tilf&oslash;jet kurv</div>`;
    expect(cartButton(header)).toBe('absent');
  });

  it('requires the class to be on a button element', () => {
    expect(cartButton('<div class="cartAddProduct">not a button</div>')).toBe('absent');
  });
});

describe('combineSignals', () => {
  const cases: Array<[StockSignals, string, boolean]> = [
    [{ marker: 'in_stock', cartButton: 'present' }, 'in_stock', true],
    [{ marker: 'not_in_stock', cartButton: 'absent' }, 'not_in_stock', true],
    [{ marker: 'in_stock', cartButton: 'absent' }, 'in_stock', false],
    [{ marker: 'not_in_stock', cartButton: 'present' }, 'in_stock', false],
    [{ marker: 'unknown', cartButton: 'present' }, 'in_stock', false],
    [{ marker: 'unknown', cartButton: 'absent' }, 'unknown', false],
  ];

  it.each(cases)('%o -> %s (agreed: %s)', (signals, status, agreed) => {
    expect(combineSignals(signals)).toEqual({ status, agreed });
  });

  it('never reports not_in_stock while the item is still buyable', () => {
    const buyable = cases.filter(([s]) => s.cartButton === 'present');
    expect(buyable.every(([, status]) => status === 'in_stock')).toBe(true);
  });

  it('reports in_stock whenever either signal says so, to avoid missing a restock', () => {
    for (const [signals] of cases) {
      const eitherSaysBuyable =
        signals.marker === 'in_stock' || signals.cartButton === 'present';
      if (eitherSaysBuyable) expect(combineSignals(signals).status).toBe('in_stock');
    }
  });
});

describe('parseStockStatus', () => {
  it('reports sold out for the watched product', () => {
    expect(parseStockStatus(fixture('out-of-stock.html'))).toBe('not_in_stock');
  });

  it('reports in stock for a real in-stock product', () => {
    expect(parseStockStatus(fixture('in-stock.html'))).toBe('in_stock');
  });

  it('still reports in stock from the cart button alone', () => {
    expect(parseStockStatus(fixture('marker-missing.html'))).toBe('in_stock');
  });

  it('reports unknown only when both signals are missing', () => {
    expect(parseStockStatus('<html><body>Ups</body></html>')).toBe('unknown');
    expect(parseStockStatus('')).toBe('unknown');
  });
});

describe('parseProduct', () => {
  it('extracts title, price and agreement for the watched product', () => {
    expect(parseProduct(fixture('out-of-stock.html'))).toMatchObject({
      status: 'not_in_stock',
      agreed: true,
      title: 'Leander Luna Ombygningssæt Til Babyseng - 140 cm - Hvid',
      price: '899,95 kr.',
    });
  });

  it('extracts details from the in-stock page', () => {
    const product = parseProduct(fixture('in-stock.html'));
    expect(product.status).toBe('in_stock');
    expect(product.agreed).toBe(true);
    expect(product.title).toBe('Leander Classic Vange - Hvid');
    expect(product.price).toMatch(/kr\.$/);
  });

  it('flags disagreement when only the cart button is found', () => {
    const product = parseProduct(fixture('marker-missing.html'));
    expect(product.status).toBe('in_stock');
    expect(product.agreed).toBe(false);
  });

  it('decodes the entity-encoded Danish characters the site emits', () => {
    const html = '<h1 class="speakable-h1">P&aring; l&aelig;ger &oslash;st &amp; vest</h1>';
    expect(parseProduct(html).title).toBe('På læger øst & vest');
  });

  it('decodes numeric entities', () => {
    const html = '<h1 class="speakable-h1">Caf&#233; &#x2014; bl&#xe5;</h1>';
    expect(parseProduct(html).title).toBe('Café — blå');
  });

  it('leaves unknown entities untouched instead of mangling them', () => {
    const html = '<h1 class="speakable-h1">a &frobnicate; b</h1>';
    expect(parseProduct(html).title).toBe('a &frobnicate; b');
  });

  it('falls back to the document title when the h1 is missing', () => {
    const html = '<title id="speakable-title">Fallback navn</title>';
    expect(parseProduct(html).title).toBe('Fallback navn');
  });

  it('collapses whitespace and strips nested markup in the title', () => {
    const html = '<h1 class="speakable-h1">\n  Leander <em>Luna</em>\n  140 cm\n</h1>';
    expect(parseProduct(html).title).toBe('Leander Luna 140 cm');
  });

  it('returns nulls rather than empty strings when nothing is found', () => {
    expect(parseProduct('<html></html>')).toEqual({
      status: 'unknown',
      signals: { marker: 'unknown', cartButton: 'absent' },
      agreed: false,
      title: null,
      price: null,
    });
  });
});
