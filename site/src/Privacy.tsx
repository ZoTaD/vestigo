import { CONTACT_EMAIL, LegalPage, Section } from "./Legal";

/**
 * Every claim here was checked against the code before it was written
 * (rewritten 2026-09-25, when TFT left the repo and with it the Riot API, the
 * Supabase database and the Cloudflare Worker this policy used to describe).
 *
 * The site is static: Netlify serves files and nothing else. There is no
 * server of ours that receives a search, and no database. What reaches a third
 * party does so from the visitor's own browser:
 *
 * - the Deadlock player pages call api.deadlock-api.com directly
 *   (`deadlockMatch.ts` and friends), including the Steam name typed into the
 *   search (`players/steam-search`);
 * - country flags load from flagcdn.com and Steam avatars from the URLs those
 *   API responses carry;
 * - Google Analytics loads only after acceptance (`analytics.ts`).
 *
 * Valheim save files are read in the browser (`SaveLoader.tsx`, a Worker) and
 * never uploaded.
 *
 * The browser keeps six keys of its own in localStorage — vestigo.lang,
 * vestigo.consent, vestigo.lastProfile, vestigo.dlItemsView and the Valheim
 * Planner's two — and two in sessionStorage. `test/privacyStorage.test.ts`
 * counts the localStorage ones: add a key without saying so here and it fails.
 * If any of the above changes, this document changes in the same commit.
 */
