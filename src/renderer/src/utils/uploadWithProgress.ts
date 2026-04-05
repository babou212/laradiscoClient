export function uploadWithProgress(
    url: string,
    body: Uint8Array,
    headers: Record<string, string>,
    onProgress: (progress: number) => void,
): Promise<{ ok: boolean; status: number }> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        const unsafeHeaders = new Set(['host', 'content-length', 'connection', 'user-agent']);
        for (const [key, value] of Object.entries(headers)) {
            if (!unsafeHeaders.has(key.toLowerCase())) {
                xhr.setRequestHeader(key, value);
            }
        }
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };
        xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(body as unknown as XMLHttpRequestBodyInit);
    });
}
