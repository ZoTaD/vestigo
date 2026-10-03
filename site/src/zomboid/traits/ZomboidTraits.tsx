/**
 * La pestaña Rasgos de Project Zomboid (2026-09-30): la lista de rasgos y profesiones (`/project-zomboid/traits`,
 * `/es/project-zomboid/rasgos`), la de profesiones (`/professions`, `/profesiones`) y la ficha de cada rasgo
 * (`/rasgos/cobarde`) y de cada profesión (`/profesiones/ladron`). Diseño: docs/design/2026-09-30-zomboid.md. Es el
 * mismo armado que Objetos y Recetas, con su estética; las profesiones no tienen solapa propia (la de "Rasgos" queda
 * marcada, ver `Zomboid.tsx`) pero sí este mismo chunk.
 *
 * **`/profesiones` es una página de verdad, no un canonical a `/rasgos`**: muestra las 25 profesiones con su propio texto
 * y enlaza a los rasgos. "project zomboid professions" se busca solo, y Google necesita una página que hable de eso (su
 * `<title>` ya estaba en `seo.professions`); además la miga de pan de cada ficha de profesión (Project Zomboid ›
 * Profesiones › Ladrón) apunta ahí, y "Todas las profesiones" de la ficha vuelve ahí. Un canonical a `/rasgos` dejaba
 * una dirección en el sitemap que dice que no es ella. La hoja de profesiones de `/rasgos` es la misma lista, más corta
 * de texto: no son dos copias de la misma página, cada una contesta otra búsqueda.
 *
 * Los datos viajan en el chunk (ver `data.ts`): no hay "cargando…".
 */
import professionSlugs from "virtual:pz-slugs-es/professions";
import recipeSlugs from "virtual:pz-slugs-es/recipes";
import traitSlugs from "virtual:pz-slugs-es/traits";
import { registerPzSlugs, type Route } from "../../route";
import { findProfession, findTrait } from "./data";
import ProfessionFicha from "./ProfessionFicha";
import TraitFicha from "./TraitFicha";
import TraitList from "./TraitList";
import { registerChangesLookup } from "../patches/boxLoader";
// Las hojas, las filas, el buscador y los renglones son los de Objetos: la misma libreta. Lo propio va aparte.
import "../../styles/zomboid-items.css";
import "../../styles/zomboid-traits.css";

// Las direcciones en español de lo que esta pestaña enlaza: sus rasgos, sus profesiones y las recetas que dan. Al
// cargarse el módulo y no en un efecto: `preloadRoute` baja este chunk antes de que `App` lea la dirección, así
// `/es/project-zomboid/rasgos/cobarde` ya llega traducida a `cowardly`.
registerPzSlugs({ ...recipeSlugs, ...traitSlugs, ...professionSlugs });
// Para que `preloadTab` sepa si la ficha de la ruta trae "Qué cambió" y lo baje antes del primer render.
registerChangesLookup("traits", findTrait);
registerChangesLookup("professions", findProfession);

type Nav = (r: Route) => void;

export default function ZomboidTraits({ route, navigate }: { route: Route; navigate: Nav }) {
  const slug = route.detail;
  if (route.pzSection === "professions") {
    const prof = findProfession(slug);
    if (prof) return <ProfessionFicha prof={prof} route={route} navigate={navigate} key={prof.id} />;
    return <TraitList view="professions" route={route} navigate={navigate} missing={!!slug} />;
  }
  const trait = findTrait(slug);
  if (trait) return <TraitFicha trait={trait} route={route} navigate={navigate} key={trait.id} />;
  return <TraitList view="traits" route={route} navigate={navigate} missing={!!slug} />;
}
