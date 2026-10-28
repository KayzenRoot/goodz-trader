export interface BackupVerification {
  integrity: string;
  trades: number;
  orders: number;
  equity: number;
}

export interface BackupResult extends BackupVerification {
  path: string;
  bytes: number;
  pruned: number;
}

export interface RestoreResult extends BackupVerification {
  path: string;
}

export function backupDatabase(options: {
  sourcePath: string;
  backupDir: string;
  keep?: number;
  now?: Date;
}): Promise<BackupResult>;

export function restoreDatabase(options: { backupPath: string; targetPath: string }): RestoreResult;
