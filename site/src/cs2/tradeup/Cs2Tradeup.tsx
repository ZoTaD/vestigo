/**
 * La pestaña Trade-up de CS2 (2026-11-03, etapa 2): "Armar contrato" y "Busco esta skin". Plan:
 * docs/superpowers/plans/2026-11-03-cs2-etapa-2.md. Baja todas las skins, sus precios y `tradeup.json`.
 *
 * El contrato vive en la dirección (`query.ts`). Sin contrato en la dirección se carga un ejemplo (diez Restringidos de
 * la colección Kilowatt), así la página nunca abre vacía y el prerender tiene números.
 */
import { useEffect, useMemo, useState } from "react";
import type { Route } from "../../route";
import { useLoad } from "../../useLoad";
import { useCs2Copy, type Cs2Rarity } from "../../cs2Copy";
import { loadList, loadPriceDate, loadSkinPrices, loadTradeup, peekList, peekPriceDate, peekSkinPrices, peekTradeup, type SkinRow } from "../data";
import { Cs2Loading, type Nav } from "../ui";
import Builder, { startFloat } from "./Builder";
import { needed, type TradeupCtx } from "./engine";
import Finder from "./Finder";
import { DEFAULT_FEE, readContract, writeContract, type ContractState } from "./query";

const EXAMPLE_COL = "the-kilowatt-collection";

/** El ejemplo: las Restringidas de la Kilowatt, dos de cada una, en el principio de Algo desgastado. */
export function example(skins: Map<string, SkinRow>, tiers: string[]): ContractState {
  const inputs = Array.from({ length: 10 }, (_, i) => tiers[i % tiers.length])
    .filter((slug) => skins.has(slug))
    .map((slug) => ({ slug, float: startFloat(skins.get(slug)!) }));
  return { kind: "n", fee: DEFAULT_FEE, inputs };
}

export default function Cs2Tradeup({ route, navigate }: { route: Route; navigate: Nav }) {
  const t = useCs2Copy();
  const u = t.tu;
  const list = useLoad("skins", () => peekList("skins") ?? undefined, () => loadList("skins"));
  const prices = useLoad("prices", () => peekSkinPrices() ?? undefined, () => Promise.all([loadSkinPrices(), loadPriceDate()]));
  const tradeup = useLoad("tradeup", () => peekTradeup() ?? undefined, () => loadTradeup());
  const skins = useMemo(() => new Map((list.value ?? []).map((s) => [s.slug, s])), [list.value]);
  const ctx = useMemo<TradeupCtx | null>(
    () => (list.value && prices.value && tradeup.value ? { skins, prices: prices.value, tradeup: tradeup.value, fee: DEFAULT_FEE } : null),
    [skins, list.value, prices.value, tradeup.value],
  );

  const [mode, setMode] = useState<"build" | "find">("build");
  const [state, setState] = useState<ContractState | null>(null);
  const [rarity, setRarity] = useState<Cs2Rarity>("restricted");
  const [target, setTarget] = useState("awp-chrome-cannon");
  const [wear, setWear] = useState(0);
  // El contrato de la dirección (o el ejemplo), apenas están los datos. En el prerender va el ejemplo.
  const ready = !!ctx;
  useEffect(() => {
    if (!ctx || state) return;
    const fromUrl = typeof window !== "undefined" ? readContract(window.location.search, (s) => ctx.skins.has(s)) : null;
    const next = fromUrl?.inputs.length ? fromUrl : example(ctx.skins, ctx.tradeup[EXAMPLE_COL]?.tiers.restricted ?? []);
    setState(next);
    const first = next.inputs[0] && ctx.skins.get(next.inputs[0].slug);
    if (first) setRarity(first.rarity);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (s: ContractState) => {
    setState(s);
    if (typeof window !== "undefined") window.history.replaceState(window.history.state, "", `${window.location.pathname}${writeContract(s)}`);
  };

  const failed = [list, prices, tradeup].find((l) => l.failed);
  if (failed) return <Cs2Loading onRetry={failed.retry} />;
  if (!ctx) return <Cs2Loading />;
  // Antes del efecto (y en el prerender) se dibuja el ejemplo.
  const shown = state ?? example(ctx.skins, ctx.tradeup[EXAMPLE_COL]?.tiers.restricted ?? []);
  const date = peekPriceDate();

  return (
    <main className="c2-main c2-tu">
      <header className="c2-head">
        <h1 className="c2-h1">{t.tabs["trade-up"]}</h1>
        <p className="c2-lede">{t.seo["trade-up"].description}</p>
      </header>
      <div className="c2-seg c2-tu-mode" role="tablist">
        {(["build", "find"] as const).map((m) => (
          <button type="button" role="tab" key={m} aria-selected={mode === m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)}>
            {m === "build" ? u.build : u.find}
          </button>
        ))}
      </div>
      {mode === "build" ? (
        <Builder
          ctx={ctx}
          rows={list.value!}
          state={shown}
          rarity={rarity}
          onChange={change}
          onRarity={(r) => {
            setRarity(r);
            // Otra rareza vacía el contrato: no se pueden mezclar.
            if (shown.inputs.length && ctx.skins.get(shown.inputs[0].slug)?.rarity !== r) change({ ...shown, inputs: [] });
          }}
          route={route}
          navigate={navigate}
        />
      ) : (
        <Finder
          ctx={ctx}
          rows={list.value!}
          target={target}
          wear={wear}
          onTarget={setTarget}
          onWear={setWear}
          onUse={(slug, float) => {
            const s = ctx.skins.get(slug)!;
            setRarity(s.rarity);
            change({ ...shown, kind: "n", inputs: Array.from({ length: needed(s.rarity) }, () => ({ slug, float })) });
            setMode("build");
          }}
        />
      )}
      <p className="c2-note">
        {u.rules}
        {date ? ` ${t.t.pricesNote(date)}` : ""}
      </p>
    </main>
  );
}
