import { HttpException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { UserError } from '../common/error.filter';
import { SessionUser } from '../auth/access';
import { mergeVisit, visibleTo } from './visit-rules';

/** Reading and writing visits. Every change to one visit happens while that row is locked. */
@Injectable()
export class VisitsService {
  constructor(private prisma: PrismaService) {}

  /** Every visit document, newest first. */
  async all(): Promise<any[]> {
    const rows = await this.prisma.visit.findMany({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    return rows.map((r) => r.data as any);
  }

  /** The visits this person may see (see visibleTo in visit-rules.ts). */
  async listFor(user: SessionUser) {
    return (await this.all()).map((v) => visibleTo(user, v)).filter(Boolean);
  }

  /** Saves a visit sent by the staff app (new or changed). Only its owner can change it. */
  async saveFromStaff(user: SessionUser, id: string, body: any) {
    if (!body || typeof body !== 'object' || !Array.isArray(body.stops)) throw new UserError('A visit needs a list of stops.');
    return this.prisma.$transaction(async (tx) => {
      const prev = await this.lock(tx, id);
      if (prev && prev.employeeId !== user.id) throw new UserError('This visit belongs to someone else.', 403);
      if (prev && prev.status === 'done')
        throw new HttpException({ error: 'This visit was already marked as done and can no longer change.', visit: prev }, 409);
      const next = mergeVisit(prev, { ...body, employeeId: user.id, employeeName: prev?.employeeName || user.name }, id);
      if (!next.createdAt) next.createdAt = prev?.createdAt || new Date().toISOString();
      await this.write(tx, next);
      return next;
    });
  }

  /** A visit can be deleted (with everything on it) until it is marked done. */
  async deleteFromStaff(user: SessionUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const v = await this.lock(tx, id);
      if (!v) return { deleted: false };
      if (v.employeeId !== user.id) throw new UserError('This visit belongs to someone else.', 403);
      if (v.status === 'done') throw new HttpException({ error: "A visit marked as done can't be deleted.", visit: v }, 409);
      await tx.visit.delete({ where: { id } });
      return { deleted: true };
    });
  }

  /**
   * Runs `change` on one visit while it is locked and saves what it returns. Use it for every
   * server-side change to a visit (assigning an action item, a like, a comment ...), so two
   * people acting at the same moment can't undo each other.
   */
  async update<T>(id: string, change: (visit: any) => T | Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const v = await this.lock(tx, id);
      if (!v) throw new UserError('Visit not found', 404);
      const result = await change(v);
      await this.write(tx, v);
      return result;
    });
  }

  private async lock(tx: Prisma.TransactionClient, id: string): Promise<any | null> {
    const rows = await tx.$queryRaw<{ data: any }[]>`SELECT data FROM "Visit" WHERE id = ${id} FOR UPDATE`;
    return rows[0]?.data ?? null;
  }

  private async write(tx: Prisma.TransactionClient, v: any) {
    const fields = { employeeId: String(v.employeeId || ''), status: v.status === 'done' ? 'done' : 'open', date: v.date || null, data: v };
    await tx.visit.upsert({ where: { id: v.id }, create: { id: v.id, ...fields }, update: fields });
  }
}
