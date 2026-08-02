import { describe, expect, it } from 'vitest';
import { BROKEN_RUN_THRESHOLD, decide, type CheckResult } from '../src/decide.js';
import type { ProductState } from '../src/state.js';

const URL = 'https://www.kids-world.dk/leander-luna-p-261365.html';
const NOW = '2026-08-02T20:00:00.000Z';

const seen = (status: StockLike, overrides: Partial<ProductState> = {}): ProductState => ({
  status,
  brokenRuns: 0,
  brokenWarningSent: false,
  restockNotified: status === 'in_stock',
  lastCheckedAt: '2026-08-02T19:45:00.000Z',
  ...overrides,
});

type StockLike = ProductState['status'];

const page = (status: 'in_stock' | 'not_in_stock' | 'unknown'): CheckResult => ({
  ok: true,
  snapshot: { status, rawMarker: status, title: 'Leander Luna', price: '899,95 kr.' },
});

const failure = (error = 'HTTP 503'): CheckResult => ({ ok: false, error });

describe('decide — restock notification', () => {
  it('notifies when an out-of-stock product comes back', () => {
    const { notification } = decide(URL, seen('not_in_stock'), page('in_stock'), NOW);
    expect(notification).toMatchObject({ kind: 'restock', priority: 5, url: URL });
    expect(notification?.body).toContain('Leander Luna');
    expect(notification?.body).toContain('Pris: 899,95 kr.');
    expect(notification?.body).not.toContain('kr..');
  });

  it('notifies on the very first run if the product is already in stock', () => {
    const { notification } = decide(URL, undefined, page('in_stock'), NOW);
    expect(notification?.kind).toBe('restock');
  });

  it('notifies after a broken streak resolves into in_stock', () => {
    const previous = seen('unknown', { brokenRuns: 4, brokenWarningSent: true, restockNotified: false });
    const { notification, next } = decide(URL, previous, page('in_stock'), NOW);
    expect(notification?.kind).toBe('restock');
    expect(next.brokenRuns).toBe(0);
    expect(next.brokenWarningSent).toBe(false);
  });

  it('stays silent while the product remains in stock', () => {
    const { notification } = decide(URL, seen('in_stock'), page('in_stock'), NOW);
    expect(notification).toBeNull();
  });

  it('records the delivery so repeat runs stay silent', () => {
    const first = decide(URL, seen('not_in_stock'), page('in_stock'), NOW);
    expect(first.next.restockNotified).toBe(true);
    expect(decide(URL, first.next, page('in_stock'), NOW).notification).toBeNull();
  });

  it('re-arms after the product sells out again', () => {
    const soldOut = decide(URL, seen('in_stock'), page('not_in_stock'), NOW);
    expect(soldOut.notification).toBeNull();
    expect(soldOut.next.restockNotified).toBe(false);
    expect(decide(URL, soldOut.next, page('in_stock'), NOW).notification?.kind).toBe('restock');
  });

  it('stamps lastInStockAt only while in stock', () => {
    const inStock = decide(URL, seen('not_in_stock'), page('in_stock'), NOW);
    expect(inStock.next.lastInStockAt).toBe(NOW);

    const later = decide(URL, inStock.next, page('not_in_stock'), '2026-08-03T20:00:00.000Z');
    expect(later.next.lastInStockAt).toBe(NOW);
  });
});

describe('decide — steady state', () => {
  it('stays silent when the product is still sold out', () => {
    const { notification, next } = decide(URL, seen('not_in_stock'), page('not_in_stock'), NOW);
    expect(notification).toBeNull();
    expect(next.status).toBe('not_in_stock');
    expect(next.lastCheckedAt).toBe(NOW);
  });

  it('stays silent on the first ever sold-out check', () => {
    expect(decide(URL, undefined, page('not_in_stock'), NOW).notification).toBeNull();
  });
});

describe('decide — self-monitoring', () => {
  it('does not cry wolf on a single unparseable page', () => {
    const { notification, next } = decide(URL, seen('not_in_stock'), page('unknown'), NOW);
    expect(notification).toBeNull();
    expect(next.brokenRuns).toBe(1);
  });

  it('warns once the failures reach the threshold', () => {
    let state = seen('not_in_stock');
    const notifications = [];
    for (let run = 0; run < BROKEN_RUN_THRESHOLD; run++) {
      const outcome = decide(URL, state, page('unknown'), NOW);
      state = outcome.next;
      notifications.push(outcome.notification);
    }
    expect(notifications.slice(0, -1).every((n) => n === null)).toBe(true);
    expect(notifications.at(-1)).toMatchObject({ kind: 'broken', priority: 3 });
    expect(notifications.at(-1)?.body).toContain('layout change');
  });

  it('warns only once per broken streak', () => {
    const previous = seen('unknown', {
      brokenRuns: BROKEN_RUN_THRESHOLD,
      brokenWarningSent: true,
    });
    expect(decide(URL, previous, page('unknown'), NOW).notification).toBeNull();
  });

  it('counts fetch errors towards the same threshold and reports the cause', () => {
    let state = seen('not_in_stock');
    let last = null;
    for (let run = 0; run < BROKEN_RUN_THRESHOLD; run++) {
      const outcome = decide(URL, state, failure('HTTP 404'), NOW);
      state = outcome.next;
      last = outcome.notification;
    }
    expect(state.status).toBe('fetch_error');
    expect(last?.kind).toBe('broken');
    expect(last?.body).toContain('HTTP 404');
  });

  it('mixes unknown and fetch errors into one streak', () => {
    const results: CheckResult[] = [page('unknown'), failure(), page('unknown')];
    let state = seen('not_in_stock');
    let last = null;
    for (const result of results) {
      const outcome = decide(URL, state, result, NOW);
      state = outcome.next;
      last = outcome.notification;
    }
    expect(state.brokenRuns).toBe(3);
    expect(last?.kind).toBe('broken');
  });

  it('resets the streak and re-arms the warning once checks recover', () => {
    const previous = seen('unknown', { brokenRuns: 9, brokenWarningSent: true });
    const recovered = decide(URL, previous, page('not_in_stock'), NOW);
    expect(recovered.next.brokenRuns).toBe(0);
    expect(recovered.next.brokenWarningSent).toBe(false);

    let state = recovered.next;
    let last = null;
    for (let run = 0; run < BROKEN_RUN_THRESHOLD; run++) {
      const outcome = decide(URL, state, page('unknown'), NOW);
      state = outcome.next;
      last = outcome.notification;
    }
    expect(last?.kind).toBe('broken');
  });

  it('keeps the last known title and price through failures, for readable alerts', () => {
    const previous = seen('not_in_stock', { title: 'Leander Luna', price: '899,95 kr.' });
    const { next } = decide(URL, previous, failure(), NOW);
    expect(next.title).toBe('Leander Luna');
    expect(next.price).toBe('899,95 kr.');
  });

  it('falls back to the url when no title has ever been seen', () => {
    let state = seen('not_in_stock');
    let last = null;
    for (let run = 0; run < BROKEN_RUN_THRESHOLD; run++) {
      const outcome = decide(URL, state, failure(), NOW);
      state = outcome.next;
      last = outcome.notification;
    }
    expect(last?.body).toContain(URL);
  });
});
