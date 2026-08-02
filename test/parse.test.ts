import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProduct, parseStockStatus } from '../src/parse.js';

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

describe('parseStockStatus', () => {
  it('reads the out-of-stock marker from the real product page', () => {
    expect(parseStockStatus(fixture('out-of-stock.html'))).toBe('not_in_stock');
  });

  it('reads the in-stock marker from a real product page', () => {
    expect(parseStockStatus(fixture('in-stock.html'))).toBe('in_stock');
  });

  it('reports unknown rather than guessing when the marker is gone', () => {
    expect(parseStockStatus(fixture('marker-missing.html'))).toBe('unknown');
  });

  it('reports unknown when the marker value is one we do not recognise', () => {
    const html = '<span class="stockStatusBullet stockStatusBullet--on_backorder">Bestilt</span>';
    expect(parseStockStatus(html)).toBe('unknown');
  });

  it('refuses to guess when several conflicting markers are present', () => {
    const html = `
      <span class="stockStatusBullet stockStatusBullet--not_in_stock">Udsolgt</span>
      <span class="stockStatusBullet stockStatusBullet--in_stock">På lager</span>`;
    expect(parseStockStatus(html)).toBe('unknown');
  });

  it('accepts repeated identical markers', () => {
    const html = `
      <span class="stockStatusBullet stockStatusBullet--in_stock">På lager</span>
      <span class="stockStatusBullet stockStatusBullet--in_stock">På lager</span>`;
    expect(parseStockStatus(html)).toBe('in_stock');
  });

  it('treats an empty page as unknown', () => {
    expect(parseStockStatus('')).toBe('unknown');
  });
});

describe('parseProduct', () => {
  it('extracts title and price for the watched product', () => {
    const product = parseProduct(fixture('out-of-stock.html'));
    expect(product).toMatchObject({
      status: 'not_in_stock',
      rawMarker: 'not_in_stock',
      title: 'Leander Luna Ombygningssæt Til Babyseng - 140 cm - Hvid',
      price: '899,95 kr.',
    });
  });

  it('extracts details from the in-stock page', () => {
    const product = parseProduct(fixture('in-stock.html'));
    expect(product.status).toBe('in_stock');
    expect(product.price).toBe('499,95 kr.');
    expect(product.title).toContain('Leander Classic Bakke');
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
      rawMarker: null,
      title: null,
      price: null,
    });
  });
});
