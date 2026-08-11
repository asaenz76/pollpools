import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata = { title: "Terms of Service — Poll Pools" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="Draft">
      <p>
        Poll Pools is a social prediction and community competition platform. Community operators run
        events; members predict outcomes for fun, standing, and recognition. Poll Pools is not a betting,
        wagering, or money-gaming service, and predictions never involve staking money on an outcome.
      </p>
      <Section heading="1. Acceptance">
        <p>By creating an account or using Poll Pools, you agree to these terms. If you do not agree, do not use the service.</p>
      </Section>
      <Section heading="2. The service">
        <p>Poll Pools lets communities create events and prediction markets, and lets members submit predictions that are scored against verified results. Standings, streaks, and achievements are for recognition only and carry no cash value.</p>
      </Section>
      <Section heading="3. Accounts">
        <p>You are responsible for your account and for keeping your credentials secure. You must provide accurate information and be old enough to form a binding agreement in your jurisdiction.</p>
      </Section>
      <Section heading="4. Acceptable use">
        <p>Do not misuse the service: no unlawful activity, harassment, fraud, scraping, attempts to manipulate results or standings, or interference with others’ use. Community operators are responsible for the events and content they publish.</p>
      </Section>
      <Section heading="5. Communities and operators">
        <p>Anyone may create a community. Operators control their events, competitors, results, and branding, and are responsible for accuracy and for complying with applicable law. Poll Pools may remove content or suspend communities that violate these terms.</p>
      </Section>
      <Section heading="6. Payments">
        <p>Optional paid features (such as Creator Support and platform membership) are voluntary and do not affect prediction scoring, accuracy, standings, or settlement. Payments are processed by a third-party provider; purchases are subject to that provider’s terms. Paid features never constitute a wager and never pay out based on the outcome of a prediction.</p>
      </Section>
      <Section heading="7. Content">
        <p>You retain ownership of content you submit and grant Poll Pools a license to host and display it to operate the service. You are responsible for having the rights to any content you upload or link.</p>
      </Section>
      <Section heading="8. Termination">
        <p>You may stop using the service at any time. We may suspend or terminate access for violations of these terms or to protect the service and its users.</p>
      </Section>
      <Section heading="9. Disclaimers and liability">
        <p>The service is provided “as is” without warranties to the extent permitted by law. To the maximum extent permitted, Poll Pools is not liable for indirect or consequential damages. Nothing here limits liability that cannot be limited by law.</p>
      </Section>
      <Section heading="10. Changes">
        <p>We may update these terms; material changes will be communicated before they take effect. Continued use after changes means you accept them.</p>
      </Section>
      <Section heading="11. Contact">
        <p>Questions about these terms: see <a className="text-primary hover:underline" href="/support">Support</a>.</p>
      </Section>
    </LegalPage>
  );
}
