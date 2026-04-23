const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const arch = context.arch === 1 ? 'x64' : 'arm64';

  // Resolve the unpacked node_modules directory based on target platform
  let resourcesDir;
  if (platform === 'darwin') {
    const appName = context.packager.appInfo.productFilename;
    resourcesDir = path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Resources');
  } else {
    resourcesDir = path.join(context.appOutDir, 'resources');
  }

  const unpackedModules = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules');
  const sharpDir = path.join(unpackedModules, 'sharp');

  if (!fs.existsSync(sharpDir)) {
    console.log(`sharp not found at ${sharpDir}, skipping`);
    return;
  }

  // sharp uses prebuilt binaries from @img/sharp-<platform>-<arch>
  const nativePackage = `@img/sharp-${platform}-${arch}`;
  const nativeDir = path.join(unpackedModules, '@img', `sharp-${platform}-${arch}`);

  if (fs.existsSync(nativeDir)) {
    console.log(`${nativePackage} already present, skipping`);
    return;
  }

  console.log(`Installing ${nativePackage} into unpacked modules...`);

  // Install the platform-specific sharp binary into the unpacked node_modules.
  // --force bypasses the platform/arch check when cross-compiling (e.g. arm64 host → x64 target).
  execSync(
    `npm install --no-save --no-package-lock --force --os=${platform} --cpu=${arch} ${nativePackage}`,
    {
      cwd: unpackedModules,
      stdio: 'inherit',
    }
  );
};
