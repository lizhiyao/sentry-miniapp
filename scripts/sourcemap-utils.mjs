import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

export function readJsonFile(file) {
  return JSON.parse(readFileSync(resolve(file), 'utf8'));
}

export function normalizeName(name, strip = []) {
  let n = String(name).split('?')[0].split('#')[0].replace(/\\/g, '/');
  for (const p of strip) {
    const prefix = String(p).replace(/\\/g, '/');
    if (n.startsWith(prefix)) n = n.slice(prefix.length);
  }
  while (n.startsWith('./') || n.startsWith('/')) {
    n = n.startsWith('./') ? n.slice(2) : n.slice(1);
  }
  return n;
}

export function collectFiles(dir, predicate) {
  const root = resolve(dir);
  const found = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && predicate(full, entry)) found.push(full);
    }
  };
  walk(root);
  return found;
}

export function addBuildMapCandidate(index, key, hit) {
  if (!key) return;
  const existing = index.get(key);
  if (!existing) {
    index.set(key, [hit]);
    return;
  }
  if (!existing.some((item) => item.file === hit.file)) {
    existing.push(hit);
  }
}

export function pickBuildMapCandidate(index, key) {
  const hits = index.get(key);
  if (!hits) return { hit: null, ambiguous: null };
  if (hits.length === 1) return { hit: hits[0], ambiguous: null };
  return { hit: null, ambiguous: hits };
}

export function collectBuildMaps(dir) {
  const root = resolve(dir);
  const found = collectFiles(root, (file) => file.endsWith('.map'));
  const index = new Map();
  const invalidMaps = [];

  for (const file of found) {
    let raw;
    try {
      raw = readJsonFile(file);
    } catch (error) {
      invalidMaps.push({ file, error });
      continue;
    }

    const hit = { file, raw };
    const keys = new Set();
    if (raw.file) keys.add(normalizeName(raw.file, []));
    keys.add(normalizeName(relative(root, file).replace(/\.map$/, ''), []));
    keys.add(normalizeName(basename(file).replace(/\.map$/, ''), []));
    for (const k of keys) {
      addBuildMapCandidate(index, k, hit);
    }
  }

  return { index, fileCount: found.length, invalidMaps, files: found };
}

export function isWechatAppserviceName(name) {
  return /(^|\/)(appservice\.app|app-service|appservice)\.js$/i.test(normalizeName(name, []));
}
