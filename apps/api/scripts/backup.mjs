import { backupDatabase } from './backup-lib.mjs';
import { runCli } from './cli.mjs';

await runCli(() =>
  backupDatabase({
    sourcePath: process.env.DATABASE_PATH ?? './.data/goodz.db',
    backupDir: process.env.BACKUP_DIR ?? './backups',
    keep: Number(process.env.BACKUP_KEEP ?? 14),
  }),
);
