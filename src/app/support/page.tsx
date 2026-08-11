import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata = { title: "Support — Poll Pools" };

export default function SupportPage() {
  return (
    <LegalPage title="Support" updated="Draft">
      <p>Need help with Poll Pools? Here’s how to reach us and where to look first. A monitored support address will be published before launch.</p>
      <Section heading="Contact">
        <p>Email our team and we’ll get back to you. The production support address is configured during launch and shown here.</p>
      </Section>
      <Section heading="For members">
        <p>Trouble signing in, making a prediction, or seeing your standing? Check that you’re signed in to the right community, then reach out with the event link and what you expected to happen.</p>
      </Section>
      <Section heading="For community operators">
        <p>Managing events, submitting results, or publishing your community? Your dashboard’s management tools cover the full event lifecycle. If a result needs correcting, use Correct result on the settled event. For help, include your community handle and the event.</p>
      </Section>
      <Section heading="Billing and paid features">
        <p>Optional paid features are voluntary and never affect scoring or standings. For a billing question, include the approximate date and the community involved.</p>
      </Section>
      <Section heading="Trust and safety">
        <p>To report abuse or content that violates our <a className="text-primary hover:underline" href="/terms">Terms</a>, contact us with a link and a short description.</p>
      </Section>
    </LegalPage>
  );
}
