/**
 * Postinstall script — downloads Puppeteer's bundled Chromium only when
 * PUPPETEER_SKIP_DOWNLOAD is not set and no system Chrome is found.
 * Runs automatically after `npm install`.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const CHROME_PATHS = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/usr/lib/chromium-browser/chromium-browser',
];

function log(msg) {
  console.log(`[install-chromium] ${msg}`);
}

// Skip if explicitly told to
if (process.env.PUPPETEER_SKIP_DOWNLOAD === 'true') {
  log('PUPPETEER_SKIP_DOWNLOAD=true — skipping.');
  process.exit(0);
}

// Skip on Windows/macOS — Puppeteer bundles Chromium automatically there
if (process.platform !== 'linux') {
  log(`Platform is ${process.platform} — skipping (Puppeteer handles it).`);
  process.exit(0);
}

// Check if a system Chrome already exists
const systemChrome = CHROME_PATHS.find((p) => fs.existsSync(p));
if (systemChrome) {
  log(`System Chrome found at ${systemChrome} — skipping download.`);
  process.exit(0);
}

// Check if Puppeteer already has a bundled Chromium
try {
  const puppeteer = require('puppeteer');
  const execPath = puppeteer.executablePath?.();
  if (execPath && fs.existsSync(execPath)) {
    log(`Puppeteer Chromium already at ${execPath} — skipping.`);
    process.exit(0);
  }
} catch (_) {}

// Download Puppeteer's bundled Chromium
log('No Chromium found — downloading via Puppeteer...');
try {
  const result = spawnSync(
    'node',
    ['-e', "require('puppeteer').executablePath()"],
    { stdio: 'inherit', env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'false' } },
  );

  if (result.status !== 0) {
    // Fallback: run puppeteer install directly
    log('Trying puppeteer browsers install...');
    execSync('npx puppeteer browsers install chrome', { stdio: 'inherit' });
  }

  log('Chromium download complete.');
} catch (err) {
  log(`Warning: Could not download Chromium automatically: ${err.message}`);
  log('Please install Chrome manually: apt-get install -y chromium-browser');
  log('Then set PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser in your .env');
  // Don't exit with error — app can still start if Chrome is installed separately
}
