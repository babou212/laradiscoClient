import { ipcRenderer } from 'electron';
import type { MlsKeyBackup } from '../types/mls';

export const mlsApi = {
    isSetup: (serverId: number, userId?: number) =>
        ipcRenderer.invoke('mls:isSetup', serverId, userId) as Promise<boolean>,
    getDeviceId: (serverId: number, userId?: number) =>
        ipcRenderer.invoke('mls:getDeviceId', serverId, userId) as Promise<string | null>,
    setup: (serverId: number, deviceName: string, userId?: number) =>
        ipcRenderer.invoke('mls:setup', serverId, deviceName, userId),
    setupDevice: (serverId: number, deviceName: string, userId?: number) =>
        ipcRenderer.invoke('mls:setupDevice', serverId, deviceName, userId),
    encrypt: (params: { serverId: number; groupId: string; plaintext: string }) =>
        ipcRenderer.invoke('mls:encrypt', params),
    decrypt: (params: { serverId: number; groupId: string; messageBytes: string }) =>
        ipcRenderer.invoke('mls:decrypt', params),
    createGroup: (params: { serverId: number; groupId: string }) => ipcRenderer.invoke('mls:createGroup', params),
    joinGroup: (params: { serverId: number; welcomeBytes: string; ratchetTreeBytes: string }) =>
        ipcRenderer.invoke('mls:joinGroup', params),
    addMember: (params: {
        serverId: number;
        groupId: string;
        keyPackageBytes: string;
        expectedUserId: number;
        expectedDeviceId: string;
    }) => ipcRenderer.invoke('mls:addMember', params),
    removeMember: (params: { serverId: number; groupId: string; leafIndices: number[] }) =>
        ipcRenderer.invoke('mls:removeMember', params),
    processMessage: (params: {
        serverId: number;
        groupId: string;
        messageBytes: string;
        allowedAddUserIds?: number[];
        allowedRemoveLeafIndices?: number[];
    }) => ipcRenderer.invoke('mls:processMessage', params),
    inspectKeyPackage: (params: { keyPackageBytes: string }) => ipcRenderer.invoke('mls:inspectKeyPackage', params),
    selfUpdate: (params: { serverId: number; groupId: string }) => ipcRenderer.invoke('mls:selfUpdate', params),
    mergeCommit: (params: { serverId: number; groupId: string }) => ipcRenderer.invoke('mls:mergeCommit', params),
    clearPendingCommit: (params: { serverId: number; groupId: string }) =>
        ipcRenderer.invoke('mls:clearPendingCommit', params),
    deleteGroup: (params: { serverId: number; groupId: string }) => ipcRenderer.invoke('mls:deleteGroup', params),
    generateKeyPackages: (serverId: number, count: number) =>
        ipcRenderer.invoke('mls:generateKeyPackages', serverId, count),
    getGroupInfo: (params: { serverId: number; groupId: string }) => ipcRenderer.invoke('mls:getGroupInfo', params),
    backupKeys: (serverId: number, pin: string) => ipcRenderer.invoke('mls:backupKeys', serverId, pin),
    restoreKeys: (serverId: number, backup: MlsKeyBackup, pin: string, userId?: number) =>
        ipcRenderer.invoke('mls:restoreKeys', serverId, backup, pin, userId),
    autoUpdateBackup: (serverId: number) => ipcRenderer.invoke('mls:autoUpdateBackup', serverId),
    hasBackupKey: (serverId: number) => ipcRenderer.invoke('mls:hasBackupKey', serverId) as Promise<boolean>,
    clearBackupKey: (serverId?: number) => ipcRenderer.invoke('mls:clearBackupKey', serverId),
    changePIN: (serverId: number, backup: MlsKeyBackup, oldPin: string, newPin: string) =>
        ipcRenderer.invoke('mls:changePIN', serverId, backup, oldPin, newPin),
    setE2eeDeviceKeys: (
        serverId: number,
        keys: {
            deviceIdentityKey: string;
            identitySignature: string;
            signedPreKeyId: number;
            signedPreKey: string;
            signedPreKeySignature: string;
        },
    ) => ipcRenderer.invoke('mls:setE2eeDeviceKeys', serverId, keys),
    isDirty: (serverId: number) => ipcRenderer.invoke('mls:isDirty', serverId) as Promise<boolean>,
    startAutoBackup: () => ipcRenderer.invoke('mls:startAutoBackup'),
    stopAutoBackup: () => ipcRenderer.invoke('mls:stopAutoBackup'),
    getLastBackupTimestamp: (serverId: number) =>
        ipcRenderer.invoke('mls:getLastBackupTimestamp', serverId) as Promise<number | null>,
    setLastBackupTimestamp: (serverId: number, timestamp: number) =>
        ipcRenderer.invoke('mls:setLastBackupTimestamp', serverId, timestamp),
    wipe: (serverId: number) => ipcRenderer.invoke('mls:wipe', serverId),
    wipeForUserMismatch: (serverId: number, userId: number) =>
        ipcRenderer.invoke('mls:wipeForUserMismatch', serverId, userId) as Promise<boolean>,
};
