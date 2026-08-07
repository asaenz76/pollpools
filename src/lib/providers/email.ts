/**
 * Email notification provider (Phase 8-C, optional).
 *
 * A real out-of-band NotificationProvider behind the existing interface — it does
 * NOT fork notification business logic. The engine still produces the same in-app
 * notification rows; this only adds an email DELIVERY channel. Delivery goes
 * through an EmailTransport so the provider is decoupled from any specific email
 * service and is testable with an in-memory transport (no network).
 *
 * The env transport POSTs to a configured HTTP email API (no new dependency).
 * With no credentials it returns null → the provider reports `isConfigured()`
 * false and delivery is skipped — live delivery is therefore never claimed as
 * tested unless real credentials are supplied.
 */
import type { NotificationProvider, DeliverableNotification, DeliveryResult } from "@/lib/providers/notification";

export type EmailMessage = { to: string; subject: string; text: string; from?: string };

export interface EmailTransport {
  readonly id: string;
  send(message: EmailMessage): Promise<void>;
}

/** In-memory transport for tests — records every message; can simulate failure. */
export class MemoryEmailTransport implements EmailTransport {
  readonly id = "memory";
  readonly sent: EmailMessage[] = [];
  constructor(private readonly failWith?: string) {}
  async send(message: EmailMessage): Promise<void> {
    if (this.failWith) throw new Error(this.failWith);
    this.sent.push(message);
  }
}

/** Real HTTP transport — POSTs JSON to a configured email API; throws on non-2xx. */
export function createHttpEmailTransport(cfg: { endpoint: string; apiKey: string; from: string }): EmailTransport {
  return {
    id: "http",
    async send(message) {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ from: message.from ?? cfg.from, to: message.to, subject: message.subject, text: message.text }),
      });
      if (!res.ok) throw new Error(`EMAIL_HTTP_${res.status}`);
    },
  };
}

/** Build the transport from env, or null when not configured (delivery then skips). */
export function emailTransportFromEnv(env: Record<string, string | undefined> = process.env): EmailTransport | null {
  const endpoint = env.EMAIL_API_ENDPOINT;
  const apiKey = env.EMAIL_API_KEY;
  const from = env.EMAIL_FROM;
  if (!endpoint || !apiKey || !from) return null;
  return createHttpEmailTransport({ endpoint, apiKey, from });
}

/**
 * An email NotificationProvider. The recipient's address is resolved via an
 * injected function (the provider stays decoupled from the user store). Reuses the
 * notification's own title/body as the email subject/text.
 */
export function createEmailNotificationProvider(input: {
  transport: EmailTransport | null;
  resolveEmail: (userId: string) => Promise<string | null>;
  from?: string;
}): NotificationProvider {
  return {
    channel: "email",
    label: "Email",
    isConfigured: () => input.transport !== null,
    async deliver(n: DeliverableNotification): Promise<DeliveryResult> {
      if (!input.transport) return { ok: true, channel: "email", skipped: true };
      const to = await input.resolveEmail(n.userId);
      if (!to) return { ok: true, channel: "email", skipped: true }; // no address on file
      try {
        await input.transport.send({ to, subject: n.title, text: n.body ?? n.title, from: input.from });
        return { ok: true, channel: "email" };
      } catch (e) {
        return { ok: false, channel: "email", error: e instanceof Error ? e.message : "email delivery failed" };
      }
    },
  };
}
