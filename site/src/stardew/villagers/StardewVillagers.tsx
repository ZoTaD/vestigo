/**
 * La pestaña Aldeanos de Stardew Valley (2026-10-22): la ficha si la dirección trae un slug, y si no (o si no existe), la
 * lista de retratos. Los aldeanos son un solo archivo chico; la ficha pide además la lista de objetos del idioma, de
 * donde salen los nombres y sprites de sus gustos.
 */
import { useLang } from "../../i18n";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { findVillager, loadList, loadVillagers, peekList, peekVillagers } from "../data";
import { SdLoading, type Nav } from "../ui";
import VillagerList from "./VillagerList";
import VillagerPage from "./VillagerPage";
import "../../styles/stardew-items.css";
import "../../styles/stardew-villagers.css";

export default function StardewVillagers({ route, navigate }: { route: Route; navigate: Nav }) {
  const { lang } = useLang();
  const slug = route.detail ?? null;
  const people = useLoad("villagers", () => peekVillagers() ?? undefined, loadVillagers);
  const villager = people.value && slug ? findVillager(people.value, slug) : undefined;
  const rows = useLoad(villager ? `list-${lang}` : null, () => peekList(lang) ?? undefined, () => loadList(lang));

  if (people.failed || rows.failed) return <SdLoading onRetry={people.failed ? people.retry : rows.retry} />;
  if (!people.value) return <SdLoading />;
  if (villager) {
    if (!rows.value) return <SdLoading />;
    return <VillagerPage villager={villager} rows={rows.value} route={route} navigate={navigate} key={villager.key} />;
  }
  return <VillagerList villagers={people.value} route={route} navigate={navigate} missing={slug !== null} />;
}
