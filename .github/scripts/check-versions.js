/*
  Tool version verification for CI

  Purpose:
  - Ensure the running Node.js and pnpm versions meet or exceed the required
    minimum versions provided via environment variables.

  Why a script (instead of `node -e`):
  - Improves readability/maintainability and allows comments and clearer errors.

  Usage:
    REQUIRED_NODE=18.20.7 REQUIRED_PNPM=9.15.5 node .github/scripts/check-versions.js
*/

const { execSync } = require('node:child_process');

function parseVersion(v) {
  return String(v)
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number(n) || 0);
}

function gte(a, b) {
  const aa = parseVersion(a);
  const bb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const d = (aa[i] || 0) - (bb[i] || 0);
    if (d > 0) return true;
    if (d < 0) return false;
  }
  return true;
}

function check(name, current, required) {
  if (!required) return;
  if (!gte(current, required)) {
    console.error(`${name} ${current} < ${required}`);
    process.exitCode = 1;
  } else {
    console.log(`${name} ${current} >= ${required}`);
  }
}

try {
  const nodeCurrent = process.versions.node; // e.g. 20.16.0
  const pnpmCurrent = execSync('pnpm -v').toString().trim();

  const requiredNode = process.env.REQUIRED_NODE || '';
  const requiredPnpm = process.env.REQUIRED_PNPM || '';

  console.log(`Node: ${nodeCurrent} | pnpm: ${pnpmCurrent}`);
  check('Node', nodeCurrent, requiredNode);
  check('pnpm', pnpmCurrent, requiredPnpm);
} catch (err) {
  console.error('Failed to determine tool versions:', err?.message || err);
  process.exitCode = 1;
}
