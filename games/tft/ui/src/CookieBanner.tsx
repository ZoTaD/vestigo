import { useCopy } from "./i18n";
import type { Consent } from "./analytics";

/**
 * The consent notice.
 *
 * Accept and decline are the same size, the same weight, and side by side.
 * A greyed-out refusal next to a bright accept is the standard dark pattern
 * here, and it is also what makes the consent worthless: under the GDPR,
 * refusing has to be as easy as agreeing.
 *
 * It does not block the page. Someone who wants to read the tier list without
 * answering can, and until they answer nothing is loaded — the undecided state
 * behaves exactly like a refusal.
 */
export default function CookieBanner({
  onDecide,
  onPrivacy,
}: {
  onDecide: (consent: Consent) => void;
  onPrivacy: () => void;
}) {
  const copy = useCopy();

  return (
    <aside className="consent" role="dialog" aria-label={copy.consent.title}>
      <div className="consent-text">
        <p className="consent-title">{copy.consent.title}</p>
        <p className="consent-body">{copy.consent.body}</p>
      </div>

      <div className="consent-actions">
        <button className="consent-btn" onClick={() => onDecide("granted")}>
          {copy.consent.accept}
        </button>
        <button className="consent-btn" onClick={() => onDecide("denied")}>
          {copy.consent.decline}
        </button>
        <button className="consent-link" onClick={onPrivacy}>
          {copy.consent.more}
        </button>
      </div>
    </aside>
  );
}
