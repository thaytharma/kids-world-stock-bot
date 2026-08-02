/**
 * HTML helpers shared by the site parsers. Kept apart from `parse.ts` so the
 * site modules can use them without importing the module that imports them.
 */

/** Decode the handful of entities the shops actually emit, plus numeric ones. */
export function decodeEntities(input: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    aring: 'å',
    Aring: 'Å',
    aelig: 'æ',
    AElig: 'Æ',
    oslash: 'ø',
    Oslash: 'Ø',
  };
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) => named[name] ?? whole);
}

export function clean(input: string): string {
  return decodeEntities(input.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

export function extract(html: string, pattern: RegExp): string | null {
  const found = pattern.exec(html)?.[1];
  if (found === undefined) return null;
  const text = clean(found);
  return text === '' ? null : text;
}

/**
 * Every distinct capture of a global pattern. Used by both shops to refuse to
 * guess when a page carries more than one, disagreeing, stock marker.
 */
export function distinctMatches(html: string, pattern: RegExp): string[] {
  return [...new Set([...html.matchAll(pattern)].map((match) => match[1]!.toLowerCase()))];
}
