import { restoreDatabase } from './backup-lib.mjs';
import { runCli } from './cli.mjs';

await runCli(async () => {
  const backupPath = process.env.BACKUP_FILE;
  if (!backupPath) {
    throw new Error('Defina BACKUP_FILE com o caminho do backup a restaurar');
  }
  return restoreDatabase({
    backupPath,
    targetPath: process.env.DATABASE_PATH ?? './.data/goodz.db',
  });
});
