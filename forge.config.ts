import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerAppImage } from '@reforged/maker-appimage';
import MakerPacman from './maker-pacman';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

const config: ForgeConfig = {
    outDir: 'dist',
    packagerConfig: {
        appBundleId: 'com.laradisco.client',
        name: 'LaraDisco',
        executableName: 'laradisco-client',
        asar: {
            unpack: '**/{sharp,@img}/**',
        },
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
        new MakerAppImage({
            options: {
                categories: ['Network'],
            },
        }),
        new MakerPacman({
            pkgname: 'laradisco-client',
            description: 'LaraDisco Desktop Client',
            homepage: 'https://github.com/babou212/laradiscoClient',
            categories: ['Network'],
        }),
    ],
    plugins: [
        new AutoUnpackNativesPlugin({}),
    ],
};

export default config;
