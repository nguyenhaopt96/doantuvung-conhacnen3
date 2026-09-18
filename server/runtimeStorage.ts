import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

let writableBase: string | null = null;

function candidateBases(): string[] {
  const configured = [
    process.env.PANDA_RUNTIME_DIR,
    process.env.PANDASTACK_DATA_DIR,
    process.env.APP_DATA_DIR,
    process.env.DATA_DIR,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set([
    ...configured,
    path.join(os.tmpdir(), 'panda-render-wbn'),
    path.join('/var/tmp', 'panda-render-wbn'),
  ]));
}

function findWritableBase(): string {
  if (writableBase) return writableBase;

  const failures: string[] = [];
  for (const candidate of candidateBases()) {
    const resolved = path.resolve(candidate);
    const probe = path.join(resolved, `.write-test-${crypto.randomUUID()}`);
    try {
      fs.mkdirSync(resolved, { recursive: true });
      fs.writeFileSync(probe, 'ok', { flag: 'wx' });
      fs.rmSync(probe, { force: true });
      writableBase = resolved;
      console.log(`Runtime storage directory: ${resolved}`);
      return resolved;
    } catch (error: any) {
      try {
        fs.rmSync(probe, { force: true });
      } catch {
        // Ignore cleanup errors while probing a read-only path.
      }
      failures.push(`${resolved}: ${error?.code || error?.message || 'không ghi được'}`);
    }
  }

  throw new Error(`Máy chủ không có thư mục tạm ghi được (${failures.join(' · ')}).`);
}

export function runtimeStoragePath(namespace: string): string {
  const destination = path.join(findWritableBase(), namespace);
  fs.mkdirSync(destination, { recursive: true });
  return destination;
}
