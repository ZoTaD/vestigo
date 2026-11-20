/** El nombre de un mapa a partir de su slug (`arabian-desert` → "Arabian Desert"), hasta que la Task 9 traiga los nombres del juego. */
export const mapName = (slug: string): string =>
  slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
