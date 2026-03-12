#!/usr/bin/env node

/**
 * Generates THIRD-PARTY-LICENSES.txt from production dependencies.
 * Zero-dependency script — uses only Node.js built-ins.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {});

const lines = [
  'THIRD-PARTY SOFTWARE LICENSES',
  '=============================',
  '',
  `This file lists the licenses of third-party packages used by ${pkg.name}.`,
  `Generated on ${new Date().toISOString().slice(0, 10)}.`,
  '',
];

for (const dep of deps.sort()) {
  // Resolve the dep's package.json (handles scoped packages)
  let depDir = path.join(ROOT, 'node_modules', dep);
  let depPkg;
  try {
    depPkg = JSON.parse(fs.readFileSync(path.join(depDir, 'package.json'), 'utf8'));
  } catch {
    lines.push(`## ${dep}`, '', 'Could not read package metadata.', '', '---', '');
    continue;
  }

  const name = depPkg.name || dep;
  const version = depPkg.version || 'unknown';
  const license = depPkg.license || 'Unknown';
  const author = typeof depPkg.author === 'string'
    ? depPkg.author
    : depPkg.author?.name || '';

  lines.push(`## ${name}@${version}`);
  lines.push('');
  lines.push(`License: ${license}`);
  if (author) lines.push(`Author: ${author}`);
  lines.push('');

  // Try to read LICENSE file
  const licenseNames = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md'];
  let licenseText = null;
  for (const lf of licenseNames) {
    try {
      licenseText = fs.readFileSync(path.join(depDir, lf), 'utf8').trim();
      break;
    } catch {
      // Try next
    }
  }

  if (licenseText) {
    lines.push(licenseText);
  } else {
    lines.push('(No LICENSE file found in package)');
  }

  lines.push('');
  lines.push('---');
  lines.push('');
}

const output = lines.join('\n');
const outPath = path.join(ROOT, 'THIRD-PARTY-LICENSES.txt');
fs.writeFileSync(outPath, output, 'utf8');

console.log(`Generated ${outPath} (${deps.length} dependencies)`);
