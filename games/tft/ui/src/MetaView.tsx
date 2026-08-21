import { useState } from "react";
import { useBandMeta, type Comp, type CompItem, type Dataset } from "./data";
import { type CompFamily } from "./families";
import { buildCode, hasBuildCode } from "./buildCode";
import { compSlugs } from "./slugs";
import { BANDS, DEFAULT_BAND, type BandId } from "./bands";
import { setOptions, publishedSet } from "./sets";
import { LIVE } from "./data";
import { useCopy, useLocale } from "./i18n";

function pct(n: number, digits = 0) {
  return `${(n * 100).toFixed(digits)}%`;
}

/** Item icon with a hover card explaining what components build it. */
function ItemChip({ item, size = "sm" }: { item: CompItem; size?: "sm" | "lg" }) {
  const copy = useCopy();

  return (
    <span className="item-chip" data-size={size}>
      {item.img && <img className="item-chip-icon" src={item.img} alt={item.name} loading="lazy" />}
      <span className="item-pop" role="tooltip">
        <span className="pop-head">
          {item.img && <img src={item.img} alt="" />}
          <span>
            <b>{item.name}</b>
            <em>{copy.meta.detail.inGames(pct(item.share))}</em>
          </span>
        </span>

        {item.components.length > 0 ? (
          <span className="pop-recipe">
            <span className="pop-label">{copy.meta.detail.builtFrom}</span>
            <span className="pop-parts">
              {item.components.map((c, i) => (
                <span className="pop-part" key={`${c.id}-${i}`}>
                  {c.img && <img src={c.img} alt="" />}
                  {c.name}
                </span>
              ))}
            </span>
          </span>
        ) : (
          <span className="pop-recipe">
            <span className="pop-label">{copy.meta.detail.baseComponent}</span>
          </span>
        )}

        {item.desc && <span className="pop-desc">{item.desc}</span>}
      </span>
    </span>
  );
}

/**
 * The optional units that decide how the comp finishes.
 *
 * The pipeline has always measured how each comp places with a unit and
 * without it; nothing ever showed it. That difference is the closest thing in
 * the data to actual advice — "find this one and you finish a place higher" —
 * so it gets its own list rather than a column nobody reads.
 *
 * Only real swings make the cut. A unit that moves the finish by a tenth of a
 * place is inside the noise, and listing it would bury the ones that matter.
 */
const SWING_MIN = 0.25;
const SWING_SHOWN = 5;

