/**
 * Los partidos de `Liquipedia:Matches` (2026-11-03, etapa 6a): lee el HTML que devuelve la API (`action=parse`) y
 * arma la lista de próximos y jugados. Lo usa la función de Netlify (`handler.ts`), no el navegador. El HTML es dato
 * no confiable: sólo se lee con expresiones regulares y lo que sale es texto.
 */

/** Un rival. A definir: `slug: null` y nombres vacíos. */
export type Side = { slug: string | null; name: string; short: string };
export type Match = { t: number; a: Side; b: Side; score: [number, number] | null; bo: number | null; tour: { slug: string; name: string } };

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENT[m]);

/** El rival de un bloque `match-info-header-opponent`: su página en Liquipedia, el nombre y el corto. */
function side(block: string): Side {
  const m = block.match(/class="name"[^>]*><a href="\/counterstrike\/([^"#]+)" title="([^"]+)">([^<]*)<\/a>/);
  return m ? { slug: m[1], name: unescape(m[2]), short: unescape(m[3]) } : { slug: null, name: "", short: "" };
}

export function parseMatches(html: string): Match[] {
  return html
    .split('<div class="match-info">')
    .slice(1)
    .map((p): Match => {
      const t = Number(p.match(/data-timestamp="(\d+)"/)?.[1] ?? 0);
      // Los dos rivales: el bloque que empieza en cada `match-info-header-opponent` hasta el siguiente.
      const blocks = p.split(/class="match-info-header-opponent/).slice(1);
      const scores = [...p.matchAll(/class="match-info-header-scoreholder-score[^"]*">(\d+)</g)].map((m) => Number(m[1]));
      const bo = p.match(/\(Bo(\d+)\)/);
      const tour = p.match(/match-info-tournament-name"><a href="\/counterstrike\/([^"#]+)[^"]*" title="[^"]*"><span>([^<]*)<\/span>/);
      return {
        t,
        a: side(blocks[0] ?? ""),
        b: side(blocks[1] ?? ""),
        score: scores.length === 2 ? [scores[0], scores[1]] : null,
        bo: bo ? Number(bo[1]) : null,
        tour: { slug: tour?.[1] ?? "", name: unescape(tour?.[2] ?? "") },
      };
    })
    .filter((m) => m.t > 0);
}
