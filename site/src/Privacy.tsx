import { CONTACT_EMAIL, LegalPage, Section } from "./Legal";

/**
 * Rewritten 2026-11-17: shorter, in plain words, and true to what the site does
 * today. The earlier version still said "no accounts and no database" after
 * Steam sign-in, the Deadlockdle ranking and uploaded builds shipped.
 *
 * What the code actually does, so this stays checkable:
 *
 * - The site itself is static files. The player search on the Deadlock pages
 *   goes from the visitor's browser straight to api.deadlock-api.com; we never
 *   see it. Images load from Steam (avatars), Grinding Gear Games (PoE2 icons)
 *   and deadlock-api's bucket (ability clips, News fonts).
 * - Our API (`api/`, a Worker with a database) stores, for people who sign in
 *   with Steam: the Steam ID, public name and avatar (`users`), a hash of the
 *   session token that lasts 30 days and is deleted when it expires or on sign
 *   out (`sessions`), Deadlockdle plays and guesses with their times
 *   (`dle_plays`, `dle_guesses`), and the builds a player uploads (`builds`:
 *   account, name, tags, note — public, deletable by their owner).
 * - Google Analytics loads only after consent (`analytics.ts`).
 * - Valheim and Stardew save files are read in the browser and never uploaded.
 * - localStorage keys are checked by `test/privacyStorage.test.ts`.
 *
 * If any of this changes, this page changes in the same commit.
 */
export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" intro="What we collect, why, and what you can do about it.">
      <Section heading="Who we are">
        <p>
          Vestigo is made by a small team of players who build stats, guides and tools for the
          games we play. We are not affiliated with any game publisher. If you have a question
          about this policy, write to us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>

      <Section heading="The short version">
        <ul>
          <li>You can use the whole site without an account.</li>
          <li>
            If you sign in with Steam, we keep your public Steam ID, name and avatar, and what you
            do on the features that need an account.
          </li>
          <li>Analytics only runs if you say yes.</li>
          <li>We don&apos;t sell your data, and there are no ads on Vestigo today.</li>
        </ul>
      </Section>

      <Section heading="What we collect">
        <h3 className="legal-subheading">When you browse</h3>
        <p>
          Like any website, our hosting providers receive basic request data (IP address, time,
          browser) to deliver pages and stop abuse. We don't use it to build profiles.
        </p>
        <p>
          Player searches on the Deadlock pages go from your browser straight to deadlock-api.com,
          an independent community service that publishes public match data. We never see what
          you search for.
        </p>
        <p>
          Save files you open on the Valheim map or the Stardew Valley save reader are read in
          your browser and never uploaded.
        </p>

        <h3 className="legal-subheading">If you sign in with Steam</h3>
        <p>
          Signing in is optional. Steam confirms who you are on its own site and sends us your
          public Steam ID; we never see your password or email. We then keep:
        </p>
        <ul>
          <li>your Steam ID, public name and profile picture;</li>
          <li>a session that keeps you signed in for 30 days (we store a hash of it, not the session itself);</li>
          <li>
            your Deadlockdle games and guesses, with their times, for the daily ranking (your
            name and picture appear there);
          </li>
          <li>the builds you upload, with their name, tags and note. These are public.</li>
        </ul>

        <h3 className="legal-subheading">Analytics, if you accept</h3>
        <p>
          With your consent we use Google Analytics to see which pages get used. Google sets its
          own cookies (<code>_ga</code> and similar). If you decline or don't answer, the script
          never loads and no cookie is set. You can change your answer any time from the link in
          the footer.
        </p>

        <h3 className="legal-subheading">Stored on your device</h3>
        <p>
          Some features remember things in your browser&apos;s local storage: your language, your
          analytics answer, the last Deadlock profile you opened, how you like the items page, your
          Valheim Planner list, the Stardew Valley Community Center bundles you tick and, if you
          use the save reader, what the page shows of it (never the file itself), your Deadlockdle
          games when you play without signing in, and progress in the other game tools. None of
          them is sent to us, and clearing your browser data removes them.
        </p>
      </Section>

      <Section heading="How we use it">
        <p>
          To run the features you use, keep you signed in, show the Deadlockdle ranking and the
          builds people share, and, with analytics, to know what to improve. That&apos;s all.
        </p>
      </Section>

      <Section heading="Who else is involved">
        <ul>
          <li>Our hosting and infrastructure providers, which serve the site and run our database.</li>
          <li>Steam, for signing in and for profile pictures.</li>
          <li>deadlock-api.com, for public Deadlock match data.</li>
          <li>Google, only if you accept analytics.</li>
        </ul>
        <p>
          Each handles its part under its own policy. Some of these servers are outside your
          country, including in the United States.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          Sessions expire after 30 days, or when you sign out. Your account, Deadlockdle history
          and builds stay until you delete them or ask us to. You can delete your builds yourself;
          for everything else, email us. Analytics data follows Google&apos;s retention settings.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          You can ask us for a copy of your data, or to correct or delete it, by emailing{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Depending on where you live
          (for example under the GDPR or California&apos;s privacy laws), you may have further
          rights, including complaining to your local data protection authority. We don&apos;t
          sell personal information.
        </p>
        <p>
          Vestigo is made for a general gaming audience and isn&apos;t meant for children under 13.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          When we change how we handle data, we update this page and the date at the top.
        </p>
      </Section>
    </LegalPage>
  );
}
