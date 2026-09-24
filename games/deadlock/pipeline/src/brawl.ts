import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { blendRows, heroesFileFrom, ratesFrom } from "./build";
import { fetchLiveCounts, BRAWL_PLAYERS_PER_MATCH, type LiveQuery } from "./liveStats";
import { fetchPatches, patchWindows, prePatchWeight } from "./patches";
import { MAX_WINDOW_DAYS, PROVISIONAL_MATCHES } from "./snapshot";

/**
 * La tier list de Street Brawl.
 *
 *   npm run build:brawl
 *
 * **Otro juego, otra lista.** Street Brawl es 4 contra 4, dura ~13 minutos
 * (medido: 789 s de media) contra los ~38 del normal, y no tiene cola
 * rankeada. La tier list de siempre lo excluye a propósito
 * (`PLAYED_GAME_MODE`), y el 2026-09-24 era el único formato que todos los
 * sitios de Deadlock publicaban y nosotros no.
 *
 * **Sin bandas, y no por elección.** Street Brawl no reparte rango: el lake no
 * le trae insignia a ninguna de sus partidas (0 de 39.514 en una semana) y la
 * API contesta con error al filtro por insignia en este modo. Es una lista de
 * todos los que lo juegan, y la página lo dice.
 *
 * **Sale de la API en vivo** (`/v1/analytics/hero-stats?game_mode=street_brawl`)
 * y no del lake: son tres pedidos chicos contra minutos de DuckDB, y no depende
 * de que el lake esté al día. Son las mismas cuentas que da el lake —partidas y
 * victorias por héroe—; medido sobre los mismos tres días, la API trae un 13%
 * más de partidas (17.522 contra 15.473), las que el lake todavía no juntó.
 *
 * Todo lo demás es la regla de la tier list rankeada, para que las dos se lean
 * igual: la ventana de quince días con las partidas de antes del parche
 * pesando cada vez menos (`prePatchWeight`), el encogimiento hacia 50% y el
 * "de → a" del parche.
 */

const OUT_DIR = "../data";
const OUT = `${OUT_DIR}/brawl.json`;

const BRAWL: LiveQuery = { gameMode: "street_brawl", playersPerMatch: BRAWL_PLAYERS_PER_MATCH };

async function main() {
  const patches = await fetchPatches();
  const patch = patches[0];
  const ahora = new Date();

  const { after, before } = patchWindows(patch.date, ahora, MAX_WINDOW_DAYS);
  const desde = new Date(ahora.getTime() - MAX_WINDOW_DAYS * 86_400_000).toISOString();
  const hasta = ahora.toISOString();
  const pre = after.from > desde ? { from: desde, to: after.from } : null;

  const t = Date.now();
  const cPost = await fetchLiveCounts(after.from, hasta, null, BRAWL);
  const alpha = prePatchWeight(cPost.matches, PROVISIONAL_MATCHES);
  const cPre = pre && alpha > 0 ? await fetchLiveCounts(pre.from, pre.to, null, BRAWL) : null;
  const crossesPatch = !!cPre && cPre.matches > 0;
  const agg = blendRows(cPost.rows, crossesPatch ? cPre!.rows : [], alpha);
  const pesadas = cPost.matches + (crossesPatch ? alpha * cPre!.matches : 0);
  const cBefore = await fetchLiveCounts(before.from, before.to, null, BRAWL);

  const file = heroesFileFrom(
    agg,
    { id: "street-brawl" },
    {
      matches: Math.round(pesadas),
      boards: Math.round(cPost.boards + (crossesPatch ? alpha * cPre!.boards : 0)),
      from: crossesPatch ? cPre!.from : cPost.from,
      to: cPost.to,
    },
    {
      // Sin bandas no hay brecha entre la de arriba y la de abajo.
      skillGap: new Map(),
      before: ratesFrom(cBefore.rows),
      matchesBefore: cBefore.matches,
      post: ratesFrom(cPost.rows),
      crossesPatch,
      patchShare: pesadas > 0 ? cPost.matches / pesadas : 1,
      postMatches: cPost.matches,
    },
    patch,
    new Date().toISOString()
  );

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(file));
  const conCambio = file.heroes.filter((h) => h.trend !== undefined).length;
  console.log(
    `street brawl: ${file.heroes.length} héroes (${conCambio} con cambio de parche), ` +
      `${file.matches.toLocaleString("es")} partidas${file.provisional ? " [PROVISIONAL]" : ""}` +
      `${file.crossesPatch ? ` [15 días, el parche pesa ${Math.round((file.patchShare ?? 0) * 100)}%]` : " [desde el parche]"}, ` +
      `${file.from} → ${file.to} (${((Date.now() - t) / 1000).toFixed(1)}s)`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
