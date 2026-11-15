const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin' && context.electronPlatformName !== 'mas') return;
  // Build outputs copied through macOS Documents/iCloud can inherit Finder
  // metadata. Apple rejects those resource forks during code signing.
  const bundle = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  // Installed app contents belong to root; ordinary users must still be able to read them.
  // Preserve executable bits and limit this change to the packaged app, never signing keys.
  execFileSync('/bin/chmod', ['-R', 'a+rX', bundle], { stdio: 'pipe' });
  execFileSync('/usr/bin/xattr', ['-cr', bundle], { stdio: 'pipe' });
};
