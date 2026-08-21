/**
 * How raw Riot ids become readable names.
 *
 * The analyzer stays catalog-free on purpose — it must run wherever there is no
 * CommunityDragon data to hand — so callers inject the naming instead. The UI
 * passes a resolver backed by catalog.json; tests and scripts get the fallback,
 * which merely drops the set prefix.
 */
export interface Labels {
  champion(id: string): string;
  trait(id: string): string;
  item(id: string): string;
}

const stripSet = (id: string) => id.replace(/^TFT\d+_/, "");

/** Turns "TFT_Item_SteraksGage" into "Steraks Gage" when nothing better exists. */
function readableItem(id: string): string {
  return stripSet(id)
    .replace(/^Item_/, "")
    .replace(/Radiant$/, " radiante")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

export const defaultLabels: Labels = {
  champion: (id) => stripSet(id).replace(/([a-z])([A-Z])/g, "$1 $2"),
  trait: (id) => stripSet(id).replace(/Trait$/, ""),
  item: readableItem,
};
