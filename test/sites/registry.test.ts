import { describe, expect, it } from 'vitest';
import { DEFAULT_URLS } from '../../src/config.js';
import { SITES, siteFor } from '../../src/sites/index.js';
import { parseProduct } from '../../src/parse.js';

describe('siteFor', () => {
  it('routes each shop to its own parser', () => {
    expect(siteFor('https://www.kids-world.dk/foo-p-1.html').id).toBe('kids-world');
    expect(siteFor('https://www.csmegastore.no/i/24512506/x').id).toBe('cs-megastore');
  });

  /**
   * Better to fail loudly: a URL nobody can parse would otherwise sit in the
   * state file reporting "not in stock" forever.
   */
  it('throws for a shop it does not know', () => {
    expect(() => siteFor('https://www.example.com/product')).toThrow(/unsupported shop/);
  });

  it('throws for something that is not a URL at all', () => {
    expect(() => siteFor('kids-world.dk/foo')).toThrow(/unsupported shop/);
  });

  it('has a parser for every watched URL', () => {
    for (const url of DEFAULT_URLS) expect(() => siteFor(url)).not.toThrow();
  });

  it('gives every shop a distinct id and label', () => {
    expect(new Set(SITES.map((site) => site.id)).size).toBe(SITES.length);
    expect(new Set(SITES.map((site) => site.label)).size).toBe(SITES.length);
  });
});

describe('parseProduct', () => {
  it('picks the parser from the URL, so each page is read the right way', () => {
    const kidsWorld = '<span class="stockStatusBullet stockStatusBullet--not_in_stock">Udsolgt</span>';
    expect(parseProduct('https://www.kids-world.dk/x-p-1.html', kidsWorld)).toMatchObject({
      siteLabel: 'kids-world.dk',
      status: 'not_in_stock',
    });

    const csMegastore =
      '<meta itemprop="availability" content="https://schema.org/OutOfStock" /><span class="stock red"></span>';
    expect(parseProduct('https://www.csmegastore.no/i/1/x', csMegastore)).toMatchObject({
      siteLabel: 'csmegastore.no',
      status: 'not_in_stock',
    });
  });
});
