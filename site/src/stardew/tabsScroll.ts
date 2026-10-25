/**
 * La barra de pestañas de Stardew Valley en el teléfono (2026-10-25): con 14 pestañas, en renglones ocupaba un tercio
 * de la pantalla; en el teléfono va en una sola fila que se desliza de costado (`.sd-tabs` en stardew.css). Acá, las
 * cuentas: dónde dejar el desplazamiento para que la pestaña abierta quede a la vista, y de qué lado queda más por ver
 * (el degradé del borde). Sin DOM, así se prueban solas.
 */

/** Hasta dónde desplazar la barra para que la pestaña (`left` y `width` dentro de la barra) quede al centro, sin pasarse. */
export function tabScrollLeft(tab: { left: number; width: number }, visible: number, total: number): number {
  const max = Math.max(0, total - visible);
  return Math.min(max, Math.max(0, Math.round(tab.left - (visible - tab.width) / 2)));
}

export type TabsMore = "none" | "left" | "right" | "both";

/** De qué lado queda más por ver. Un píxel de redondeo en cada punta cuenta como la punta. */
export function tabsMore(scrollLeft: number, visible: number, total: number): TabsMore {
  const left = scrollLeft > 1;
  const right = scrollLeft + visible < total - 1;
  return left && right ? "both" : left ? "left" : right ? "right" : "none";
}
