import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerFlatpak } from '@electron-forge/maker-flatpak';
import { MakerAppImage } from '@reforged/maker-appimage';
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
            authors: 'LaraDisco',
        }),
        new MakerZIP({}, ['darwin', 'win32']),
        new MakerDMG({
            name: 'LaraDisco',
        }),
        new MakerDeb({
            options: {
                maintainer: 'LaraDisco',
                homepage: 'https://github.com/babou212/laradiscoClient',
                section: 'net',
                categories: ['Network'],
            },
        }),
        new MakerRpm({
            options: {
                homepage: 'https://github.com/babou212/laradiscoClient',
                categories: ['Network'],
            },
        }),
        new MakerFlatpak({
            options: {
                id: 'com.laradisco.client',
                categories: ['Network'],
                runtimeVersion: '24.08',
            },
        }),
        new MakerAppImage({
            options: {
                categories: ['Network'],
            },
        }),
    ],
    plugins: [
        new AutoUnpackNativesPlugin({}),
    ],
};

export default config;
