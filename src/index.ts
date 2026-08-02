import { loadConfig, type Config } from './config.js';
import { decide, type CheckResult, type Notification } from './decide.js';
import { fetchPage } from './fetch.js';
import { parseProduct } from './parse.js';
import { loadState, saveState } from './state.js';
import { sendEmail } from './notify/email.js';
import { sendNtfy } from './notify/ntfy.js';

async function check(url: string): Promise<CheckResult> {
  try {
    return { ok: true, snapshot: parseProduct(await fetchPage(url)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Deliver over every configured channel; one failing channel must not silence the others. */
async function deliver(config: Config, notification: Notification): Promise<boolean> {
  const channels: Array<[string, () => Promise<void>]> = [];
  if (config.ntfy) channels.push(['ntfy', () => sendNtfy(config.ntfy!, notification)]);
  if (config.email) channels.push(['email', () => sendEmail(config.email!, notification)]);

  if (channels.length === 0) {
    console.warn('! no notification channel configured — set NTFY_TOPIC and/or SMTP_*');
    return false;
  }

  const results = await Promise.allSettled(channels.map(([, send]) => send()));
  results.forEach((result, index) => {
    const name = channels[index]![0];
    if (result.status === 'fulfilled') console.log(`  sent via ${name}`);
    else console.error(`  FAILED via ${name}: ${String(result.reason)}`);
  });

  return results.some((result) => result.status === 'fulfilled');
}

/**
 * Verify the notification wiring without waiting for a real restock. Touches no
 * state, so it can be run any time.
 */
async function sendTestNotification(config: Config): Promise<void> {
  const delivered = await deliver(config, {
    kind: 'restock',
    title: 'Stock bot test',
    body: 'Test notification — the bot is wired up correctly. Æøå works too.',
    url: config.urls[0] ?? 'https://www.kids-world.dk',
    priority: 3,
    tags: ['white_check_mark'],
  });
  if (!delivered) process.exitCode = 1;
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);

  if (process.env.TEST_NOTIFICATION) {
    await sendTestNotification(config);
    return;
  }

  const state = await loadState(config.statePath);
  const now = new Date().toISOString();
  let failedDelivery = false;

  for (const url of config.urls) {
    const result = await check(url);
    const { next, notification } = decide(url, state.products[url], result, now);
    state.products[url] = next;

    const detail = result.ok
      ? `marker=${result.snapshot.signals.marker} cart=${result.snapshot.signals.cartButton}`
      : `error: ${result.error}`;
    console.log(`${next.status.padEnd(13)} [${detail}] ${next.title ?? url}`);

    if (notification) {
      console.log(`> notifying: ${notification.title}`);
      const delivered = await deliver(config, notification);
      if (!delivered) {
        failedDelivery = true;
        // Nobody heard it, so do not mark it as sent — retry on the next run.
        if (notification.kind === 'broken') next.brokenWarningSent = false;
        if (notification.kind === 'restock') next.restockNotified = false;
      }
    }
  }

  await saveState(config.statePath, state);

  // Fail the CI run so a broken notification path is visible, not silent.
  if (failedDelivery) process.exitCode = 1;
}

await main();
