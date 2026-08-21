import { CONTACT_EMAIL, GOVERNING_LAW, LegalPage, Section } from "./Legal";

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="The rules for using Vestigo, and the limits of what it promises."
    >
      <Section heading="Accepting these terms">
        <p>
          By using Vestigo you agree to these terms. If you do not agree with them, please do
          not use the service. They apply to the website and to any companion application we
          publish under the same name.
        </p>
      </Section>

      <Section heading="What Vestigo is">
        <p>
          Vestigo is an independent statistics and analysis service for video games. It reads
          match data that has already been played and presents it back: aggregate reports about
          what is working in the current meta, and analysis of an individual account's past
          matches.
        </p>
        <p>
          Everything Vestigo produces is retrospective. It does not read live game state, does
          not track or predict opponents during a match, and does not tell you what to do while
          a game is running. It is a study tool for between games.
        </p>
      </Section>

      <Section heading="Not affiliated with the game publishers">
        <p>
          Vestigo isn't endorsed by Riot Games and doesn't reflect the views or opinions of
          Riot Games or anyone officially involved in producing or managing Riot Games
          properties. Riot Games and all associated properties are trademarks or registered
          trademarks of Riot Games, Inc.
        </p>
        <p>
          Vestigo is likewise not affiliated with, endorsed by, or sponsored by Valve
          Corporation. All game names, logos, and images belong to their respective owners.
        </p>
      </Section>

      <Section heading="The game publishers' terms also apply">
        <p>
          Using Vestigo does not release you from the terms of service of the games it covers.
          Nothing here permits anything those terms forbid, and where they conflict with these,
          theirs govern your conduct in their games.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>
            Use the service to harass, dox, or target another player, or to compile information
            about a specific person for any purpose other than reviewing your own play.
          </li>
          <li>
            Scrape, mirror, or bulk-download the site, or place automated load on it beyond
            ordinary use.
          </li>
          <li>
            Attempt to gain access to parts of the service, its database, or its credentials
            that are not made public.
          </li>
          <li>
            Resell or redistribute the data or analysis as your own product, or present it as
            coming from a game publisher.
          </li>
          <li>Use the service for anything unlawful, or in a way that breaks these terms.</li>
        </ul>
        <p>
          We may restrict or withdraw access where use breaks these rules or threatens the
          service's stability.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          Vestigo depends on data provided by third parties, principally the Riot Games API.
          That dependency means features can change or stop working for reasons outside our
          control — a rate limit, a policy change, or a game update. We may add, change, or
          remove features at any time, and we do not guarantee uninterrupted availability.
        </p>
      </Section>

      <Section heading="Accuracy">
        <p>
          Every figure on this site is measured from real matches, and where a number rests on a
          thin sample the site says so rather than dressing it up. Even so, statistics describe
          what has happened; they do not promise what will. Nothing here is a guarantee of a
          result in any game.
        </p>
      </Section>

      <Section heading="Intellectual property">
        <p>
          The site's code, its written analysis, and the way it presents data are ours. Game
          content — names, portraits, item and trait icons, and the underlying match data —
          belongs to the respective game publishers and is used to describe their games. Game
          images are loaded from CommunityDragon, a community project we do not operate.
        </p>
      </Section>

      <Section heading="No warranty">
        <p>
          The service is provided "as is" and "as available", without warranties of any kind,
          whether express or implied, including any implied warranty of merchantability, fitness
          for a particular purpose, or non-infringement. We do not warrant that the service will
          be uninterrupted, error-free, or that any figure it shows is complete.
        </p>
      </Section>

      <Section heading="Limitation of liability">
        <p>
          To the fullest extent permitted by law, we are not liable for any indirect, incidental,
          special, or consequential damages arising from your use of the service, nor for any
          loss of data, profits, or rank. Nothing in these terms limits liability that cannot be
          limited by law, including liability for fraud or for death or personal injury caused by
          negligence. Where you are a consumer, your statutory rights are unaffected.
        </p>
      </Section>

      <Section heading="Changes to these terms">
        <p>
          We may update these terms as the service changes. The date at the top of this page
          shows when they were last revised, and continuing to use Vestigo after a change means
          you accept the revised terms.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>
          These terms are governed by the laws of {GOVERNING_LAW}, where the operator is based,
          without regard to conflict-of-law rules. If you are a consumer resident elsewhere, you
          keep the protection of the mandatory consumer laws of your country of residence.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
