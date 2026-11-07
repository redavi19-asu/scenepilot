const fs = require('node:fs');
const path = require('node:path');
const { build } = require('../package.json');

// A DMG/ZIP is not a Mac App Store submission. Require an explicit profile
// and a unique App Store build number before selecting Electron's MAS engine.
const profile = process.env.UDS_MAS_PROFILE;
const buildNumber = process.env.UDS_BUILD_NUMBER;
if (!profile || !path.isAbsolute(profile) || !fs.existsSync(profile)) {
  throw new Error('UDS_MAS_PROFILE must name an existing absolute Mac provisioning profile path. Use a development profile for mas-dev and a distribution profile for mas.');
}
if (!/^[1-9][0-9]*$/.test(buildNumber || '')) {
  throw new Error('UDS_BUILD_NUMBER must be a unique positive App Store build number.');
}
const sandbox = {
  provisioningProfile: profile,
  entitlements: 'electron/entitlements/mas.plist',
  entitlementsInherit: 'electron/entitlements/mas-inherit.plist',
  hardenedRuntime: false
};
module.exports = {
  ...build,
  buildVersion: buildNumber,
  directories: { ...build.directories, output: 'release/mas' },
  mac: { ...build.mac, notarize: false },
  mas: { ...sandbox, type: 'distribution' },
  masDev: { ...sandbox, type: 'development' },
  forceCodeSigning: true
};
