import type { ReactNode } from "react";

/**
 * Shared frame for the privacy policy and the terms.
 *
 * These two documents are deliberately English-only. Publishing a translation of
 * a legal text means maintaining two versions that can drift apart and then
 * arguing about which one governs; one authoritative language avoids that. The
 * rest of the site stays bilingual — only these do not.
 */

/** One address, named once. Change it here and both documents follow. */
export const CONTACT_EMAIL = "zeitristech@gmail.com";

/** The jurisdiction the operator is based in. */
export const GOVERNING_LAW = "Argentina";

export const LAST_UPDATED = "23 July 2026";

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="legal" lang="en">
      <header className="masthead">
        <p className="eyebrow">Vestigo</p>
        <h1 className="title">{title}</h1>
        <p className="standfirst">{intro}</p>
        <p className="legal-updated">Last updated: {LAST_UPDATED}</p>
      </header>

      <article className="legal-doc">{children}</article>
    </main>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="legal-section">
      <h2 className="legal-heading">{heading}</h2>
      {children}
    </section>
  );
}
