import { backupDatabase } from './backup-lib.mjs';

const backupDir = process.argv[2] ?? process.env.BACKUP_DIR ?? './backups';
const sourcePath = process.env.DATABASE_PATH ?? './.data/goodz.db';
const keep = Number(process.env.BACKUP_KEEP ?? 14);

try {
  const result = await backupDatabase({ sourcePath, backupDir, keep });
  console.log(
    JSON.stringify(
      {
        ok: true,
        ...result,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
}
