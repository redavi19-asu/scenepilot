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
  // Use the checksums shipped in the integrity-locked Electron npm package.
  // This keeps archive verification enabled when GitHub's checksum URL is unavailable.
  electronDist: async ({version, platformName, arch}) => {
    const electronPackage = require('electron/package.json');
    if (electronPackage.version !== version) throw new Error('Electron checksum version mismatch');
    const {downloadArtifact} = await import('@electron/get');
    const releaseResponse = await fetch(`https://api.github.com/repos/electron/electron/releases/tags/v${version}`, {headers:{'User-Agent':'Urban-Director-Studio-build'}});
    if (!releaseResponse.ok) throw new Error('Official Electron release lookup failed');
    const release = await releaseResponse.json();
    const asset = release.assets.find(item => item.name === `electron-v${version}-${platformName}-${arch}.zip`);
    if (!asset || !/^https:\/\/api\.github\.com\/repos\/electron\/electron\/releases\/assets\/\d+$/.test(asset.url)) throw new Error('Official Electron archive not found');
    return downloadArtifact({version, platform: platformName, arch, artifactName: 'electron', checksums: require('electron/checksums.json'), mirrorOptions:{resolveAssetURL:async()=>asset.url}, downloadOptions:{headers:{Accept:'application/octet-stream'}}});
  },
  buildVersion: buildNumber,
  extraFiles: [...(build.extraFiles || []), { from: 'ios/App/App/PrivacyInfo.xcprivacy', to: 'Resources/PrivacyInfo.xcprivacy' }],
  directories: { ...build.directories, output: 'release/mas' },
  mac: { ...build.mac, icon: 'public/urban-director-icon.icns', notarize: false },
  mas: { ...sandbox, type: 'distribution' },
  masDev: { ...sandbox, type: 'development' },
  forceCodeSigning: true
};
