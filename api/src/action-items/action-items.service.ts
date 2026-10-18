import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UserError } from '../common/error.filter';
import { makeId } from '../common/ids';
import { SessionUser } from '../auth/access';
import { VisitsService } from '../visits/visits.service';
import { relinkOffice } from '../visits/visit-rules';
import { EmailDraft, MailService } from '../mail/mail.service';
import * as rules from './action-items.logic';

const REMINDER_CHECK_EVERY_MS = 5 * 60 * 1000;

/** Runs the workflow rules (action-items.logic.ts) on a locked visit and sends the emails they produce. */
@Injectable()
export class ActionItemsService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('ActionItems');
  private timer: NodeJS.Timeout;

  constructor(private prisma: PrismaService, private visits: VisitsService, private mail: MailService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.runDeadlineCheck().catch((e) => this.logger.error(e)), REMINDER_CHECK_EVERY_MS);
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async ctx(): Promise<rules.Ctx> {
    const [employees, departments] = await Promise.all([
      this.prisma.employee.findMany(),
      this.prisma.department.findMany({ include: { units: true } }),
    ]);
    return { employees, departments };
  }

  /** Finds the action item on its visit, runs `change` on it and saves the visit. */
  private async onItem<T>(visitId: string, complaintId: string, change: (c: any, visit: any) => T): Promise<{ complaint: any; result: T }> {
    try {
      return await this.visits.update(visitId, (visit) => {
        const c = (visit.complaints || []).find((x: any) => x.id === complaintId);
        if (!c || c.state === 'draft') throw new Error('Action item not found');
        return { complaint: c, result: change(c, visit) };
      });
    } catch (err: any) {
      throw err instanceof UserError ? err : new UserError(err.message);
    }
  }

  // ---------- admin ----------

  async assign(body: any) {
    const ctx = await this.ctx();
    const { complaint, result } = await this.onItem(body.visitId, body.complaintId, (c, v) => rules.assign(ctx, c, v, body));
    const emails = await this.mail.queue(result);
    return { complaint, email: emails[0], emails };
  }

  async extend(body: any) {
    const ctx = await this.ctx();
    const { complaint, result } = await this.onItem(body.visitId, body.complaintId, (c, v) => rules.extend(ctx, c, v, body));
    const emails = await this.mail.queue(result);
    return { complaint, email: emails[0], emails };
  }

  /** Sends any reminders that are due. Also runs by itself every 5 minutes. */
  async runDeadlineCheck() {
    const ctx = await this.ctx();
    const all = await this.visits.all();
    const drafts: EmailDraft[] = [];
    for (const v of all) {
      const now = new Date();
      // only lock and save visits that actually have a reminder due
      const due = (v.complaints || []).some((c: any) => rules.reminderDue(ctx, structuredClone(c), v, now).length);
      if (!due) continue;
      const found = await this.visits.update(v.id, (visit) =>
        (visit.complaints || []).flatMap((c: any) => rules.reminderDue(ctx, c, visit, now)),
      );
      drafts.push(...found);
    }
    const emails = drafts.length ? await this.mail.queue(drafts) : [];
    if (emails.length) this.logger.log(`Sent ${emails.length} deadline reminder(s)`);
    return { emailsGenerated: emails.length, emails };
  }

  /** An office renamed or moved by the admin: its past visits follow. */
  async relinkOffice(existing: any, form: any) {
    if (!existing?.name || !form?.name) throw new UserError('Office details missing');
    let changed = 0;
    for (const v of await this.visits.all()) {
      if (!relinkOffice(v, existing, form)) continue;
      await this.visits.update(v.id, (visit) => {
        const next = relinkOffice(visit, existing, form);
        if (next) Object.assign(visit, next);
      });
      changed++;
    }
    return { changed };
  }

  // ---------- fixers (the person signed in) ----------

  async start(user: SessionUser, body: any) {
    const ctx = await this.ctx();
    const { complaint } = await this.onItem(body.visitId, body.complaintId, (c) => rules.start(ctx, c, user.id));
    return { complaint };
  }

  async longTerm(user: SessionUser, body: any) {
    const ctx = await this.ctx();
    const { complaint } = await this.onItem(body.visitId, body.complaintId, (c) => rules.longTerm(ctx, c, user.id, body.note));
    return { complaint };
  }

  async fixed(user: SessionUser, body: any) {
    const ctx = await this.ctx();
    const { complaint } = await this.onItem(body.visitId, body.complaintId, (c) => rules.fixed(ctx, c, user.id, body.note, body.photoUrl));
    return { complaint };
  }

  // ---------- stories ----------

  private async onStory(visitId: string, storyId: string, change: (s: any) => void) {
    try {
      return await this.visits.update(visitId, (visit) => {
        const story = (visit.stories || []).find((s: any) => s.id === storyId);
        if (!story) throw new Error('Story not found');
        change(story);
        return { story };
      });
    } catch (err: any) {
      throw err instanceof UserError ? err : new UserError(err.message);
    }
  }

  toggleLike(user: SessionUser, body: any) {
    return this.onStory(body.visitId, body.storyId, (s) => rules.toggleLike(s, user.id));
  }

  recordShare(body: any) {
    return this.onStory(body.visitId, body.storyId, (s) => rules.recordShare(s));
  }

  addComment(user: SessionUser, body: any) {
    return this.onStory(body.visitId, body.storyId, (s) => rules.addComment(s, user, body.text, makeId('CM')));
  }
}
