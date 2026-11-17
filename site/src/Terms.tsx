import { CONTACT_EMAIL, GOVERNING_LAW, LegalPage, Section } from "./Legal";

/**
 * Rewritten 2026-11-17: shorter and in plain words. Covers what the site has
 * today — Steam sign-in, uploaded builds, live data — which the earlier text
 * predated (it even said the site never shows live games).
 */
export default function Terms() {
  return (
    <LegalPage title="Terms of Service" intro="The rules for using Vestigo.">
      <Section heading="About Vestigo">
        <p>
          Vestigo is a fan-made site with stats, guides and tools for video games, run by a small
          team. By using it you agree to these terms. If you don&apos;t, please don&apos;t use the
          site.
        </p>
      </Section>

      <Section heading="Not affiliated with game publishers">
        <p>
          Vestigo isn&apos;t affiliated with, endorsed by or sponsored by Valve or any other company
          whose games it covers. Game names, artwork and other game content belong to their
          owners. Some images come from community wikis under Creative Commons licences and are
          credited where they appear. Using Vestigo doesn&apos;t change your obligations under each
          game&apos;s own terms.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          Signing in with Steam is optional. You&apos;re responsible for what happens under your
          account, and we may suspend or remove accounts that break these terms.
        </p>
      </Section>

      <Section heading="What you share">
        <p>
          When you upload a build or appear in a ranking, that content is public. You keep the
          rights to what you upload and let us show it on Vestigo. Don&apos;t upload anything
          offensive, misleading or that isn&apos;t yours to share; we may remove content that
          breaks these rules.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>Please don&apos;t:</p>
        <ul>
          <li>use the site to harass or target other players;</li>
          <li>scrape it or put unusual automated load on it;</li>
          <li>try to access parts of the service that aren&apos;t public;</li>
          <li>cheat the Deadlockdle or any other ranking;</li>
          <li>resell our data or analysis as your own.</li>
        </ul>
      </Section>

      <Section heading="The data on the site">
        <p>
          Our numbers come from real matches and public game data, and we work to keep them
          right, but they can be incomplete or out of date. They describe what has happened, not
          what will. Some features depend on third-party services and may change or stop working
          for reasons outside our control.
        </p>
      </Section>

      <Section heading="No warranty and limits of liability">
        <p>
          Vestigo is provided &ldquo;as is&rdquo;, without warranties of any kind. To the extent
          the law allows, we aren&apos;t liable for indirect or consequential damages from using
          it. If you&apos;re a consumer, your statutory rights are not affected.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          We may update these terms as the site changes. The date at the top shows the latest
          version; using the site after a change means you accept it.
        </p>
      </Section>

      <Section heading="Governing law and contact">
        <p>
          These terms are governed by the laws of {GOVERNING_LAW}. If you live elsewhere as a
          consumer, you keep the protections of your local law. Questions:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
