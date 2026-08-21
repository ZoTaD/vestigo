import { describe, it, expect } from "vitest";
import { provisionalNotice } from "../src/MetaView";
import { COPY } from "../src/i18n";

/**
 * MetaView shows the provisional banner with exactly one line of JSX:
 *
 *   {provisionalNotice(dataset, copy) && (
 *     <p className="band-warning">{provisionalNotice(dataset, copy)}</p>
 *   )}
 *
 * There is no component-rendering harness in this package to mount that JSX
 * and assert on the DOM — no jsdom test environment and no
 * @testing-library/react anywhere in ui/test, unlike a typical React project.
 * Every other test in this folder (compTags.test.ts, coachWiring.test.ts, …)
 * exercises pure data/logic functions the same way. So this test covers the
 * closest unit that actually can be exercised without mounting the app: the
 * exact predicate and copy the JSX reads to decide whether the notice shows,
 * pulled out of the component as `provisionalNotice` for that reason.
 */
describe("provisionalNotice", () => {
  const dataset = (provisional: boolean, patchLabel = "16.14") => ({
    provisional,
    patchLabel,
    setLabel: "Set 17",
  });

  it("shows nothing when the band's dataset is not provisional", () => {
    expect(provisionalNotice(dataset(false), COPY.en)).toBeNull();
  });

  it("names the patch when the dataset comes back provisional: true, in both languages", () => {
    expect(provisionalNotice(dataset(true), COPY.en)).toContain("16.14");
    expect(provisionalNotice(dataset(true), COPY.es)).toContain("16.14");
  });

  // No patch number is ever hardcoded here or in i18n.ts — the label comes
  // from the dataset. When an old file has no patchLabel yet, the set label
  // is what's left to name in the notice.
  it("falls back to the set label when there is no patch label", () => {
    expect(provisionalNotice(dataset(true, ""), COPY.en)).toContain("Set 17");
  });
});
