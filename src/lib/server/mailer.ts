// Server-only. SMTP transport built from environment variables so any provider works
// (a club Gmail account with an App Password, Resend, SendGrid, ...).
import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

export function isMailerConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM
  );
}

export function getTransporter(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    pool: true,
    maxConnections: 3,
  });
  return transporter;
}

export function fromAddress(): string {
  return process.env.SMTP_FROM as string;
}
