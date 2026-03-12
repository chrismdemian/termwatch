#!/usr/bin/env node

/**
 * Version bump helper.
 * Usage: node scripts/bump-version.js [patch|minor|major|<version>]
 */

const { execFileSync } = require('child_process');

const arg = process.argv[2];
const valid = ['patch', 'minor', 'major'];

if (!arg) {
  console.error('Usage: npm run version:bump -- <patch|minor|major|x.y.z>');
  process.exit(1);
}

// Validate: must be a known keyword or a semver-like string
if (!valid.includes(arg) && !/^\d+\.\d+\.\d+/.test(arg)) {
  console.error(`Invalid version argument: ${arg}`);
  console.error('Must be patch, minor, major, or a semver string (e.g., 1.2.3)');
  process.exit(1);
}

try {
  execFileSync('npm', ['version', arg, '--no-git-tag-version'], { stdio: 'inherit', shell: true });

  // Re-read package.json after version bump
  delete require.cache[require.resolve('../package.json')];
  const updated = require('../package.json');

  console.log(`\nVersion bumped to ${updated.version}`);
  console.log('Next steps:');
  console.log(`  git add package.json package-lock.json`);
  console.log(`  git commit -m "Bump version to ${updated.version}"`);
  console.log(`  git tag v${updated.version}`);
  console.log(`  git push origin master --tags`);
} catch (err) {
  console.error('Version bump failed:', err.message);
  process.exit(1);
}
