# kids-world stock bot

Watches product pages on [kids-world.dk](https://www.kids-world.dk) and pushes a
notification the moment a sold-out item is back in stock.

Default target: **Leander Luna Ombygningssæt Til Babyseng – 140 cm – Hvid**
([product page](https://www.kids-world.dk/leander-luna-ombygningssaet-til-babyseng-140-cm-hvid-p-261365.html)),
which customer service confirmed is on their replenishment list with no ETA.

## How it works

The product pages are server-rendered, so no headless browser is needed. Two
**independent** signals are read from the HTML:

1. **The status marker**

   | HTML | Meaning |
   | --- | --- |
   | `stockStatusBullet--in_stock` → `På lager` | in stock |
   | `stockStatusBullet--not_in_stock` → `Udsolgt` | sold out |

   Only the class modifier is read, never the label — the label varies
   (`På lager`, `På lager - Sendes indenfor 24 timer`).

2. **The `Læg i kurv` button** (`<button class="... cartAddProduct">`), which the
   server omits entirely when the item cannot be bought.

Verified across 45 live pages — 40 in stock, 5 sold out — with zero
disagreements between the two signals.

### Why either signal is enough

The two signals are combined in favour of catching a restock, because the costs
are asymmetric: a false alarm wastes one click, a missed restock loses the
product. So if *either* signal says the item is buyable, the bot notifies.

| marker | cart button | result | wording |
| --- | --- | --- | --- |
| `in_stock` | present | in stock | "På lager nu!" |
| `not_in_stock` | absent | sold out | silent |
| `in_stock` | absent | in stock | "Måske på lager" + which signals disagreed |
| `not_in_stock` | present | in stock | "Måske på lager" + which signals disagreed |
| unknown | present | in stock | "Måske på lager" + which signals disagreed |
| unknown | absent | unknown | see below |

Only when **both** signals vanish does the bot conclude nothing. After three
consecutive such checks (or fetch failures) it notifies **you** that it is
probably broken. A scraper that silently stops working is what would actually
cost you the kit.

Sold-out products are hidden from the site's own search and category listings,
which is why the target is reachable only by direct URL.

### Notification rules

| Transition | Action |
| --- | --- |
| → in stock (not yet notified for this streak) | 🚨 priority-5 push + email, links to the product |
| in stock → in stock (already notified) | silent |
| → sold out | silent, and re-arms the next restock alert |
| 3× consecutive unknown / fetch failure | ⚠️ one "bot may be broken" alert |

`state.json` is committed back by the workflow so state survives between runs. A
notification is only recorded as sent if at least one channel accepted it —
otherwise it retries on the next run.

## Setup

The bot runs on GitHub Actions every 15 minutes. Configure these in
**Settings → Secrets and variables → Actions**.

### Secrets

| Secret | Required | Notes |
| --- | --- | --- |
| `NTFY_TOPIC` | for push | Your ntfy topic. **Treat it as a password** — anyone who knows it can read and post to it. Use something unguessable, e.g. `kw-leander-7f3a91`. |
| `SMTP_HOST` | for email | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | no | Defaults to `587`. Use `465` for implicit TLS. |
| `SMTP_USER` | for email | SMTP username |
| `SMTP_PASS` | for email | SMTP password. Gmail requires an [app password](https://myaccount.google.com/apppasswords), not your account password. |
| `MAIL_TO` | for email | Recipient(s), comma-separated |
| `MAIL_FROM` | no | Defaults to `SMTP_USER` |

Each channel is independent: configure one or both. A missing channel is skipped,
and one channel failing never silences the other.

### Variables

| Variable | Notes |
| --- | --- |
| `PRODUCT_URLS` | Comma-separated product URLs. Defaults to the Leander Luna kit. |
| `NTFY_SERVER` | Defaults to `https://ntfy.sh`. Set only if self-hosting. |

### Receiving the push

Install the ntfy app ([iOS](https://apps.apple.com/us/app/ntfy/id1625396347) /
[Android](https://play.google.com/store/apps/details?id=io.heckel.ntfy)) and
subscribe to the same topic you put in `NTFY_TOPIC`.

### Verifying the setup

Don't wait for a real restock to find out whether the wiring works:

**Actions → Check stock → Run workflow → tick "Send a test notification"**

That sends a test push/email through every configured channel and touches no
state. Locally the same thing is `TEST_NOTIFICATION=1 pnpm check`.

## Local use

```sh
pnpm install
pnpm test         # 94 tests
pnpm typecheck
pnpm check        # one check run against the live site
```

Put credentials in a `.env` file (gitignored) and run:

```sh
node --env-file=.env node_modules/.bin/tsx src/index.ts
```

`STATE_PATH` overrides where state is written, which is handy for local runs:

```sh
STATE_PATH=/tmp/state.json pnpm check
```

## Caveats

- **Actions cron is best-effort.** Runs can be delayed by several minutes under
  load, so a restock that sells out fast could still be missed. The schedule is
  offset off the top of the hour to reduce this.
- **GitHub disables scheduled workflows after 60 days of repository inactivity.**
  The bot's own `state.json` commits may not reset that timer. GitHub emails you
  before disabling — push any commit, or re-enable it from the Actions tab.
- The parser is specific to kids-world.dk's markup. Adding another retailer means
  adding another parse module; the notification and state layers are generic.
