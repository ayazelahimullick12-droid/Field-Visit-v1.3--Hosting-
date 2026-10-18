import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { UserError } from '../common/error.filter';
import { makeId } from '../common/ids';
import { AdminOnly, CurrentUser, SessionUser } from '../auth/access';
import { adminJson, employeeJson } from './people.mappers';

const ROLES = ['field', 'fixer', 'management'];
const clean = (v: any) => (v == null ? null : String(v).trim() || null);

/** Employees (staff app users) and admin accounts. Only admins can change them. */
@Controller('api')
export class PeopleController {
  constructor(private prisma: PrismaService) {}

  // ---------- employees ----------

  @Get('employees')
  async listEmployees() {
    const rows = await this.prisma.employee.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(employeeJson);
  }

  @AdminOnly()
  @Post('employees')
  async createEmployee(@Body() body: any) {
    const data = await this.employeeFields(body, null);
    if (!body?.password) throw new UserError('Give the new employee a password.');
    const e = await this.prisma.employee.create({ data: { id: makeId('EMP'), ...data } as any });
    return employeeJson(e);
  }

  @AdminOnly()
  @Patch('employees/:id')
  async updateEmployee(@Param('id') id: string, @Body() body: any) {
    if (!(await this.prisma.employee.findUnique({ where: { id } }))) throw new UserError('Employee not found', 404);
    const data = await this.employeeFields(body, id);
    const e = await this.prisma.employee.update({ where: { id }, data });
    return employeeJson(e);
  }

  @AdminOnly()
  @Delete('employees/:id')
  async deleteEmployee(@Param('id') id: string) {
    await this.prisma.employee.deleteMany({ where: { id } });
    return { deleted: true };
  }

  /** Checks and tidies what the admin form sent. A blank password keeps the current one. */
  private async employeeFields(body: any, id: string | null) {
    const name = clean(body?.name);
    const pin = clean(body?.pin);
    if (!name) throw new UserError('Name is required.');
    if (!pin) throw new UserError('PIN is required — every employee is tracked by a unique PIN.');
    const taken = await this.prisma.employee.findUnique({ where: { pin } });
    if (taken && taken.id !== id) throw new UserError('That PIN is already used by another employee — PINs must be unique.');
    const email = clean(body?.email);
    if (email) {
      const sameEmail = await this.prisma.employee.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
      if (sameEmail && sameEmail.id !== id) throw new UserError('That email is already used by another employee.');
    }
    const roles = (Array.isArray(body?.roles) ? body.roles : ['field']).filter((r: string) => ROLES.includes(r));
    const departmentId = clean(body?.departmentId);
    // a team only counts if it belongs to the chosen unit
    const teamId = clean(body?.teamId);
    const team = teamId && departmentId ? await this.prisma.unit.findFirst({ where: { id: teamId, departmentId } }) : null;
    if (roles.includes('fixer') && !departmentId) throw new UserError('A fixer needs a unit, so their queue knows which action items are theirs.');

    const data: any = {
      name, pin, email, roles,
      phone: clean(body?.phone),
      departmentId,
      teamId: team ? team.id : null,
      supervisorId: clean(body?.supervisorId),
      designation: clean(body?.designation),
      department: clean(body?.department),
    };
    if (body?.password) data.passwordHash = await bcrypt.hash(String(body.password), 10);
    return data;
  }

  // ---------- admin accounts ----------

  @AdminOnly()
  @Get('adminUsers')
  async listAdmins() {
    const rows = await this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(adminJson);
  }

  @AdminOnly()
  @Post('adminUsers')
  async createAdmin(@Body() body: any) {
    const data = await this.adminFields(body, null);
    if (!body?.password) throw new UserError('Name, PIN and password are needed.');
    return adminJson(await this.prisma.adminUser.create({ data: { id: makeId('ADM'), ...data } as any }));
  }

  @AdminOnly()
  @Patch('adminUsers/:id')
  async updateAdmin(@Param('id') id: string, @Body() body: any) {
    const data = await this.adminFields(body, id);
    return adminJson(await this.prisma.adminUser.update({ where: { id }, data }));
  }

  @AdminOnly()
  @Delete('adminUsers/:id')
  async deleteAdmin(@Param('id') id: string, @CurrentUser() me: SessionUser) {
    if (id === me.id) throw new UserError("You can't remove your own admin account.");
    await this.prisma.adminUser.deleteMany({ where: { id } });
    return { deleted: true };
  }

  private async adminFields(body: any, id: string | null) {
    const name = clean(body?.name);
    const pin = clean(body?.pin);
    if (!name || !pin) throw new UserError('Name, PIN and password are needed.');
    if (!/^\d{4,8}$/.test(pin)) throw new UserError('The PIN should be 4 to 8 digits.');
    const taken = await this.prisma.adminUser.findUnique({ where: { pin } });
    if (taken && taken.id !== id) throw new UserError('Another admin already uses that PIN.');
    const data: any = { name, pin, email: clean(body?.email) };
    if (body?.password) data.passwordHash = await bcrypt.hash(String(body.password), 10);
    return data;
  }
}
