import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerFlatpak } from '@electron-forge/maker-flatpak';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

const config: ForgeConfig = {
    outDir: 'dist',
    packagerConfig: {
        appBundleId: 'com.laradisco.client',
        name: 'LaraDisco',
        executableName: 'laradisco-client',
        asar: true,
        ignore: [
            /^\/src($|\/)/,
            /^\/\.git($|\/)/,
            /^\/\.vscode($|\/)/,
            /^\/electron\.vite\.config/,
            /^\/tsconfig/,
            /^\/forge\.config/,
            /^\/eslint\.config/,
            /^\/components\.json$/,
        ],
    },
    makers: [
        new MakerSquirrel({
            name: 'LaraDisco',
        }),
        new MakerZIP({}, ['darwin', 'win32']),
        new MakerDMG({
            name: 'LaraDisco',
        }),
        new MakerFlatpak({
            options: {
                id: 'com.laradisco.client',
                categories: ['Network'],
                runtimeVersion: '24.08',
            },
        }),
    ],
    plugins: [
        new AutoUnpackNativesPlugin({}),
    ],
};

export default config;
