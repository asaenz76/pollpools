import { LegalPage, Section } from "@/components/legal/legal-page";

export const metadata = { title: "Privacy Policy — Poll Pools" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="Draft">
      <p>This policy explains what Poll Pools collects, why, and the choices you have. It will be finalized with counsel before launch.</p>
      <Section heading="Information we collect">
        <p>Account information (such as email), the predictions and content you create, and basic usage and device information needed to run and secure the service. We do not sell your personal information.</p>
      </Section>
      <Section heading="How we use it">
        <p>To operate the service — authenticate you, score predictions, compute standings, deliver notifications you’ve enabled, prevent abuse, and improve reliability.</p>
      </Section>
      <Section heading="Cookies and sessions">
        <p>We use strictly necessary cookies to keep you signed in and to secure requests. We do not use them for cross-site advertising.</p>
      </Section>
      <Section heading="Service providers">
        <p>We rely on trusted processors to run the platform — for example, a database/authentication provider (Supabase), an email delivery provider (such as Resend) for messages you’ve enabled, and a payments provider for optional paid features. They process data only to provide their service.</p>
      </Section>
      <Section heading="Email preferences">
        <p>Notification emails are off by default and require you to opt in. You can change your notification preferences at any time; in-app notifications are independent of email.</p>
      </Section>
      <Section heading="Data retention">
        <p>We keep information for as long as your account is active or as needed to provide the service and meet legal obligations. Prediction history may be retained for standings integrity.</p>
      </Section>
      <Section heading="Your rights">
        <p>Depending on your location, you may have rights to access, correct, export, or delete your personal information. Contact us to make a request.</p>
      </Section>
      <Section heading="Children">
        <p>Poll Pools is not directed to children under the age required to consent in your jurisdiction.</p>
      </Section>
      <Section heading="Contact">
        <p>Privacy questions or requests: see <a className="text-primary hover:underline" href="/support">Support</a>.</p>
      </Section>
    </LegalPage>
  );
}
