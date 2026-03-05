import { Resend } from 'resend';
import { config } from '../config.js';

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    if (!config.resend.apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resend = new Resend(config.resend.apiKey);
  }
  return resend;
}

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail(options: SendEmailOptions) {
  const client = getResend();
  const { data, error } = await client.emails.send({
    from: config.resend.fromEmail,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html,
  });

  if (error) {
    throw new Error(`Email send failed: ${error.message}`);
  }

  return data;
}

export function isEmailConfigured(): boolean {
  return !!config.resend.apiKey;
}
