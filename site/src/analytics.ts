/**
 * Google Analytics, and the consent it waits for.
 *
 * Nothing here runs until the visitor says yes. The GA script is not merely
 * configured to hold back — it is never added to the page at all, so a visitor
 * who declines (or has not answered yet) makes no request to Google and gets no
 * cookie. That is the only version of this we can honestly describe in the
 * privacy policy, and the policy is written to match.
 *
 * The measurement id comes from the environment, so a local dev server or a
 * preview build with no id configured is silently analytics-free.
 */

const CONSENT_KEY = "vestigo.consent";
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

/** Undecided is its own state: it is not consent, and it is not refusal. */
export type Consent = "granted" | "denied";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function storedConsent(): Consent | null {
  if (typeof localStorage === "undefined") return null;
  const saved = localStorage.getItem(CONSENT_KEY);
  return saved === "granted" || saved === "denied" ? saved : null;
}

export function rememberConsent(consent: Consent): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(CONSENT_KEY, consent);
}

/** Configured at all? Without an id there is nothing to load and nothing to ask about. */
export const analyticsAvailable = (): boolean => Boolean(MEASUREMENT_ID);

let loaded = false;

/**
 * Add GA to the page. Idempotent: React may call this more than once, and a
 * second <script> would double every pageview.
 */
export function loadAnalytics(): void {
  if (loaded || !MEASUREMENT_ID || typeof document === "undefined") return;
  loaded = true;

  const tag = document.createElement("script");
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(tag);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js reads `arguments` off the queue verbatim, so this cannot be an
    // arrow function or a rest parameter — the shape has to survive as-is.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };

  window.gtag("js", new Date());
  // The site sends its own pageviews: it is a single page app, so the automatic
  // one would only ever record the landing view and nothing after it.
  window.gtag("config", MEASUREMENT_ID, { send_page_view: false });
}

/**
 * Record a view. `path` is synthetic — the app navigates by state, not by URL —
 * but it has to look like a path for GA's reports to group it.
 */
export function trackPage(path: string, title: string): void {
  if (!loaded || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_title: title,
    page_location: `${window.location.origin}${path}`,
  });
}

/**
 * Undo consent within the session.
 *
 * Once gtag.js is on the page it cannot be unloaded, so withdrawal has to be
 * enforced two ways: tell GA to stop (the `ga-disable-` flag it checks before
 * every send) and clear the cookies it already set. A reload then starts clean,
 * because the stored decision is now "denied" and the script never loads.
 */
export function revokeAnalytics(): void {
  if (!MEASUREMENT_ID || typeof document === "undefined") return;
  (window as unknown as Record<string, boolean>)[`ga-disable-${MEASUREMENT_ID}`] = true;

  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name || !(name.startsWith("_ga") || name.startsWith("_gid"))) continue;
    // Clear it on this host and on the registrable domain: GA sets it on the
    // latter, so expiring only the former leaves the cookie in place.
    const host = window.location.hostname;
    const parts = host.split(".");
    const registrable = parts.length > 2 ? `.${parts.slice(-2).join(".")}` : `.${host}`;
    for (const domain of [undefined, registrable]) {
      document.cookie =
        `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/` +
        (domain ? `; domain=${domain}` : "");
    }
  }
}
