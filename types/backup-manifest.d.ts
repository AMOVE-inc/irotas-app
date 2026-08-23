declare module "../scripts/verify-backup-manifest.mjs" {
  export const REQUIRED_D1_TABLES: string[];
  export function verifyBackupManifest(manifest: unknown): {
    valid: boolean;
    errors: string[];
  };
}
