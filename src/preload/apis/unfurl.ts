import { ipcRenderer } from 'electron';

export interface LinkPreviewMetadata {
    url: string;
    title: string;
    description?: string;
    site_name?: string;
    image_url?: string;
}

export type UnfurlResponse =
    | {
          status: 'ok';
          metadata: LinkPreviewMetadata;
          imageBytes?: Uint8Array;
          imageMime?: string;
          imageWidth?: number;
          imageHeight?: number;
      }
    | {
          status: 'failed' | 'blocked';
          error: string;
      };

export const unfurlApi = {
    fetch: (url: string) => ipcRenderer.invoke('unfurl:fetch', url) as Promise<UnfurlResponse>,
};
