/**
 * Calculadoras de Valheim (2026-10-30), maqueta A "Tablero de tarjetas": cuatro tarjetas arriba y la herramienta
 * elegida abajo, en el marco de madera de las fichas. Cada herramienta tiene su dirección
 * (`/valheim/calculators/combat`); sin herramienta, Comidas.
 */
import RouteLink from "../RouteLink";
import { CALC_TOOLS, type CalcTool } from "../route";
import { iconUrl } from "../valheimData";
import type { Nav, To } from "../ValheimParts";
import { useCalcCopy } from "./copy";
import FoodCalc from "./FoodCalc";
import CombatCalc from "./CombatCalc";
import ComfortCalc from "./ComfortCalc";
import SkillsCalc from "./SkillsCalc";
import "../styles/valheim-calc.css";

const ICON: Record<CalcTool, string> = { food: "serpentstew", combat: "swordiron", comfort: "bed", skills: "skill_run" };

export const toolOf = (detail: string | undefined): CalcTool => ((CALC_TOOLS as readonly string[]).includes(detail ?? "") ? (detail as CalcTool) : "food");

export default function Calculators({ detail, to, navigate }: { detail?: string; to: To; navigate: Nav }) {
  const t = useCalcCopy();
  const tool = toolOf(detail);
  const Tool = { food: FoodCalc, combat: CombatCalc, comfort: ComfortCalc, skills: SkillsCalc }[tool];
  return (
    <div className="vc">
      <header className="vh-head">
        <h1>{t.title}</h1>
        <p>{t.lede}</p>
      </header>
      <nav className="vc-cards" aria-label={t.title}>
        {CALC_TOOLS.map((k) => (
          <RouteLink key={k} className="vh-box vc-card" to={to("calculators", k === "food" ? undefined : k)} active={k === tool} onNavigate={navigate}>
            <span className="vh-slot"><img src={iconUrl(ICON[k])} alt="" width={42} height={42} decoding="async" /></span>
            <span><b>{t.tools[k].name}</b><small>{t.tools[k].line}</small></span>
          </RouteLink>
        ))}
      </nav>
      <section className="vh-frame vc-frame">
        <div className="vh-inset vc-inset">
          <Tool to={to} navigate={navigate} />
        </div>
      </section>
    </div>
  );
}
