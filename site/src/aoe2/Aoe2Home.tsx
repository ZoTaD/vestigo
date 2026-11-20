/**
 * La portada de la sección Age of Empires II (2026-11-20). En la etapa 1 arranca con la presentación y las civs; la
 * Task 11 del plan le suma el top del ranking, la civ más fuerte, "Subieron hoy" y los seguidos.
 */
import type { Route } from "../route";
import { useAoe2Copy } from "../aoe2Copy";
import { useLang } from "../i18n";
import { CivShield, Panel, type Civ, type Nav } from "./ui";
import civs from "@aoe2/civs.json";

export default function Aoe2Home(_: { route: Route; navigate: Nav }) {
  const t = useAoe2Copy();
  const { lang } = useLang();
  const lista = (civs as Civ[]).filter((c) => c.era === "base");
  return (
    <>
      <Panel h={t.home.h1}>
        <p className="a2-lead">{t.home.lead}</p>
      </Panel>
      <Panel h={t.tabs.civilizations} sub={`${lista.length}`}>
        <ul className="a2-civgrid">
          {lista.map((c) => (
            <li key={c.id}>
              <CivShield civ={c} size={44} />
              <span>{c.name[lang]}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
