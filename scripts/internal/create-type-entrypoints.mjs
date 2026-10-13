#!/usr/bin/env node

import { access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const name of ['', 'replay']) {
  const typesDirectory = resolve('dist/types', name);
  await access(resolve(typesDirectory, 'index.d.ts'));
  const declarationFacade = "export * from './index.js';\n";
  await Promise.all([
    writeFile(resolve(typesDirectory, 'index.d.mts'), declarationFacade, 'utf8'),
    writeFile(resolve(typesDirectory, 'index.d.cts'), declarationFacade, 'utf8'),
  ]);
}
console.log('Created ESM and CJS declaration entrypoints.');
