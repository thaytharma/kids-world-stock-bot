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
 * GitHub Actions injects unset secrets and vars as empty strings, not as absent
 * keys, so `??` is not enough — an empty value must count as "not configured".
 */
const str = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
};

/**
 * Both notifiers are optional and independently configured: a missing one is
 * skipped rather than fatal, so email problems can never stop the push.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const urls = trimmedList(env.PRODUCT_URLS);
  const mailTo = trimmedList(env.MAIL_TO);

  const smtpHost = str(env.SMTP_HOST);
  const smtpUser = str(env.SMTP_USER);
  const smtpPass = str(env.SMTP_PASS);
  const port = Number(str(env.SMTP_PORT) ?? 587);

  const email: EmailConfig | null =
    smtpHost && smtpUser && smtpPass && mailTo.length > 0
      ? {
          host: smtpHost,
          port,
          secure: port === 465,
          user: smtpUser,
          pass: smtpPass,
          from: str(env.MAIL_FROM) ?? smtpUser,
          to: mailTo,
        }
      : null;

  const ntfyTopic = str(env.NTFY_TOPIC);

  return {
    urls: urls.length > 0 ? urls : DEFAULT_URLS,
    statePath: str(env.STATE_PATH) ?? 'state.json',
    ntfy: ntfyTopic
      ? { topic: ntfyTopic, server: str(env.NTFY_SERVER) ?? 'https://ntfy.sh' }
      : null,
    email,
  };
}
