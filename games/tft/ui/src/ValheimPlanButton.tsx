/** El botón "Agregar al Planificador" de cada ficha que se fabrica (2026-09-25). */
import RouteLink from "./RouteLink";
import { useValheimCopy } from "./valheimCopy";
import { addToPlan, usePlan } from "./valheimPlannerStore";
import type { Nav, To } from "./ValheimParts";

export default function ValheimPlanButton({ id, to, navigate }: { id: string; to: To; navigate: Nav }) {
  const t = useValheimCopy();
  const n = usePlan().picks.find((p) => p.id === id)?.qty ?? 0;
  return (
    <div className="vp-addrow">
      <button type="button" className={`vp-add${n ? " is-in" : ""}`} onClick={() => addToPlan(id)}>
        {n ? t.plan.inPlanner(n) : t.plan.addBtn}
      </button>
      {n > 0 && <RouteLink className="vp-link" to={to("planner")} onNavigate={navigate}>{t.plan.see}</RouteLink>}
    </div>
  );
}
