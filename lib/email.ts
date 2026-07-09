import nodemailer, { type Transporter } from "nodemailer";

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

let cachedTransporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (cachedTransporter !== undefined) {
    return cachedTransporter;
  }

  const host = process.env.SMTP_HOST;
  if (!host) {
    cachedTransporter = null;
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return cachedTransporter;
}

/**
 * Sends an email via the SMTP_* env vars. If SMTP_HOST isn't configured
 * (true for local dev, where no real mail provider is wired up yet), logs
 * the email to the console instead of throwing, so the Send flow stays
 * testable end-to-end without live credentials. This fallback is
 * intentional and logged loudly, not a silently swallowed failure.
 */
export async function sendMail(options: SendMailOptions): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    console.warn(
      `[email:dev-fallback] SMTP_HOST not set — would have sent to ${options.to}: "${options.subject}"` +
        (options.attachments?.length
          ? ` with attachments: ${options.attachments.map((a) => a.filename).join(", ")}`
          : ""),
    );
    return;
  }

  const from = process.env.SMTP_FROM ?? "TechGrah Innovations <no-reply@techgrah.com>";
  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  });
}