export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What Vestigo collects, why, and what it never touches."
    >
      <Section heading="In short">
        <p>
          Vestigo has no user accounts and never asks for a password or a payment method. It
          has no database and no server of its own that receives what you type: the site is a
          set of files, and the statistics on it are built in advance from public game data.
        </p>
        <p>
          When you look up a Deadlock player, your browser asks deadlock-api.com, an
          independent public service, for that account's public match data. We do not receive
          the search or its results.
        </p>
        <p>
          We use Google Analytics to count visits, and only if you accept it. Until you do, no
          analytics script is loaded and no cookie is set — declining and not answering amount
          to the same thing. You can change that decision whenever you like from the link in
          the footer.
        </p>
      </Section>

      <Section heading="Who we are">
        <p>
          Vestigo is an independent statistics, reference and post-match analysis site for
          video games. It is operated by an individual developer and is not affiliated with,
          endorsed by, or connected to the companies that make the games it covers. For
          anything in this policy, write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>

      <Section heading="What we collect">
        <h3 className="legal-subheading">Searches and files you use on the site</h3>
        <p>
          On the Deadlock player pages you can type a Steam name or open an account. Your
          browser sends that name, or the account's public identifier, straight to
          deadlock-api.com to find the account and load its public profile, rank and match
          history. We never see it.
        </p>
        <p>
          On the Valheim map you can open your own world and character files to see your
          explored map. They are read inside your browser and are never uploaded anywhere.
        </p>

        <h3 className="legal-subheading">Information stored in your browser</h3>
        <p>
          Six items of local storage: your language choice, so the site opens in the language
          you picked; your answer to the analytics question, so we stop asking; the last
          Deadlock profile you opened (its public account number and name), so the home page
          can offer it again; whether you prefer the Deadlock items page as a shop or as a
          list; and the list you build in the Valheim Planner, with the items you marked as
          already owned. None of them is sent to us, and clearing your browser data removes all
          six.
        </p>
        <p>
          The site also keeps two short-lived values in session storage, which your browser
          deletes when you close the tab: a search typed in the top bar, carried to the page
          that answers it, and a note that stops the page from reloading itself twice in a row
          after we publish an update.
        </p>
        <p>
          Cookies are set only if you accept analytics. In that case Google Analytics sets its
          own cookies (named <code>_ga</code> and similar) to recognise a returning browser and
          to keep a visit together as one session. If you decline, or have not answered, no
          cookie is set at all.
        </p>

        <h3 className="legal-subheading">Analytics, if you accept it</h3>
        <p>
          When you accept, we load Google Analytics 4. It reports which pages are opened, in
          what order, for how long, roughly where in the world the visit came from, and what
          kind of device and browser it used. Your IP address reaches Google as part of that
          request; Google states that it truncates IP addresses in the EU before storing them,
          and we do not receive yours. We never send Google the names or accounts you search
          for.
        </p>
        <p>
          We use it for one thing: to see which parts of the site people actually use, so we
          know what to build next. It does not personalise anything you see, and we do not run
          advertising on Vestigo today. If that ever changes, this page changes first.
        </p>

        <h3 className="legal-subheading">Technical information</h3>
        <p>
          Our hosting provider processes standard request metadata — IP address, timestamp,
          and user agent — as any web server does, for delivery and abuse prevention. We do not
          build profiles from it.
        </p>

        <h3 className="legal-subheading">What we do not collect</h3>
        <p>
          No accounts, passwords, or authentication tokens. No payment or financial data. No
          email address, name or date of birth. We do not buy data about you, and we run no
          advertising or cross-site tracking identifiers of our own.
        </p>
      </Section>

      <Section heading="Why we use it">
        <ul>
          <li>
            To show the statistics, tier lists, encyclopedias and maps on the site, which are
            built from public game data and contain no information about you.
          </li>
          <li>
            To remember the few preferences listed above, on your own device, so the site
            behaves the way you left it.
          </li>
          <li>
            If you accepted analytics: to count visits and see which pages get used, so we know
            what to work on.
          </li>
        </ul>
        <p>
          We do not use any of this to advertise to you, and we do not sell or rent it to
          anyone.
        </p>
      </Section>

      <Section heading="Legal bases">
        <p>
          Where the GDPR or the UK GDPR applies, the request metadata our hosting provider
          handles rests on our legitimate interest (Article 6(1)(f)) in delivering the site
          and keeping it safe. The preferences stored in your browser are there because the
          feature you used needs them, and they never leave your device.
        </p>
        <p>
          For analytics and the cookies it sets, the basis is your consent
          (Article 6(1)(a)), asked for before anything loads. You can withdraw it at any time
          from the footer, as easily as you gave it; withdrawing stops further collection and
          clears the cookies, though it cannot undo what was already counted.
        </p>
      </Section>

      <Section heading="What we store, and for how long">
        <p>
          Nothing about you on our side: Vestigo has no database, and no search or file you
          use on the site reaches us. What your browser stores stays there until you clear it.
        </p>
        <p>
          Analytics data, where you consented to it, is held by Google under the retention
          period set on our property and is deleted by Google when that period elapses. We keep
          no copy of it ourselves: we read the reports in Google's interface and nothing is
          exported.
        </p>
      </Section>

      <Section heading="Who else is involved">
        <ul>
          <li>
            <strong>deadlock-api.com</strong> — an independent community service that publishes
            public Deadlock match data. Your browser contacts it directly on the Deadlock pages
            that show live figures, and on the player pages it receives the name or account you
            look up. Its handling of that request is governed by its own policies.
          </li>
          <li>
            <strong>flagcdn.com and Steam's image servers</strong> — your browser loads country
            flags and profile pictures from them on the Deadlock player and ladder pages. As
            with any image, the request carries your IP address; nothing about your search is
            sent there.
          </li>
          <li>
            <strong>Our hosting provider</strong> — an infrastructure company that serves the
            site's files on our behalf. We name providers by category here rather than
            individually; if you need to know which company it is, ask us and we will tell you.
          </li>
          <li>
            <strong>Google (Google Analytics)</strong> — only if you accepted analytics. Your
            browser then loads Google's script and reports the pages you open, as described
            above. If you declined, or have not answered, your browser never contacts Google
            and this entry does not apply to you. Google's handling of that data is governed by
            its own privacy policy.
          </li>
        </ul>
        <p>
          We do not sell your data, and we do not share it with advertisers or data brokers.
          Apart from the parties named above, no one receives it.
        </p>
      </Section>

      <Section heading="Where data is processed">
        <p>
          Our hosting provider serves the site from data centres in several countries, and the
          third parties above run their own servers, so a request may be processed outside the
          country you are in — including outside the European Economic Area. If you accepted
          analytics, Google processes that data in the United States under its own transfer
          safeguards; declining keeps your visit out of it entirely.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Vestigo holds no passwords, payment data or database of visitors, which leaves very
          little that a breach could expose. All traffic is served over HTTPS. No system is
          perfectly secure, and we cannot guarantee absolute security.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          Depending on where you live, you may have the right to access the personal data we
          hold about you, to receive a copy of it, to have it corrected or deleted, to object to
          or restrict our processing of it, and to complain to your local data protection
          authority.
        </p>
        <p>
          If you are a California resident, the CCPA as amended gives you the right to know what
          personal information we collect, use, and disclose, the right to delete it, the right
          to correct it, and the right not to be discriminated against for exercising those
          rights. We do not sell personal information, and we do not share it for cross-context
          behavioural advertising as that term is defined by the CCPA; we have not done either
          in the preceding twelve months. Analytics runs only with your consent and is not used
          to advertise to you — and in any case, declining it in the footer stops the collection
          entirely.
        </p>
        <p>
          To exercise any of these, write to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Because we keep no accounts
          and no database, the data stored in your browser is in your hands: clearing it
          removes it. For the public match data deadlock-api.com publishes about a Deadlock
          account, contact that service directly. We will respond within the period the
          applicable law requires.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          Vestigo is not directed at children under 13, and we do not knowingly collect
          personal data from them. If you believe a child's data has reached us, write to us
          and we will remove it.
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          If what we collect or how we use it changes, this page changes with it and the date at
          the top is updated. Material changes will be summarised here rather than made quietly.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions, requests, or complaints:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
