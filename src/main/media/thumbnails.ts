import sharp from 'sharp';

const THUMBNAIL_WIDTH = 300;
const THUMBNAIL_QUALITY = 80;

export interface ThumbnailResult {
    thumbnail: Buffer;
    width: number;
    height: number;
    format: string;
}

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

export function isImageMimeType(mimeType: string): boolean {
    return SUPPORTED_IMAGE_TYPES.has(mimeType);
}

export async function generateThumbnail(data: Buffer): Promise<ThumbnailResult> {
    const image = sharp(data);
    const metadata = await image.metadata();

    const resized = image.resize({
        width: THUMBNAIL_WIDTH,
        withoutEnlargement: true,
    });

    let output: sharp.Sharp;
    let format: string;

    if (metadata.format === 'gif') {
        output = resized.png();
        format = 'image/png';
    } else if (metadata.format === 'avif') {
        output = resized.avif({ quality: THUMBNAIL_QUALITY });
        format = 'image/avif';
    } else {
        output = resized.webp({ quality: THUMBNAIL_QUALITY });
        format = 'image/webp';
    }

    const thumbnail = await output.toBuffer();
    const thumbMeta = await sharp(thumbnail).metadata();

    return {
        thumbnail,
        width: thumbMeta.width ?? THUMBNAIL_WIDTH,
        height: thumbMeta.height ?? 0,
        format,
    };
}
