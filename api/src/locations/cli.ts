/**
 * Locations from the command line (after `npm run build`):
 *   npm run db:locations -- branches.json   load a saved copy of the branch API (same rules as a sync)
 *   npm run db:locations -- --sync          download the branch API now (needs BRANCH_API_URL / BRANCH_API_TOKEN)
 *   npm run db:locations -- --rebuild       rebuild from the rows already kept
 *   npm run db:locations -- --remove-old    delete the offices, regions and areas that didn't come from the API
 *                                           (the ones made by hand before), and every visit
 * Writes to the database in DATABASE_URL (api/.env, or the shell's variable, which wins).
 */
import '../config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../common/prisma.service';
import { LocationsService } from './locations.service';

async function main() {
  const args = process.argv.slice(2);
  const prisma = new PrismaService();
  const locations = new LocationsService(prisma);
  try {
    const target = new URL(process.env.DATABASE_URL || 'postgresql://unset');
    console.log(`Database: ${target.hostname}:${target.port || 5432}${target.pathname}`);
    if (args.includes('--remove-old')) {
      const visits = await prisma.visit.deleteMany({});
      // API offices are OFF-B-<branch ID>, OFF-R-… (regional) and OFF-A-… (area)
      const offices = await prisma.office.deleteMany({
        where: { NOT: [{ id: { startsWith: 'OFF-B-' } }, { id: { startsWith: 'OFF-R-' } }, { id: { startsWith: 'OFF-A-' } }] },
      });
      console.log(`Deleted ${visits.count} visits and ${offices.count} offices that didn't come from the API.`);
      return;
    }
    let run;
    if (args.includes('--sync')) run = await locations.sync('manual');
    else if (args.includes('--rebuild')) run = await locations.rebuild('manual');
    else {
      const file = args.find((a) => !a.startsWith('--'));
      if (!file) throw new Error('Give a saved branch list (branches.json), or --sync, --rebuild or --remove-old.');
      run = await locations.importRows(JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')));
    }
    const r: any = run.report;
    console.log(`${run.status}: ${run.message}`);
    console.log(`Rows: ${r.apiRows} from the API, ${r.usedRows} used; left out: ${r.skipped.noProgramme} without a programme, ` +
      `${r.skipped.test.length} test records, ${r.skipped.notBranch.length} offices that aren't branches, ` +
      `${Object.values(r.skipped.divisions as Record<string, number>).reduce((s, n) => s + n, 0)} in ${Object.keys(r.skipped.divisions).join(', ') || 'no'} divisions.`);
    console.log(`Programmes: ${r.programmes.join(', ')}. Look-alike spellings to check in the admin console: ${r.suggestions.length}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err?.getResponse?.()?.error || err.message || err);
  process.exitCode = 1;
});
