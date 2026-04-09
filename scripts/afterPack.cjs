const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const arch = context.arch === 1 ? 'x64' : 'arm64';
  const appDir = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', 'sharp');

  // Only rebuild if sharp was unpacked
  try {
    require('fs').accessSync(appDir);
  } catch {
    console.log('sharp not found in unpacked modules, skipping rebuild');
    return;
  }

  console.log(`Rebuilding sharp for ${platform}-${arch}...`);

  execSync(
    `npm rebuild --platform=${platform} --arch=${arch} sharp`,
    {
      cwd: context.appOutDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_platform: platform,
        npm_config_arch: arch,
      },
    }
  );
};
