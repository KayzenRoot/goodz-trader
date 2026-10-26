import { existsSync, rmSync } from 'node:fs';

import { loadEnv } from '../env';

const env = loadEnv();
for (const suffix of ['', '-wal', '-shm']) {
  const file = `${env.DATABASE_PATH}${suffix}`;
  if (existsSync(file)) {
    rmSync(file, { force: true });
    console.warn(`Removido ${file}`);
  }
}
console.warn('Banco removido. O próximo start recria o schema e opcionalmente os dados demo.');
