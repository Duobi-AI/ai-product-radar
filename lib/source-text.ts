const namedEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: '"',
};

/** Decode one layer of common source-provided HTML references for text rendering. */
export function sourceDescriptionForDisplay(description: string): string {
  return description.replace(/&(?:amp|apos|gt|lt|nbsp|quot|#(?:x[0-9a-f]+|[0-9]+));/gi, (reference) => {
    const value = reference.slice(1, -1).toLowerCase();
    if (!value.startsWith("#")) return namedEntities[value] ?? reference;

    const hex = value.startsWith("#x");
    const codePoint = Number.parseInt(value.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
      && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
      ? String.fromCodePoint(codePoint)
      : reference;
  });
}
