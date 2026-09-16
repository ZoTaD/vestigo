/**
 * La flecha de plegar, dibujada y no escrita.
 *
 * Reemplaza al "▾" de texto (2026-09-16, dirección A): el glifo cambiaba de
 * tamaño y de peso según la fuente que lo resolviera, y en una misma página
 * había flechas de tres tamaños. Gira con CSS según `data-open` del padre.
 */
export default function Chevron({ className = "chevron" }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}
