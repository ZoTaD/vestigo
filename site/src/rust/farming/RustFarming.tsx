/**
 * La pestaña Granjas de Rust (2026-10-09): la portada de la granja (`/rust/farming`), la ficha de cada planta
 * (`/rust/farming/hemp`, `/es/rust/granjas/canamo`) y la calculadora de genética (`/rust/farming/genetics`,
 * `/es/rust/granjas/genetica`). Plan: docs/superpowers/plans/2026-10-09-rust-granjas.md.
 *
 * Los datos bajan aparte (`data.ts`). Si la planta no existe, se muestra la portada de la granja con una nota.
 */
import slugsEs from "@rust/site/farming-slugs-es.json";
import itemSlugsEs from "@rust/site/slugs-es.json";
import { registerRustSlugs, type Route } from "../../route";
import { useLoad } from "../../useLoad";
import RsLoading from "../RsLoading";
import { loadFarming, peekFarming } from "./data";
import FarmingHome from "./FarmingHome";
import GeneticsCalc from "./GeneticsCalc";
import PlantFicha from "./PlantFicha";
import "../../styles/rust-items.css";
import "../../styles/rust-farming.css";

// Al cargarse el módulo, como Objetos: `/es/rust/granjas/canamo` ya llega como `hemp`.
// También los de Objetos (como Raideo): la granja enlaza fichas de objetos, y en español van con su slug.
registerRustSlugs(slugsEs);
registerRustSlugs(itemSlugsEs);

type Nav = (r: Route) => void;

export default function RustFarming({ route, navigate }: { route: Route; navigate: Nav }) {
  const data = useLoad("farming", () => peekFarming() ?? undefined, loadFarming);
  if (data.failed) return <RsLoading onRetry={data.retry} />;
  if (!data.value) return <RsLoading />;
  const f = data.value;
  if (route.detail === "genetics") return <GeneticsCalc farming={f} route={route} navigate={navigate} />;
  const plant = route.detail ? f.plants.find((p) => p.id === route.detail) : undefined;
  if (plant) return <PlantFicha farming={f} plant={plant} route={route} navigate={navigate} key={plant.id} />;
  return <FarmingHome farming={f} route={route} navigate={navigate} missing={!!route.detail} />;
}
