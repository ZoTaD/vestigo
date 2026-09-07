import type { ReactNode } from "react";
import { useCopy } from "./i18n";

/**
 * La cabecera de toda sección del sitio, desde el rediseño del 2026-09-06.
 *
 * Una línea: el título a la izquierda, el control principal (selector de
 * banda, orden, buscador) a la derecha. La bajada que explica qué mide la
 * página **sigue en el HTML** —Google la lee, y es lo que distingue a Vestigo
 * de un sitio que sólo tira números— pero plegada detrás de "cómo se mide".
 * Antes ocupaba el 40 % del primer pantallazo en escritorio y una pantalla
 * entera en móvil (docs/design/2026-09-06-como-presentamos-los-datos-diseno.md,
 * §2.2).
 *
 * `meta` es la línea de metadatos de la medición (partidas, ventana, parche):
 * va debajo del título en gris chico, con "cómo se mide" al final.
 */
export default function SectionHead({
  eyebrow,
  title,
  accent,
  lead,
  controls,
  meta,
  as: Heading = "h1",
}: {
  /** Rótulo chico arriba del título ("Vestigo · Deadlock"). */
  eyebrow?: ReactNode;
  /** El título, en una palabra o dos. */
  title: ReactNode;
  /** La segunda parte del título, en el color de acento ("de héroes"). */
  accent?: ReactNode;
  /** Uno o más párrafos de bajada. Plegados; visibles al abrir "cómo se mide". */
  lead?: ReactNode | ReactNode[];
  /** El control principal de la página, a la derecha del título. */
  controls?: ReactNode;
  /** Metadatos de la medición, en la línea de abajo. */
  meta?: ReactNode;
  as?: "h1" | "h2";
}) {
  const copy = useCopy();
  const leads = lead === undefined ? [] : Array.isArray(lead) ? lead : [lead];
  const hasLead = leads.some((l) => l !== null && l !== undefined && l !== false);

  return (
    <header className="sechead">
      <div className="sechead-text">
        {eyebrow && <p className="sechead-eyebrow">{eyebrow}</p>}
        <Heading className="sechead-title">
          {title}
          {accent && <> <em>{accent}</em></>}
        </Heading>
      </div>

      {controls && <div className="sechead-controls">{controls}</div>}

      {(meta || hasLead) && (
        <div className="sechead-meta">
          {meta}
          {hasLead && (
            <details className="sechead-how">
              <summary>{copy.shell.how}</summary>
              {leads.map((l, i) => (
                <p className="sechead-lead" key={i}>
                  {l}
                </p>
              ))}
            </details>
          )}
        </div>
      )}
    </header>
  );
}
