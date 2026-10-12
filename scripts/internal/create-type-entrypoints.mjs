#!/usr/bin/env node

import { access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const typesDirectory = resolve('dist/types');
for (const entry of ['index', 'lite']) {
  await access(resolve(typesDirectory, `${entry}.d.ts`));
  const declarationFacade = `export * from './${entry}.js';\n`;
  await Promise.all([
    writeFile(resolve(typesDirectory, `${entry}.d.mts`), declarationFacade, 'utf8'),
    writeFile(resolve(typesDirectory, `${entry}.d.cts`), declarationFacade, 'utf8'),
  ]);
}

console.log('Created ESM and CJS declaration entrypoints.');
