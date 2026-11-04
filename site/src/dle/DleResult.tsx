import { useState } from "react";
import { useCopy } from "../deadlockCopy";
import { useLang } from "../i18n";
import type { Revealed, Row } from "./api";
import type { DleMode } from "./modes";
import { shareText } from "./share";

/** El final: la respuesta con su arte, el enlace a su ficha y Share. */
export default function DleResult({
  mode,
  number,
  rows,
  answer,
  solved,
  max,
  signedIn,
}: {
  mode: DleMode;
  number: number | null;
  rows: Row[];
  answer: Revealed;
  solved: boolean;
  max: number;
  signedIn: boolean;
}) {
  const c = useCopy().deadlock.dle;
  const { lang } = useLang();
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareText({ number: number ?? 0, mode, rows, max, solved }));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* sin portapapeles: no hay nada que mostrar */
    }
  };
  const here = typeof location === "undefined" ? `/${lang}/deadlock/dle` : location.pathname;

  return (
    <div className="dle-result box">
      <img src={answer.img} alt="" width={120} height={120} className={mode === "heroes" ? undefined : "is-icon"} />
      <div>
        <b>{answer.name}</b>
        <span>{solved ? c.solved(rows.length) : c.lost(answer.name)}</span>
        <a href={`/${lang}/${answer.link}`}>{c.see}</a>
      </div>
      <div className="dle-result-actions">
        <button type="button" onClick={share}>
          {copied ? c.copied : c.share}
        </button>
        {!signedIn && (
          <a className="dle-signin" href={`/api/auth/steam?return=${encodeURIComponent(here)}`} rel="nofollow">
            {c.signIn}
          </a>
        )}
      </div>
    </div>
  );
}
