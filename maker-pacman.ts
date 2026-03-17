import MakerBase, { type MakerOptions } from '@electron-forge/maker-base';
import type { ForgePlatform } from '@electron-forge/shared-types';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

interface MakerPacmanConfig {
    pkgname?: string;
    description?: string;
    homepage?: string;
    license?: string;
    depends?: string[];
    categories?: string[];
}

export default class MakerPacman extends MakerBase<MakerPacmanConfig> {
    name = 'pacman';
    defaultPlatforms: ForgePlatform[] = ['linux'];

    isSupportedOnCurrentPlatform(): boolean {
        try {
            execSync('which makepkg', { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }

    async make({
        dir,
        makeDir,
        targetArch,
        packageJSON,
    }: MakerOptions): Promise<string[]> {
        const pkgname = this.config.pkgname ?? packageJSON.name.replace(/^@.*\//, '');
        const version = packageJSON.version.replace(/-/g, '_');
        const description = this.config.description ?? packageJSON.description ?? '';
        const homepage = this.config.homepage ?? packageJSON.homepage ?? '';
        const license = this.config.license ?? packageJSON.license ?? 'MIT';
        const depends = this.config.depends ?? [
            'gtk3',
            'nss',
            'alsa-lib',
            'libxss',
            'libxtst',
        ];

        const archMap: Record<string, string> = {
            x64: 'x86_64',
            arm64: 'aarch64',
            armv7l: 'armv7h',
        };
        const pkgArch = archMap[targetArch] ?? targetArch;
        const executableName = this.config.pkgname ?? packageJSON.name.replace(/^@.*\//, '');

        const buildDir = path.join(makeDir, 'pacman-build');
        fs.mkdirSync(buildDir, { recursive: true });

        const categories = this.config.categories ?? ['Network'];
        const desktopEntry = `[Desktop Entry]
Name=${pkgname}
Exec=/opt/${pkgname}/${executableName}
Icon=${pkgname}
Type=Application
Categories=${categories.join(';')};
`;

        fs.writeFileSync(path.join(buildDir, `${pkgname}.desktop`), desktopEntry);

        const pkgbuild = `# Maintainer: auto-generated
pkgname=${pkgname}
pkgver=${version}
pkgrel=1
pkgdesc="${description}"
arch=('${pkgArch}')
url="${homepage}"
license=('${license}')
depends=(${depends.map((d) => `'${d}'`).join(' ')})

package() {
    install -dm755 "\${pkgdir}/opt/${pkgname}"
    cp -r "${dir}/." "\${pkgdir}/opt/${pkgname}/"

    install -Dm644 "${buildDir}/${pkgname}.desktop" "\${pkgdir}/usr/share/applications/${pkgname}.desktop"

    install -dm755 "\${pkgdir}/usr/bin"
    ln -s "/opt/${pkgname}/${executableName}" "\${pkgdir}/usr/bin/${executableName}"
}
`;

        fs.writeFileSync(path.join(buildDir, 'PKGBUILD'), pkgbuild);

        execSync('makepkg -f --nodeps', {
            cwd: buildDir,
            stdio: 'inherit',
        });

        const pkgFile = fs
            .readdirSync(buildDir)
            .find((f) => f.endsWith('.pkg.tar.zst'));

        if (!pkgFile) {
            throw new Error('makepkg did not produce a .pkg.tar.zst file');
        }

        const outDir = path.resolve(makeDir, 'pacman', pkgArch);
        fs.mkdirSync(outDir, { recursive: true });

        const finalPath = path.join(outDir, pkgFile);
        fs.renameSync(path.join(buildDir, pkgFile), finalPath);

        return [finalPath];
    }
}
