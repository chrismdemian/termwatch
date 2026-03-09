/**
 * VMP signing hook for electron-builder.
 *
 * Castlabs EVS (Electron Verification Service) signs the app package so that
 * the Widevine CDM accepts license requests in production builds.
 *
 * Timing matters:
 *   - macOS: VMP-sign BEFORE Apple code-signing  → runs in "afterPack"
 *   - Windows: VMP-sign AFTER Windows code-signing → runs in "afterSign"
 *
 * This script is referenced by BOTH afterPack and afterSign in electron-builder.yml.
 * It checks the platform and hook phase, only signing at the correct time.
 *
 * Prerequisites:
 *   pip install castlabs-evs
 *   python3 -m castlabs_evs.account signup   (first time)
 *   python3 -m castlabs_evs.account reauth   (subsequent)
 */

const { execSync } = require('child_process');

exports.default = async function (context) {
  const platform = context.electronPlatformName;

  // Determine which hook called us:
  // afterPack context has `targets` array, afterSign does not
  const isAfterPack = Array.isArray(context.targets);
  const isAfterSign = !isAfterPack;
  const phase = isAfterPack ? 'afterPack' : 'afterSign';

  // macOS: only sign in afterPack (before Apple code-signing)
  if (platform === 'darwin' && !isAfterPack) {
    console.log(`VMP signing: skipped (macOS only signs in afterPack, currently in ${phase})`);
    return;
  }
  // Windows: only sign in afterSign (after Windows code-signing)
  if (platform === 'win32' && !isAfterSign) {
    console.log(`VMP signing: skipped (Windows only signs in afterSign, currently in ${phase})`);
    return;
  }
  // Linux: skip — limited VMP support
  if (platform === 'linux') {
    console.log('VMP signing: skipped (Linux has limited VMP support)');
    return;
  }

  const appOutDir = context.appOutDir;
  // Windows uses `python` or `py -3`, macOS/Linux use `python3`
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  console.log(`VMP signing (${platform}, ${phase}): ${appOutDir}`);

  try {
    execSync(`${pythonCmd} -m castlabs_evs.vmp sign-pkg "${appOutDir}"`, {
      stdio: 'inherit',
    });
    console.log('VMP signing: success');
  } catch (error) {
    console.error('VMP signing failed:', error.message);
    console.error(
      'Make sure castlabs-evs is installed: pip install castlabs-evs'
    );
    console.error(
      `And you are authenticated: ${pythonCmd} -m castlabs_evs.account reauth`
    );
    throw error;
  }
};
