import { cp, mkdir, writeFile } from 'node:fs/promises';
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

const compatibilityDirectory = resolve(outputRoot, 'goss-web');
await mkdir(compatibilityDirectory, { recursive: true });
await writeFile(
  resolve(compatibilityDirectory, 'index.html'),
  '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=../"><title>GOSS Guidance Office</title></head><body><p>Opening the <a href="../">GOSS Guidance Office website</a>...</p></body></html>\n',
);
