import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { UserError } from '../common/error.filter';
import { makeId } from '../common/ids';
import { config } from '../config';

/** An email the app wants to send (built in action-items.logic.ts). */
export interface EmailDraft {
  complaintId?: string | null;
  to: string | null; // null = this person has no email on file
  toName?: string | null;
  type: string; // assignment | extension | reminder | test
  subject: string;
  body: string;
}

/** The mail server the admin set up in Admin console → Email settings. */
interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean; // true = SSL on connect (port 465); false = STARTTLS (port 587)
  user: string;
  passwordEnc: string | null; // stored encrypted with APP_SECRET
  fromEmail: string;
  fromName: string;
  enabled: boolean;
  allowInvalidCert: boolean; // accept an internal / self-signed certificate on the mail server
}

const EMPTY: SmtpSettings = { host: '', port: 587, secure: false, user: '', passwordEnc: null, fromEmail: '', fromName: 'Field Visit Tracker', enabled: true, allowInvalidCert: false };

// --- the SMTP password is kept encrypted in the database ---
const key = () => createHash('sha256').update(config.secret).digest();
function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob: string) {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

/** Sends emails through the admin's SMTP account and records every one in the email log. */
@Injectable()
export class MailService {
  private log = new Logger('Mail');
  constructor(private prisma: PrismaService) {}

  private async load(): Promise<SmtpSettings> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'smtp' } });
    return { ...EMPTY, ...((row?.value as any) || {}) };
  }

  /** The settings as the admin form shows them (never the password itself). */
  async publicSettings() {
    const { passwordEnc, ...s } = await this.load();
    return { ...s, hasPassword: !!passwordEnc, configured: !!(s.host && s.fromEmail) };
  }

  async saveSettings(body: any) {
    const prev = await this.load();
    const next: SmtpSettings = {
      host: String(body?.host ?? prev.host).trim(),
      port: Number(body?.port ?? prev.port) || 587,
      secure: !!(body?.secure ?? prev.secure),
      user: String(body?.user ?? prev.user).trim(),
      // a blank password keeps the saved one; clearPassword removes it
      passwordEnc: body?.clearPassword ? null : body?.password ? encrypt(String(body.password)) : prev.passwordEnc,
      fromEmail: String(body?.fromEmail ?? prev.fromEmail).trim(),
      fromName: String(body?.fromName ?? prev.fromName).trim() || 'Field Visit Tracker',
      enabled: body?.enabled === undefined ? prev.enabled : !!body.enabled,
      allowInvalidCert: body?.allowInvalidCert === undefined ? prev.allowInvalidCert : !!body.allowInvalidCert,
    };
    if (next.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.fromEmail)) throw new UserError('The "send from" address does not look right.');
    await this.prisma.setting.upsert({ where: { key: 'smtp' }, create: { key: 'smtp', value: next as any }, update: { value: next as any } });
    return this.publicSettings();
  }

  private async transport(s: SmtpSettings) {
    return nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      auth: s.user ? { user: s.user, pass: s.passwordEnc ? decrypt(s.passwordEnc) : '' } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      tls: s.allowInvalidCert ? { rejectUnauthorized: false } : undefined,
    });
  }

  /** Sends one email now and waits for the result (used by "Send test email"). */
  async sendTest(to: string) {
    const s = await this.load();
    if (!s.host || !s.fromEmail) throw new UserError('Save the mail server and the "send from" address first.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || ''))) throw new UserError('Enter the address to send the test to.');
    const draft: EmailDraft = {
      to, type: 'test', toName: null,
      subject: '[Field Visit Tracker] Test email',
      body: 'This is a test email from the Field Visit Tracker. If you can read it, emails are set up correctly.',
    };
    const id = makeId('MAIL');
    try {
      const t = await this.transport(s);
      await t.sendMail({ from: { name: s.fromName, address: s.fromEmail }, to, subject: draft.subject, text: draft.body });
      await this.prisma.emailLog.create({ data: { id, ...draft, status: 'sent' } });
      return { ok: true, message: `Test email sent to ${to}.` };
    } catch (err: any) {
      await this.prisma.emailLog.create({ data: { id, ...draft, status: 'failed', error: String(err?.message || err) } });
      throw new UserError(`The mail server refused: ${err?.message || err}`);
    }
  }

  /**
   * Records the emails and sends them in the background, so the admin's click returns at once.
   * Each log entry ends up "sent", "failed" (with the reason) or "not-sent" (no address / no mail server).
   */
  async queue(drafts: EmailDraft[]) {
    const s = await this.load();
    const ready = s.enabled && !!s.host && !!s.fromEmail;
    const footer = config.appUrl ? `\n\nOpen the Field Visit Tracker: ${config.appUrl}/staff.html` : '';
    const rows = [];
    for (const d of drafts) {
      const row = await this.prisma.emailLog.create({
        data: {
          id: makeId('MAIL'),
          complaintId: d.complaintId || null,
          to: d.to || '(no email on file)',
          toName: d.toName || null,
          type: d.type,
          subject: d.subject,
          body: d.body + footer,
          status: !d.to ? 'not-sent' : ready ? 'sending' : 'not-sent',
          error: !d.to ? 'This person has no email address.' : ready ? null : 'Email is not set up yet (Admin console → Email settings).',
        },
      });
      rows.push(row);
    }
    if (ready) void this.deliver(s, rows.filter((r) => r.status === 'sending'));
    return rows.map((r) => ({ ...r, sentAt: r.sentAt.toISOString() }));
  }

  private async deliver(s: SmtpSettings, rows: { id: string; to: string; subject: string; body: string }[]) {
    if (!rows.length) return;
    let t: nodemailer.Transporter;
    try {
      t = await this.transport(s);
    } catch (err: any) {
      for (const r of rows) await this.mark(r.id, 'failed', err?.message);
      return;
    }
    for (const r of rows) {
      try {
        await t.sendMail({ from: { name: s.fromName, address: s.fromEmail }, to: r.to, subject: r.subject, text: r.body });
        await this.mark(r.id, 'sent');
      } catch (err: any) {
        this.log.warn(`Email to ${r.to} failed: ${err?.message}`);
        await this.mark(r.id, 'failed', err?.message);
      }
    }
  }

  private mark(id: string, status: string, error?: string) {
    return this.prisma.emailLog.update({ where: { id }, data: { status, error: error ? String(error).slice(0, 500) : null } }).catch(() => undefined);
  }
}
