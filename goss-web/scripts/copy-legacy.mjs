import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputRoot = resolve(projectRoot, 'dist');
const legacyPaths = [
  'admin',
  'admindashboard',
  'assets',
  'login',
  'shared',
  'staff',
  'student',
];

await mkdir(outputRoot, { recursive: true });

for (const path of legacyPaths) {
  await cp(resolve(projectRoot, path), resolve(outputRoot, path), {
    recursive: true,
    force: true,
  });
}
