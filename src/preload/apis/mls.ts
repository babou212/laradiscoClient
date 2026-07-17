import { ipcRenderer } from 'electron';

export const mlsApi = {
    status: () => ipcRenderer.invoke('mls:status'),
    ensureSetup: (host: string, token: string) => ipcRenderer.invoke('mls:ensureSetup', host, token),
    establishDmGroup: (host: string, token: string, dmId: number) =>
        ipcRenderer.invoke('mls:establishDmGroup', host, token, dmId),
    syncDmGroup: (host: string, token: string, dmId: number) =>
        ipcRenderer.invoke('mls:syncDmGroup', host, token, dmId),
    reconcileAllDmGroups: (host: string, token: string) =>
        ipcRenderer.invoke('mls:reconcileAllDmGroups', host, token),
    localVerification: (peerUserId: number) => ipcRenderer.invoke('mls:localVerification', peerUserId),
    getRequireVerification: () => ipcRenderer.invoke('mls:getRequireVerification'),
    setRequireVerification: (on: boolean) => ipcRenderer.invoke('mls:setRequireVerification', on),
    encryptDm: (dmId: number, text: string) => ipcRenderer.invoke('mls:encryptDm', dmId, text),
    decryptDm: (dmId: number, messageId: string, messageBytesB64: string) =>
        ipcRenderer.invoke('mls:decryptDm', dmId, messageId, messageBytesB64),
    cacheDm: (dmId: number, messageId: string, plaintext: string) =>
        ipcRenderer.invoke('mls:cacheDm', dmId, messageId, plaintext),
    redecryptDm: (dmId: number, messageId: string, messageBytesB64: string) =>
        ipcRenderer.invoke('mls:redecryptDm', dmId, messageId, messageBytesB64),
    verificationStatus: (host: string, token: string, peerUserId: number) =>
        ipcRenderer.invoke('mls:verificationStatus', host, token, peerUserId),
    markVerified: (peerUserId: number) => ipcRenderer.invoke('mls:markVerified', peerUserId),
    newRecoveryCode: () => ipcRenderer.invoke('mls:newRecoveryCode'),
    backup: (host: string, token: string, recoveryCode: string) =>
        ipcRenderer.invoke('mls:backup', host, token, recoveryCode),
    restore: (host: string, token: string, recoveryCode: string) =>
        ipcRenderer.invoke('mls:restore', host, token, recoveryCode),
};
