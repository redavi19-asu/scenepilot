import { hasStudioAccess } from "../shared/subscriptionAccess.js";

// Production binaries are private R2 objects; never hand out publicly hosted installer URLs.
export const RELEASE_FILES = Object.freeze({
  windows: {key:"private/windows/Urban-Director-Studio-Windows-x64.exe",filename:"Urban-Director-Studio-Windows-x64.exe"},
  macArm: {key:"private/macos/Urban-Director-Studio-macOS-Apple-Silicon.dmg",filename:"Urban-Director-Studio-macOS-Apple-Silicon.dmg"},
  macIntel: {key:"private/macos/Urban-Director-Studio-macOS-Intel.dmg",filename:"Urban-Director-Studio-macOS-Intel.dmg"},
  android: {key:"private/android/Urban-Director-Studio-Android.apk",filename:"Urban-Director-Studio-Android.apk"}
});
export function releaseObjectForPlatform(user, platform) {
  const item = Object.hasOwn(RELEASE_FILES, platform) ? RELEASE_FILES[platform] : null;
  if(!item)return {status:404};
  if(!user)return {status:401};
  if(!hasStudioAccess(user))return {status:403};
  return {status:200,...item};
}
export async function releaseListingForUser(env,user) {
  const available={};
  for(const [platform,file] of Object.entries(RELEASE_FILES)){
    available[platform]=Boolean(env.DIRECTOR_INSTALLERS && await env.DIRECTOR_INSTALLERS.head(file.key));
  }
  return {
    available,
    ...Object.fromEntries(Object.keys(RELEASE_FILES).map(platform=>[
      platform,hasStudioAccess(user)&&available[platform]?`/api/downloads/${platform}`:""
    ]))
  };
}
