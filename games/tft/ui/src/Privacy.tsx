import { CONTACT_EMAIL, LegalPage, Section } from "./Legal";

/**
 * Every claim here was checked against the code before it was written.
 *
 * The browser stores four keys of its own — vestigo.lang, vestigo.band,
 * the analytics decision and vestigo.lastPlayer — and sets no cookies unless
 * the visitor accepts. Grep for `localStorage` before editing that count: it
 * said "two" for a while after the rank filter shipped, which is exactly the
 * drift this note exists to prevent.
 *
 * Server-side the schema holds five tables — matches, match_players, players,
 * ladder and rate_limit — and row-level security is on with no policies, so the
 * publishable key returns nothing from any of them. This said "three" until the
 * ladder cache and the rate limiter were added without it being revisited; the
 * same drift, in the other direction. Check `list_tables` before editing it. Google
 * Analytics is loaded only after that acceptance: see analytics.ts, where the
 * script tag is never appended without it, so "declined" and "undecided" are
 * the same thing on the wire. Server-side, the schema in
 * If any of that changes, this document changes in the same commit.
 */
export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What Vestigo collects, why, and what it never touches."
    >
      <Section heading="In short">
        <p>
          Vestigo has no user accounts and never asks for a password or a payment method. To
          analyse a player we need one thing: the Riot ID you type into the search box.
          Everything else we hold is public match data provided by Riot Games.
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
          Vestigo is an independent statistics and post-match analysis service for video
          games. It is operated by an individual developer and is not affiliated with, endorsed
          by, or connected to Riot Games, Inc. or Valve Corporation. For anything in this
          policy, write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>

      <Section heading="What we collect">
        <h3 className="legal-subheading">Information you give us</h3>
        <p>
          The Riot ID (game name and tag line) and the region you enter in the search form. We
          send them to Riot's API to resolve the account and retrieve its match history. We do
          not ask for your name, email address, date of birth, or any payment detail.
        </p>

        <h3 className="legal-subheading">Information we receive from Riot Games</h3>
        <p>
          Match data returned by Riot's API. A match record covers all eight players in that
          lobby, so it contains their account identifiers (PUUIDs), in-game names, final boards,
          and placements. This is data Riot makes available to approved third-party developers;
          we do not obtain it from any other source, and we do not scrape it from other sites.
        </p>

        <h3 className="legal-subheading">Information stored in your browser</h3>
        <p>
          Four items of local storage: your language choice, so the site opens in the language
          you picked; the rank filter you last used on the meta list; your answer to the
          analytics question, so we stop asking; and the last Riot ID you searched, so
          returning to the player page does not mean typing it again. None of them is sent to
          us — the Riot ID is stored on your device only, and the searches themselves reach our
          server the same way whether or not it was remembered. Clearing your browser data
          removes all four.
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
          and we do not receive yours. We never send Google the Riot ID you searched for, and
          the analytics data is never joined to match data.
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
          build profiles from it and do not combine it with the match data described above.
        </p>

        <h3 className="legal-subheading">What we do not collect</h3>
        <p>
          No accounts, passwords, or authentication tokens. No payment or financial data. No
          data about you from any source other than Riot's API, your own search, and — if you
          accept it — the analytics described above. We do not buy data about you, and we run
          no advertising or cross-site tracking identifiers of our own.
        </p>
      </Section>

      <Section heading="Why we use it">
        <ul>
          <li>To resolve the Riot ID you searched for and load that account's match history.</li>
          <li>
            To produce the analysis you asked for: your placements, the compositions you play,
            and the patterns across the matches shown on screen.
          </li>
          <li>
            To build aggregate, non-personal statistics — the meta report — from match data at
            large. These are counts and averages across thousands of games; no individual player
            is identifiable in them.
          </li>
          <li>To cache Riot's responses so we stay within the rate limits Riot sets.</li>
          <li>
            If you accepted analytics: to count visits and see which pages get used, so we know
            what to work on.
          </li>
        </ul>
        <p>
          We do not use this data to advertise to you, and we do not sell or rent it to anyone.
        </p>
      </Section>

      <Section heading="Legal bases">
        <p>
          Where the GDPR or the UK GDPR applies, we rely on legitimate interests
          (Article 6(1)(f)) — operating an analysis service that people ask us to run for them,
          and producing aggregate statistics about a game. Where you type a Riot ID into the
          search box, we also rely on your request as the trigger for the processing. You can
          object to processing at any time using the contact address below.
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
          Match records retrieved from Riot are stored so repeat views do not re-request the
          same match, alongside a small index of which accounts appeared in which match and a
          cache of Riot ID to account identifier. Aggregate statistics derived from that data
          are kept for as long as the corresponding game set is current.
        </p>
        <p>
          Match records are retained while they remain relevant to the current game set and are
          removed when they no longer are. Riot's own developer policies also govern how long
          third parties may retain data from its API, and where those require shorter retention
          or deletion, they take precedence over this section.
        </p>
        <p>
          We also keep a cache of the public Challenger ladder for each region, so that page
          loads without calling Riot every time. It holds only what Riot publishes about those
          standings.
        </p>
        <p>
          When an account is searched, we record the ranked standing Riot reports for it at that
          moment — tier, division, league points, and the number of ranked games played — with
          the date it was recorded. This is what lets the profile show how an account's LP moved
          over a set, which Riot's API does not report on its own. A new record is written only
          when one of those values has changed since the last one. These records are kept
          indefinitely; all of them describe standings Riot publishes about ranked play.
        </p>
        <p>
          To keep one caller from exhausting our access to Riot's API, the server counts
          requests over a rolling one-minute window. It does not store your IP address to do
          it: the address is hashed the moment the request arrives and only that hash is
          written, which is enough to count requests and not enough to identify you or to
          recover the address. Each counter covers sixty seconds and is overwritten by the
          next.
        </p>
        <p>
          Analytics data, where you consented to it, is held by Google under the retention
          period set on our property and is deleted by Google when that period elapses. We keep
          no copy of it ourselves: we read the reports in Google's interface and nothing is
          exported into our own database.
        </p>
      </Section>

      <Section heading="Who else is involved">
        <ul>
          <li>
            <strong>Riot Games, Inc.</strong> — the source of all match data, reached through
            its official API. Your search is sent to Riot in order to answer it.
          </li>
          <li>
            <strong>Our hosting and database provider</strong> — an infrastructure company that
            stores the data described above on our behalf, under contract and on our
            instructions. We name providers by category here rather than individually; if you
            need to know which company it is, ask us and we will tell you.
          </li>
          <li>
            <strong>CommunityDragon</strong> — a community project that hosts the game images
            (champion portraits, item and trait icons) the site displays. Your browser loads
            those images from it; no information about your search is sent there.
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
          Riot's API is served from regional endpoints matching the region you select, and our
          hosting provider operates data centres in several countries, so data may be processed
          outside the country you are in — including outside the European Economic Area. Where
          that applies, transfers rely on the standard contractual clauses our provider has in
          place. If you accepted analytics, Google likewise processes that data in the United
          States under its own transfer safeguards; declining keeps your visit out of it
          entirely.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Our database has row-level security enabled with no public access policies, which
          means the key shipped to your browser can read nothing from it; only our server-side
          function, holding a separate credential, can. Our Riot API key exists only on the
          server and is never sent to the browser. All traffic is served over HTTPS.
        </p>
        <p>
          No system is perfectly secure. We do not hold passwords or payment data, which limits
          what a breach could expose, but we cannot guarantee absolute security.
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
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and tell us the Riot ID
          concerned. Because we hold no accounts, that identifier is the only way we can locate
          the data, and we may ask you to demonstrate control of it before we act. We will
          respond within the period the applicable law requires.
        </p>
        <p>
          Note that a match involves eight players, so a single match record can relate to
          several people. Where we cannot delete a record without destroying data that belongs
          to others, we will remove the identifiers linking it to you instead.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          Vestigo is not directed at children under 13, and we do not knowingly collect
          personal data from them. Riot's own services carry their own age requirements. If you
          believe a child's data has reached us through a search, write to us and we will remove
          it.
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
