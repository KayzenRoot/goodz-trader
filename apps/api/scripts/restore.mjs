import { restoreDatabase } from './backup-lib.mjs';

const [backupPath, targetArg] = process.argv.slice(2);
if (!backupPath) {
  console.error(
    JSON.stringify({
      ok: false,
      error: 'Uso: node scripts/restore.mjs <backup.db> [destino.db]',
    }),
  );
  process.exit(1);
}

const targetPath = targetArg ?? process.env.DATABASE_PATH ?? './.data/goodz.db';

try {
  const result = restoreDatabase({ backupPath, targetPath });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
}
