import { z } from 'zod';

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
export const MAX_FILES = 10;

const ALLOWED_GIF_HOSTS = ['tenor.com', 'media.tenor.com', 'giphy.com', 'media.giphy.com'];

export const StagedFileSchema = z.object({
    file: z.instanceof(File),
    id: z.string().min(1),
    preview: z.string().optional(),
});

export type StagedFile = z.infer<typeof StagedFileSchema>;

export const UploadingFileSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    size: z.number().nonnegative(),
    progress: z.number().min(0).max(100),
    status: z.enum(['preparing', 'encrypting', 'uploading', 'finishing']),
    preview: z.string().optional(),
});

export type UploadingFile = z.infer<typeof UploadingFileSchema>;

export const MessageSendSchema = z
    .object({
        content: z.string().max(MAX_MESSAGE_LENGTH, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`),
        files: z.array(StagedFileSchema).max(MAX_FILES, `Cannot attach more than ${MAX_FILES} files`),
    })
    .refine((d) => d.content.trim().length > 0 || d.files.length > 0, {
        message: 'Message must have content or at least one file',
        path: ['content'],
    });

export type MessageSendPayload = z.infer<typeof MessageSendSchema>;

export const FileAddSchema = z.instanceof(File).superRefine((f, ctx) => {
    if (f.size > MAX_FILE_SIZE) {
        ctx.addIssue({
            code: 'custom',
            message: `${f.name} (${formatFileSize(f.size)}) exceeds the 100 MB limit`,
        });
    }
});

export const GifUrlSchema = z
    .string()
    .url()
    .refine((url) => url.startsWith('https://'), { message: 'GIF URL must use HTTPS' })
    .refine(
        (url) => {
            try {
                const host = new URL(url).hostname;
                return ALLOWED_GIF_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
            } catch {
                return false;
            }
        },
        { message: 'GIF URL must be from an allowed provider (Tenor or Giphy)' },
    );

export const MentionValueSchema = z
    .string()
    .regex(/^\w+$/, 'Mention must only contain word characters')
    .max(255, 'Mention username is too long');

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
