/**
 * El Planificador de Valheim (2026-09-25): paso 1, elegir (`/valheim/planner`),
 * y paso 2, la hoja de ruta (`/valheim/planner/route`). Maqueta B que eligió
 * ZoTaD; diseño en docs/design/2026-09-25-valheim-planificador.md.
 */
import { useEffect, useState } from "react";
import { useValheimCopy } from "./valheimCopy";
import { loadPlanner, peekPlanner } from "./valheimData";
import type { PlannerData } from "./valheimPlanner";
import type { Nav, To } from "./ValheimParts";
import ValheimPlannerPick from "./ValheimPlannerPick";
import ValheimPlannerRoute from "./ValheimPlannerRoute";

export default function ValheimPlanner({ detail, to, navigate }: { detail?: string; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const [data, setData] = useState<PlannerData | null>(peekPlanner);
  useEffect(() => {
    let vivo = true;
    if (!data) loadPlanner().then((d) => vivo && setData(d)).catch(() => undefined);
    return () => { vivo = false; };
  }, []);
  if (!data) {
    return (
      <header className="vh-head">
        <h1>{detail === "route" ? t.plan.routeTitle : t.plan.title}</h1>
        <p>{t.plan.lede}</p>
      </header>
    );
  }
  return detail === "route"
    ? <ValheimPlannerRoute data={data} to={to} navigate={navigate} />
    : <ValheimPlannerPick data={data} to={to} navigate={navigate} />;
}
