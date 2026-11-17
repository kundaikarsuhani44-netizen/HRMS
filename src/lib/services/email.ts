import nodemailer from 'nodemailer';
import { sql } from '../db';

let transporter: nodemailer.Transporter | null | undefined;
function getTransport() {
  if (transporter !== undefined) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  transporter = SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 587), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
    : null;
  return transporter;
}

export const appUrl = (path = '') => `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}${path}`;

/**
 * L6 — send an email and record it in email_log. Email failure never blocks the HR action
 * (a leave request is still submitted if SMTP is down); the failure is visible in Settings → Email log.
 * With no SMTP configured (local / demo), the email is logged only.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string; related?: string; createdBy?: number }) {
  const t = getTransport();
  let status: 'sent' | 'logged_only' | 'failed' = 'logged_only';
  let error: string | null = null;
  if (t && process.env.NODE_ENV !== 'test') {
    try {
      await t.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to: msg.to, subject: msg.subject, text: msg.text });
      status = 'sent';
    } catch (e) {
      status = 'failed';
      error = (e as Error).message.slice(0, 500);
      console.error('[email] failed', error);
    }
  }
  await sql`insert into email_log (to_email, subject, body, status, error, related, created_by)
            values (${msg.to}, ${msg.subject}, ${msg.text}, ${status}, ${error}, ${msg.related ?? null}, ${msg.createdBy ?? null})`;
  return status;
}
