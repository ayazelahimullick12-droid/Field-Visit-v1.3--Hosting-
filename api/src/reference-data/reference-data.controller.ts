import { Body, Controller, Get, Put } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UserError } from '../common/error.filter';
import { AdminOnly } from '../auth/access';

/** What the app shows before anything is changed by the admin. */
export const DEFAULT_APP_SETTINGS = {
  visitTargetDays: 90,
  managementTabs: { offices: false, people: false, analytics: false },
};

/**
 * Lists the admin maintains: units and teams (departments), offices and app settings,
 * plus the log of sent emails. Everyone signed in can read them; only admins can save.
 * The admin console sends the whole list back when it saves, as it always has.
 */
@Controller('api')
export class ReferenceDataController {
  constructor(private prisma: PrismaService) {}

  // ---------- units (departments) and their teams ----------

  @Get('departments')
  async departments() {
    const rows = await this.prisma.department.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { units: { orderBy: { sortOrder: 'asc' } } },
    });
    return rows.map((d) => ({ id: d.id, name: d.name, units: d.units.map((u) => ({ id: u.id, name: u.name })) }));
  }

  @AdminOnly()
  @Put('departments')
  async saveDepartments(@Body() list: any[]) {
    if (!Array.isArray(list)) throw new UserError('Expected a list of units.');
    await this.prisma.$transaction(async (tx) => {
      const ids = list.map((d) => String(d.id));
      await tx.department.deleteMany({ where: { id: { notIn: ids } } });
      for (const [i, d] of list.entries()) {
        const data = { name: String(d.name || '').trim() || 'Unnamed', sortOrder: i };
        await tx.department.upsert({ where: { id: String(d.id) }, create: { id: String(d.id), ...data }, update: data });
        const units = Array.isArray(d.units) ? d.units : [];
        await tx.unit.deleteMany({ where: { departmentId: String(d.id), id: { notIn: units.map((u: any) => String(u.id)) } } });
        for (const [j, u] of units.entries()) {
          const ud = { name: String(u.name || '').trim() || 'Unnamed', sortOrder: j, departmentId: String(d.id) };
          await tx.unit.upsert({ where: { id: String(u.id) }, create: { id: String(u.id), ...ud }, update: ud });
        }
      }
    });
    return this.departments();
  }

  // ---------- offices ----------

  @Get('offices')
  async offices() {
    const rows = await this.prisma.office.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map(({ sortOrder, ...o }) => o);
  }

  @AdminOnly()
  @Put('offices')
  async saveOffices(@Body() list: any[]) {
    if (!Array.isArray(list)) throw new UserError('Expected a list of offices.');
    const num = (v: any) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
    await this.prisma.$transaction(async (tx) => {
      await tx.office.deleteMany({ where: { id: { notIn: list.map((o) => String(o.id)) } } });
      for (const [i, o] of list.entries()) {
        const data = {
          name: String(o.name || '').trim(),
          type: o.type || 'branch',
          division: o.division || null,
          district: o.district || null,
          area: o.area || null,
          lat: num(o.lat),
          lng: num(o.lng),
          active: o.active !== false,
          sortOrder: i,
        };
        await tx.office.upsert({ where: { id: String(o.id) }, create: { id: String(o.id), ...data }, update: data });
      }
    }, { timeout: 60_000 });
    return this.offices();
  }

  // ---------- app settings ----------

  @Get('settings')
  async settings() {
    const row = await this.prisma.setting.findUnique({ where: { key: 'app' } });
    return { ...DEFAULT_APP_SETTINGS, ...((row?.value as object) || {}) };
  }

  @AdminOnly()
  @Put('settings')
  async saveSettings(@Body() body: any) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UserError('Expected settings.');
    const { smtp, ...value } = body; // mail settings have their own endpoint (mail.controller.ts)
    await this.prisma.setting.upsert({ where: { key: 'app' }, create: { key: 'app', value }, update: { value } });
    return this.settings();
  }

  // ---------- sent emails ----------

  @AdminOnly()
  @Get('emailLog')
  async emailLog() {
    const rows = await this.prisma.emailLog.findMany({ orderBy: { sentAt: 'desc' }, take: 2000 });
    return rows.map((m) => ({ ...m, sentAt: m.sentAt.toISOString() }));
  }
}
