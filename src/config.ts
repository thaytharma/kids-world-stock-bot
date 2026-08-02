import type { EmailConfig } from './notify/email.js';
import type { NtfyConfig } from './notify/ntfy.js';

export interface Config {
  urls: string[];
  statePath: string;
  ntfy: NtfyConfig | null;
  email: EmailConfig | null;
}

export const DEFAULT_URLS = [
  'https://www.kids-world.dk/leander-luna-ombygningssaet-til-babyseng-140-cm-hvid-p-261365.html',
];

const trimmedList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

/**
 * Both notifiers are optional and independently configured: a missing one is
 * skipped rather than fatal, so email problems can never stop the push.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const urls = trimmedList(env.PRODUCT_URLS);
  const mailTo = trimmedList(env.MAIL_TO);
  const port = Number(env.SMTP_PORT ?? 587);

  const email: EmailConfig | null =
    env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && mailTo.length > 0
      ? {
          host: env.SMTP_HOST,
          port,
          secure: port === 465,
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
          from: env.MAIL_FROM ?? env.SMTP_USER,
          to: mailTo,
        }
      : null;

  return {
    urls: urls.length > 0 ? urls : DEFAULT_URLS,
    statePath: env.STATE_PATH ?? 'state.json',
    ntfy: env.NTFY_TOPIC ? { topic: env.NTFY_TOPIC, server: env.NTFY_SERVER ?? 'https://ntfy.sh' } : null,
    email,
  };
}