function SwingList({ comp }: { comp: Comp }) {
  const copy = useCopy();
  const swings = comp.units
    .filter((u) => u.swing && Math.abs(u.swing.impact) >= SWING_MIN)
    .sort((a, b) => a.swing!.impact - b.swing!.impact)
    .slice(0, SWING_SHOWN);

  if (swings.length === 0) return null;

  return (
    <>
      <h4 className="detail-heading detail-heading-spaced">{copy.meta.swing.heading}</h4>
      <p className="detail-note">{copy.meta.swing.note}</p>
      <ul className="swing-list">
        {swings.map((u) => {
          const { impact, winnerRate, loserRate } = u.swing!;
          const better = impact < 0;
          const amount = Math.abs(impact).toFixed(2);
          return (
            <li key={u.id} data-better={better}>
              <span className="sw-unit">
                {u.img && <img src={u.img} alt="" loading="lazy" />}
                {u.name}
              </span>
              <span className="sw-impact">
                {better ? copy.meta.swing.better(amount) : copy.meta.swing.worse(amount)}
              </span>
              <span className="sw-split">
                <b>{pct(winnerRate)}</b> {copy.meta.swing.inWinners}
                {" · "}
                <b>{pct(loserRate)}</b> {copy.meta.swing.inLosers}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Copies the comp as a code the game's Team Planner reads, so a player can paste
 * it in and be shown which champions to buy. The code is built from the comp's
 * current champions at click time — nothing is stored, so it follows the tier
 * list as it changes.
 */
function CopyBuild({ comp }: { comp: Comp }) {
  const copy = useCopy();
  const [done, setDone] = useState(false);
  const ids = comp.units.map((u) => u.id);
  if (!hasBuildCode(ids)) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildCode(ids));
      setDone(true);
      window.setTimeout(() => setDone(false), 1800);
    } catch {
      // Clipboard is blocked outside a secure context; nothing useful to do.
    }
  };

  return (
    <button className="copy-build" onClick={onCopy} data-done={done} title={copy.meta.copyBuild.hint}>
      {done ? copy.meta.copyBuild.done : copy.meta.copyBuild.label}
    </button>
  );
}

function CompRow({
  comp,
  rank,
  open,
  onToggle,
  variantControl,
}: {
  comp: Comp;
  rank: number;
  /** Which comp is expanded now lives in the URL, so a build can be linked to. */
  open: boolean;
  onToggle: () => void;
  /** The variant switcher, when this comp leads a family of near-identical ones. */
  variantControl?: React.ReactNode;
}) {
  const copy = useCopy();
  const plan = copy.plan[comp.archetype];

  return (
    <li className="comp" data-open={open} style={{ "--i": rank } as React.CSSProperties}>
      <button className="comp-summary" onClick={onToggle} aria-expanded={open}>
        <span className="comp-rank">{String(rank).padStart(2, "0")}</span>

        <span className="comp-identity">
          <span className="comp-name">
            <span className="comp-trait">{comp.traitName}</span>{" "}
            <span className="comp-carry">{comp.carryNames.join(" ")}</span>
          </span>

          <span className="comp-badges">
            <span className="badge-plan" data-arch={comp.archetype}>
              {plan.badge}
            </span>
            <span className="badge-level">
              {copy.player.level} {comp.avgLevel.toFixed(1)}
            </span>
            {/* Each tag carries its reason in the tooltip: a label nobody can
                check is just decoration. */}
            {comp.tags.map((tag) => (
              <span className="badge-tag" data-tag={tag} key={tag} title={copy.meta.tags[tag].why}>
                {copy.meta.tags[tag].label}
              </span>
            ))}
          </span>

          <span className="synergies">
            {comp.traits.map((t) => (
              <span
                className="synergy"
                key={t.id}
                title={`${t.name} — ${copy.meta.detail.inGames(pct(t.frequency))}`}
              >
                {t.img && <img src={t.img} alt="" loading="lazy" />}
                <b>{t.units}</b>
                <span className="synergy-name">{t.name}</span>
              </span>
            ))}
          </span>
        </span>

        {/* The carry is marked in its own right, by data-carry. Stars only ever
            mean "take this one to 3★", which is a plan a 4- or 5-cost carry can
            never follow — nine copies of a five-cost is a trophy, not a route. */}
        <span className="roster">
          {comp.units.map((u) => (
            <span
              className="unit"
              data-cost={u.cost}
              data-target={u.isStarTarget}
              data-carry={u.isCarry}
              data-flex={u.flex}
              title={u.flex ? copy.meta.detail.flexWhy(pct(u.frequency)) : undefined}
              key={u.id}
            >
              <span className="unit-stars" data-has={u.stars > 0}>
                {u.stars > 0 ? "★★★" : ""}
              </span>
              {u.img ? (
                <img className="unit-portrait" src={u.img} alt={u.name} loading="lazy" />
              ) : (
                <span className="unit-portrait unit-fallback">{u.name.slice(0, 2)}</span>
              )}
              <span className="unit-name">{u.name}</span>
              <span className="unit-items">
                {u.holdsItems && u.items.map((it) => <ItemChip item={it} key={it.id} />)}
              </span>
            </span>
          ))}
        </span>

        <span className="stats">
          <span className="stat stat-primary">
            <span className="stat-value">{comp.avgPlacement.toFixed(2)}</span>
            <span className="stat-label">{copy.meta.stats.placement}</span>
          </span>
          <span className="stat">
            <span className="stat-value">{pct(comp.top4Rate)}</span>
            <span className="stat-label">{copy.meta.stats.top4}</span>
          </span>
          <span className="stat">
            <span className="stat-value">{pct(comp.winRate)}</span>
            <span className="stat-label">{copy.meta.stats.first}</span>
          </span>
          <span className="stat">
            <span className="stat-value">{pct(comp.playRate, 1)}</span>
            <span className="stat-label">{copy.meta.stats.play}</span>
          </span>
        </span>

        <span className="comp-chevron" aria-hidden="true" />
      </button>

      {variantControl}

      {open && (
        <div className="comp-detail">
          <div className="detail-col">
            <h4 className="detail-heading">{plan.label}</h4>
            <ol className="plan-steps">
              {plan.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="plan-evidence">
              {copy.meta.detail.evidence(comp.avgLevel.toFixed(1), comp.count)}
            </p>

            <h4 className="detail-heading detail-heading-spaced">
              {copy.meta.detail.itemsHeading}
            </h4>
            <p className="detail-note">{copy.meta.detail.itemsNote}</p>
            <ol className="item-priority">
              {comp.itemPriority.map((it, i) => (
                <li key={it.id}>
                  <span className="ip-rank">{i + 1}</span>
                  <ItemChip item={it} size="lg" />
                  <span className="ip-name">{it.name}</span>
                  <span className="ip-parts">
                    {it.components.map((c, ci) => (
                      <span className="ip-part" key={`${c.id}-${ci}`} title={c.name}>
                        {ci > 0 && <i className="ip-plus">+</i>}
                        {c.img && <img src={c.img} alt={c.name} loading="lazy" />}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="detail-col">
            <h4 className="detail-heading">{copy.meta.detail.unitsHeading}</h4>
            <ul className="detail-unit-list">
              {comp.units.map((u) => (
                <li key={u.id}>
                  <span className="du-cost" data-cost={u.cost}>
                    {u.cost}
                  </span>
                  <span className="du-name">
                    {u.name}
                    {u.isCarry && <em className="du-tag">{copy.meta.detail.carryTag}</em>}
                    {u.isStarTarget && (
                      <em className="du-tag du-tag-star">{copy.meta.detail.starTag}</em>
                    )}
                    {u.flex && (
                      <em className="du-tag du-tag-flex" title={copy.meta.detail.flexWhy(pct(u.frequency))}>
                        {copy.meta.detail.flexTag}
                      </em>
                    )}
                  </span>
                  <span className="du-freq">
                    {pct(u.itemizedRate)} {copy.meta.detail.withItems}
                  </span>
                  <span className="du-items">
                    {u.items.length === 0 ? (
                      <em className="du-noitems">{copy.meta.detail.noItems}</em>
                    ) : (
                      u.items.map((it) => (
                        <span className="du-item" key={it.id}>
                          <ItemChip item={it} />
                          {it.name}
                          <b>{pct(it.share)}</b>
                        </span>
                      ))
                    )}
                  </span>
                </li>
              ))}
            </ul>

            <SwingList comp={comp} />
          </div>
        </div>
      )}

      <div className="meter" aria-hidden="true">
        <span className="meter-fill" style={{ "--pct": comp.top4Rate } as React.CSSProperties} />
      </div>
    </li>
  );
}

/**
 * One row of the tier list: a comp and, when it leads a family of near-identical
 * ones, a switch into its variants.
 *
 * Which comp is shown is local state — except that a deep link to a variant's
 * own URL wins, so a shared link to a variant opens on it, expanded. Switching
 * variant while expanded follows the shown comp into the address bar, which is
 * how a variant becomes linkable at all.
 */
function FamilyRow({
  family,
  rank,
  band,
  openSlug,
  onOpen,
}: {
  family: CompFamily;
  rank: number;
  band: BandId;
  openSlug?: string;
  onOpen: (slug?: string) => void;
}) {
  const copy = useCopy();
  const slugs = compSlugs(band);
  const members = [family.lead, ...family.variants];
  const slugOf = (c: Comp) => slugs.toSlug.get(c.id);

  const [selectedId, setSelectedId] = useState(family.lead.id);
  // A deep link to a member's URL forces that member to be the shown one.
  const linked = members.find((c) => slugOf(c) === openSlug);
  const shown = linked ?? members.find((c) => c.id === selectedId) ?? family.lead;
  const shownSlug = slugOf(shown);
  const isVariant = shown.id !== family.lead.id;
  const open = !!shownSlug && shownSlug === openSlug;

  const select = (c: Comp) => {
    setSelectedId(c.id);
    // If the row is expanded, keep it expanded on the newly shown comp so the
    // address bar and the panel stay in step; otherwise it is pure local state.
    if (open) onOpen(slugOf(c));
  };

  // The bar is always present for the copy-build button; the variant switch is
  // added only when the family has siblings. Copy encodes the SHOWN comp, so
  // switching to a variant and copying gives that variant's code.
  const control = (
    <div className="variant-bar">
      <CopyBuild comp={shown} key={shown.id} />
      {family.variants.length > 0 &&
        (isVariant ? (
          <>
            <button className="variant-btn" onClick={() => select(family.lead)}>
              {copy.meta.variants.back}
            </button>
            {shown.tier !== family.lead.tier && (
              <span className="variant-tier" data-tier={shown.tier}>
                {copy.meta.variants.differentTier(shown.tier)}
              </span>
            )}
          </>
        ) : (
          <button className="variant-btn" onClick={() => select(family.variants[0])}>
            {copy.meta.variants.show(family.variants.length)}
          </button>
        ))}
    </div>
  );

  return (
    <CompRow
      comp={shown}
      rank={rank}
      open={open}
      onToggle={() => onOpen(open ? undefined : shownSlug)}
      variantControl={control}
    />
  );
}

/**
 * The provisional-patch notice, or null while the band's list is a normal,
 * fully-sampled one.
 *
 * Pulled out of the JSX as its own function — rather than left as an inline
 * `dataset.provisional && ...` — so the exact condition and copy the page
 * shows can be exercised directly by a test without mounting the component
 * (see ui/test/metaView.test.ts). Never names a patch by itself: the label
 * comes from the dataset, with the set label as the only fallback for an
 * older file that predates patchLabel.
 */
export function provisionalNotice(
  dataset: Pick<Dataset, "provisional" | "patchLabel" | "setLabel">,
  copy: ReturnType<typeof useCopy>
): string | null {
  return dataset.provisional ? copy.meta.bands.provisional(dataset.patchLabel || dataset.setLabel) : null;
}

/**
 * A comp's numbers only mean something next to the sample behind them, and the
 * lower bands are thin. When most of a band's comps are already flagged as thin,
 * the honest thing is to say it once at the top rather than make someone infer
 * it from a badge repeated forty times.
 */
function mostlyThin(comps: Comp[]): boolean {
  if (comps.length === 0) return false;
  return comps.filter((c) => c.tags.includes("thinData")).length > comps.length / 2;
}

export default function MetaView({
  band,
  onBand,
  open: openSlug,
  onOpen,
}: {
  band: BandId;
  onBand: (band: BandId) => void;
  open?: string;
  onOpen: (slug?: string) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();

  // Qué set se está mirando. Arranca siempre en el vigente: un set archivado es
  // algo que se elige, nunca lo primero que alguien ve.
  const [set, setSet] = useState<number>(LIVE);
  const meta = useBandMeta(band, set);

  // Platinum+ is the standard view and stands on its own; the narrower rank
  // cuts sit behind a filter, so the first thing anyone sees is the default and
  // filtering is a choice, not a wall of buttons.
  // The set sits above the rank cut because it is the coarser question: which
  // game the numbers describe, before which slice of its players. The next set
  // is rendered unavailable rather than hidden, so the weeks before a launch do
  // not read as an abandoned site; the sets that already closed stay selectable,
  // because their lists were measured, published and indexed, and throwing that
  // away on the day of a set change would be giving up months of pages.
  const viendo = set === LIVE ? publishedSet() : set;
  const setPicker = (
    <div className="set-picker">
      <span className="band-label">{copy.meta.sets.label}</span>
      <select
        className="band-select"
        data-active
        aria-label={copy.meta.sets.label}
        value={viendo}
        onChange={(e) => {
          const elegido = Number(e.target.value);
          setSet(elegido === publishedSet() ? LIVE : elegido);
        }}
      >
        {setOptions().map((s) => (
          <option key={s.number} value={s.number} disabled={!s.available}>
            {copy.meta.sets.name(s.number)}
            {s.available ? "" : ` — ${copy.meta.sets.soon}`}
            {s.archived ? ` — ${copy.meta.sets.archived}` : ""}
          </option>
        ))}
      </select>
      {/* La nota cambia con el set, y tiene que decir "final" y no "viejo": quien
          cree que la página está rota se va, y quien cree que está viva se lleva
          números que ya no describen el juego que está jugando. */}
      <p className="detail-note band-note">
        {set === LIVE ? copy.meta.sets.note : copy.meta.sets.archivedNote(set)}
      </p>
    </div>
  );

  const picker = (
    <div className="band-picker">
      {setPicker}
      <span className="band-label">{copy.meta.bands.label}</span>
      <div className="band-controls">
        <button
          className="band-primary"
          data-active={band === DEFAULT_BAND}
          aria-pressed={band === DEFAULT_BAND}
          onClick={() => onBand(DEFAULT_BAND)}
        >
          {copy.meta.bands.names[DEFAULT_BAND]}
        </button>
        <span className="band-divider" aria-hidden="true" />
        <select
          className="band-select"
          data-active={band !== DEFAULT_BAND}
          aria-label={copy.meta.bands.filter}
          value={band === DEFAULT_BAND ? "" : band}
          onChange={(e) => {
            if (e.target.value) onBand(e.target.value as BandId);
          }}
        >
          <option value="">{copy.meta.bands.filter}</option>
          {BANDS.filter((b) => b.id !== DEFAULT_BAND).map((b) => (
            <option key={b.id} value={b.id}>
              {copy.meta.bands.names[b.id]}
            </option>
          ))}
        </select>
      </div>
      <p className="detail-note band-note">{copy.meta.bands.note}</p>
    </div>
  );

  // Nothing of the previous band survives on screen while another loads. Showing
  // apex's comps under a Gold heading for half a second is the exact confusion
  // this feature exists to remove.
  if (!meta) {
    return (
      <>
        <header className="masthead">
          <h1 className="title">
            {copy.meta.title}
            <span className="title-break">{copy.meta.titleBreak}</span>
          </h1>
          <p className="standfirst">{copy.meta.standfirst}</p>
          {picker}
        </header>
        <main className="tiers">
          <p className="band-loading">{copy.meta.bands.loading}</p>
        </main>
      </>
    );
  }

  const { comps, tiers, dataset } = meta;

  // A band with too little of the current patch says so instead of showing the
  // previous patch's comps under this patch's heading.
  if (dataset.insufficient || comps.length === 0) {
    return (
      <>
        <header className="masthead">
          <h1 className="title">
            {copy.meta.title}
            <span className="title-break">{copy.meta.titleBreak}</span>
          </h1>
          <p className="standfirst">{copy.meta.standfirst}</p>
          {picker}
        </header>
        <main className="tiers">
          <p className="band-warning band-empty">
            {copy.meta.bands.empty(dataset.patchLabel || dataset.setLabel)}
          </p>
        </main>
      </>
    );
  }

  // The day, without the hour. The time used to be here so two rebuilds on the
  // same day could be told apart, which is a thing we need and a visitor does
  // not: to a reader it only advertises how often — or how rarely — this runs.
  // The exact moment is still in the data file for anyone working on it.
  const generated = new Date(dataset.generatedAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
  });
  const provisional = provisionalNotice(dataset, copy);

  return (
    <>
      <header className="masthead">
        <h1 className="title">
          {copy.meta.title}
          <span className="title-break">{copy.meta.titleBreak}</span>
        </h1>
        <p className="standfirst">{copy.meta.standfirst}</p>

        {picker}

        {provisional && <p className="band-warning">{provisional}</p>}
        {mostlyThin(comps) && <p className="band-warning">{copy.meta.bands.thin}</p>}

        <dl className="dataset">
          <div>
            <dt>{copy.meta.dataset.comps}</dt>
            <dd>{comps.length}</dd>
          </div>
          {/* El tamaño de la muestra no se publica. Decía cuántas partidas y
              cuántos tableros hay detrás, y contra competidores que miden en
              millones ese número informa más al que compite que al que juega.
              Sigue estando en los archivos de datos, que es donde hace falta:
              es la entrada del encogimiento y de la etiqueta de muestra fina. */}
          <div>
            <dt>{copy.meta.dataset.set}</dt>
            <dd>{dataset.setLabel}</dd>
          </div>
          {/* Which patch these numbers describe. Until now the page never said,
              and the answer was "seven of them averaged together". */}
          {dataset.patchLabel && (
            <div>
              <dt>{copy.meta.dataset.patch}</dt>
              <dd>{dataset.patchLabel}</dd>
            </div>
          )}
          <div>
            <dt>{copy.meta.dataset.updated}</dt>
            <dd>{generated}</dd>
          </div>
        </dl>
      </header>

      <main className="tiers">
        {tiers.map((group) => (
          <section className="tier-group" key={group.tier} data-tier={group.tier}>
            <div className="tier-head">
              <span className="tier-mark">{group.tier}</span>
              <span className="tier-label">{copy.meta.tiers[group.tier]}</span>
              <span className="tier-rule" aria-hidden="true" />
            </div>
            <ol className="comp-list">
              {group.families.map((family, i) => (
                <FamilyRow
                  key={family.lead.id}
                  family={family}
                  rank={i + 1}
                  band={band}
                  openSlug={openSlug}
                  onOpen={onOpen}
                />
              ))}
            </ol>
          </section>
        ))}
      </main>
    </>
  );
}
