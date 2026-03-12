#!/usr/bin/env node

/**
 * Generates app icons (build/icons/) from build/icon.png.
 * If build/icon.png doesn't exist, creates a placeholder from scratch.
 *
 * Requires: electron-icon-builder (devDependency)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const buildDir = path.join(ROOT, 'build');
const pngPath = path.join(buildDir, 'icon.png');

// electron-icon-builder expects a PNG input
if (!fs.existsSync(pngPath)) {
  console.log('build/icon.png not found — create a 1024x1024 PNG icon and place it at build/icon.png');
  console.log('Then re-run: npm run icons');
  process.exit(1);
}

try {
  console.log('Generating icons from', pngPath);
  execSync(
    `npx electron-icon-builder --flatten --input="${pngPath}" --output="${buildDir}"`,
    { cwd: ROOT, stdio: 'inherit' }
  );
  console.log('Icons generated in', buildDir);
} catch (err) {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
}
