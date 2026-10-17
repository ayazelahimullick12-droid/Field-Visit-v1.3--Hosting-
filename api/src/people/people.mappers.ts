import { AdminUser, Employee } from '@prisma/client';

/** An employee as the screens see it. The password hash never leaves the server. */
export function employeeJson(e: Employee) {
  return {
    id: e.id,
    name: e.name,
    phone: e.phone,
    email: e.email,
    pin: e.pin,
    roles: e.roles,
    departmentId: e.departmentId,
    supervisorId: e.supervisorId,
    designation: e.designation,
    department: e.department,
    title: e.title,
    createdAt: e.createdAt.toISOString(),
  };
}

export function adminJson(a: AdminUser) {
  return { id: a.id, name: a.name, email: a.email, pin: a.pin, createdAt: a.createdAt.toISOString() };
}
