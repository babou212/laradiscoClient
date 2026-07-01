<script setup lang="ts">
import { useClipboard, useEventListener } from '@vueuse/core';
import {
    AtSign,
    Ban,
    Code2,
    Copy,
    CornerDownRight,
    Download,
    ExternalLink,
    Hash,
    ImageIcon,
    Link2,
    Lock,
    MessageSquare,
    MessageSquareText,
    Pencil,
    Pin,
    PinOff,
    Plus,
    Reply,
    Scissors,
    Shield,
    SmilePlus,
    SquareDashedMousePointer,
    Trash2,
    UserRound,
    UserX,
    Volume2,
} from 'lucide-vue-next';
import { useQuery } from '@pinia/colada';
import { computed, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { findIncluded, relationshipIds } from '@/api/types';
import type { RoleResource } from '@/api/types';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { settingsMembersQuery } from '@/queries/settings/members';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';

const { t } = useI18n();
const authStore = useAuthStore();
const chatStore = useChatStore();

const permissions = computed(() => authStore.user?.permissions);
const canKickMembers = computed(() => !!permissions.value?.canKickMembers || !!permissions.value?.isAdministrator);
const canBanMembers = computed(() => !!permissions.value?.canBanMembers || !!permissions.value?.isAdministrator);
const canJailMembers = computed(() => canKickMembers.value || canBanMembers.value);
const canManageRoles = computed(() => !!permissions.value?.canManageRoles || !!permissions.value?.isAdministrator);
const canManageChannels = computed(
    () => !!permissions.value?.canManageChannels || !!permissions.value?.isAdministrator,
);

// 'text' | 'voice' | 'both' — derived from the channels already in the category
const categoryChannelType = computed(() => {
    if (!categoryCtx.value) return 'both';
    const cat = chatStore.categories.find((c) => c.id === categoryCtx.value!.categoryId);
    if (!cat || cat.channels.length === 0) return 'both';
    const hasVoice = cat.channels.some((c) => c.type === 'voice');
    const hasText = cat.channels.some((c) => c.type !== 'voice');
    if (hasVoice && !hasText) return 'voice';
    if (hasText && !hasVoice) return 'text';
    return 'both';
});

type EditableEl = HTMLInputElement | HTMLTextAreaElement;

interface MessageContext {
    type: 'message';
    el: HTMLElement;
    id: string;
    content: string;
    link: string;
    canReact: boolean;
    canReply: boolean;
    canThread: boolean;
    canPin: boolean;
    canEdit: boolean;
    canDelete: boolean;
    isPinned: boolean;
}

interface InputContext {
    type: 'input';
    el: EditableEl;
    hasSelection: boolean;
    isReadonly: boolean;
}

interface UsernameContext {
    type: 'username';
    el: HTMLElement;
    userId: string;
    username: string;
}

interface CategoryContext {
    type: 'category';
    el: HTMLElement;
    categoryId: string;
}

interface ChannelContext {
    type: 'channel';
    el: HTMLElement;
    channelId: string;
    categoryId: string;
    channelType: string;
}

interface LinkContext {
    type: 'link';
    href: string;
}

interface ImageContext {
    type: 'image';
    src: string;
    alt: string;
}

interface GenericContext {
    type: 'generic';
    hasSelection: boolean;
}

type MenuContext =
    | MessageContext
    | InputContext
    | UsernameContext
    | CategoryContext
    | ChannelContext
    | LinkContext
    | ImageContext
    | GenericContext;

const context = shallowRef<MenuContext | null>(null);

const { copy } = useClipboard({ legacy: true });

const CODE_LANGUAGES: ReadonlyArray<{ id: string; label: string }> = [
    { id: '', label: '' },
    { id: 'js', label: 'JavaScript' },
    { id: 'ts', label: 'TypeScript' },
    { id: 'jsx', label: 'JSX' },
    { id: 'tsx', label: 'TSX' },
    { id: 'vue', label: 'Vue' },
    { id: 'html', label: 'HTML' },
    { id: 'css', label: 'CSS' },
    { id: 'json', label: 'JSON' },
    { id: 'yaml', label: 'YAML' },
    { id: 'md', label: 'Markdown' },
    { id: 'sh', label: 'Shell / Bash' },
    { id: 'sql', label: 'SQL' },
    { id: 'py', label: 'Python' },
    { id: 'rb', label: 'Ruby' },
    { id: 'php', label: 'PHP' },
    { id: 'go', label: 'Go' },
    { id: 'rs', label: 'Rust' },
    { id: 'java', label: 'Java' },
    { id: 'kt', label: 'Kotlin' },
    { id: 'swift', label: 'Swift' },
    { id: 'c', label: 'C' },
    { id: 'cpp', label: 'C++' },
    { id: 'cs', label: 'C#' },
    { id: 'dart', label: 'Dart' },
    { id: 'lua', label: 'Lua' },
    { id: 'r', label: 'R' },
];

const codeLanguageLabel = (lang: { id: string; label: string }): string =>
    lang.id === '' ? t('appContextMenu.plainText') : lang.label;

const messageCtx = computed(() => (context.value?.type === 'message' ? context.value : null));
const inputCtx = computed(() => (context.value?.type === 'input' ? context.value : null));
const usernameCtx = computed(() => (context.value?.type === 'username' ? context.value : null));
const categoryCtx = computed(() => (context.value?.type === 'category' ? context.value : null));
const channelCtx = computed(() => (context.value?.type === 'channel' ? context.value : null));
const linkCtx = computed(() => (context.value?.type === 'link' ? context.value : null));
const imageCtx = computed(() => (context.value?.type === 'image' ? context.value : null));
const genericCtx = computed(() => (context.value?.type === 'generic' ? context.value : null));

const showMenu = computed(() => {
    if (!context.value) return false;
    if (context.value.type === 'generic' && !context.value.hasSelection) return false;
    return true;
});

function isEditable(el: Element | null): el is EditableEl {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
        const editableTypes = ['text', 'search', 'url', 'email', 'password', 'tel', 'number', ''];
        return editableTypes.includes(el.type);
    }
    return false;
}

function buildContext(target: HTMLElement): MenuContext {
    // Priority: input > username > image > link > message > generic
    const inputEl = target.closest<HTMLElement>('input, textarea');
    if (isEditable(inputEl)) {
        const hasSelection =
            typeof inputEl.selectionStart === 'number' &&
            typeof inputEl.selectionEnd === 'number' &&
            inputEl.selectionStart !== inputEl.selectionEnd;
        return {
            type: 'input',
            el: inputEl,
            hasSelection,
            isReadonly: inputEl.readOnly || inputEl.disabled,
        };
    }

    const usernameEl = target.closest<HTMLElement>('[data-context-username]');
    if (usernameEl && usernameEl.dataset.userId) {
        return {
            type: 'username',
            el: usernameEl,
            userId: usernameEl.dataset.userId,
            username: usernameEl.dataset.username ?? '',
        };
    }

    // Only intercept as a channel/category context when the user can actually
    // manage channels — otherwise fall through so e.g. text selection still works.
    const channelEl = target.closest<HTMLElement>('[data-context-channel]');
    if (
        channelEl &&
        channelEl.dataset.channelId &&
        channelEl.dataset.categoryId &&
        channelEl.dataset.channelType &&
        canManageChannels.value
    ) {
        return {
            type: 'channel',
            el: channelEl,
            channelId: channelEl.dataset.channelId,
            categoryId: channelEl.dataset.categoryId,
            channelType: channelEl.dataset.channelType,
        };
    }

    const categoryEl = target.closest<HTMLElement>('[data-context-category]');
    if (categoryEl && categoryEl.dataset.categoryId && canManageChannels.value) {
        return {
            type: 'category',
            el: categoryEl,
            categoryId: categoryEl.dataset.categoryId,
        };
    }

    const imageEl = target.closest<HTMLImageElement>('img');
    if (imageEl && imageEl.src) {
        return {
            type: 'image',
            src: imageEl.src,
            alt: imageEl.alt ?? '',
        };
    }

    const linkEl = target.closest<HTMLAnchorElement>('a[href]');
    if (linkEl) {
        return { type: 'link', href: linkEl.href };
    }

    const messageEl = target.closest<HTMLElement>('[data-context-message]');
    if (messageEl && messageEl.dataset.messageId) {
        return {
            type: 'message',
            el: messageEl,
            id: messageEl.dataset.messageId,
            content: messageEl.dataset.messageContent ?? '',
            link: messageEl.dataset.messageLink ?? '',
            canReact: messageEl.dataset.canReact === 'true',
            canReply: messageEl.dataset.canReply === 'true',
            canThread: messageEl.dataset.canThread === 'true',
            canPin: messageEl.dataset.canPin === 'true',
            canEdit: messageEl.dataset.canEdit === 'true',
            canDelete: messageEl.dataset.canDelete === 'true',
            isPinned: messageEl.dataset.isPinned === 'true',
        };
    }

    const selection = window.getSelection();
    const hasSelection = !!selection && selection.toString().length > 0;
    return { type: 'generic', hasSelection };
}

function handleContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Allow opt-out by setting data-no-context-menu on an ancestor.
    if (target.closest('[data-no-context-menu]')) {
        context.value = null;
        return;
    }

    const ctx = buildContext(target);
    context.value = ctx;

    if (ctx.type === 'generic' && !ctx.hasSelection) {
        // Suppress both reka-ui and the browser default menu by preventing default
        // before reka-ui's bubble-phase handler runs.
        e.preventDefault();
    }
}

useEventListener(document, 'contextmenu', handleContextMenu, { capture: true });

function selectionWithinMessage(el: HTMLElement): string {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return '';
    const text = selection.toString();
    if (!text) return '';

    for (let i = 0; i < selection.rangeCount; i++) {
        if (el.contains(selection.getRangeAt(i).commonAncestorContainer)) {
            return text;
        }
    }
    return '';
}

async function copyMessageText() {
    const ctx = messageCtx.value;
    if (!ctx) return;
    const highlighted = selectionWithinMessage(ctx.el);
    await copy(highlighted || ctx.content);
}

function dispatchMessageAction(action: string, detail?: Record<string, unknown>) {
    const ctx = messageCtx.value;
    if (!ctx) return;
    const el = ctx.el;

    setTimeout(() => {
        el.dispatchEvent(
            new CustomEvent('chat-action', {
                detail: { action, ...detail },
                bubbles: false,
            }),
        );
    }, 0);
}

async function inputCut() {
    const ctx = inputCtx.value;
    if (!ctx) return;
    const { el } = ctx;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) return;
    const selected = el.value.slice(start, end);
    await copy(selected);
    el.setRangeText('', start, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
}

async function inputCopy() {
    const ctx = inputCtx.value;
    if (!ctx) return;
    const { el } = ctx;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) return;
    await copy(el.value.slice(start, end));
}

async function readClipboardText(): Promise<string> {
    try {
        const electronClipboard = window.api?.clipboard;
        if (electronClipboard) {
            const text = await electronClipboard.readText();
            if (text) return text;
        }
    } catch {
        // ignore and fall through
    }
    try {
        return (await navigator.clipboard.readText()) ?? '';
    } catch {
        return '';
    }
}

function insertTextIntoInput(el: EditableEl, text: string) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.setRangeText(text, start, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
}

async function inputPaste() {
    const ctx = inputCtx.value;
    if (!ctx) return;
    const { el } = ctx;

    const text = await readClipboardText();
    if (!text) return;

    insertTextIntoInput(el, text);

    setTimeout(() => el.focus(), 0);
}

async function inputPastePlain() {
    await inputPaste();
}

function inputSelectAll() {
    const ctx = inputCtx.value;
    if (!ctx) return;
    ctx.el.focus();
    ctx.el.select();
}

function inputWrapCodeBlock(language: string) {
    const ctx = inputCtx.value;
    if (!ctx) return;
    const { el } = ctx;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = el.value.slice(start, end);
    const fence = '```';
    const opening = `${fence}${language}\n`;
    const closing = `\n${fence}`;
    const replacement = `${opening}${selected}${closing}`;
    el.setRangeText(replacement, start, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    const newStart = start + opening.length;
    const newEnd = newStart + selected.length;
    el.setSelectionRange(newStart, newEnd);
}

async function genericCopy() {
    const text = window.getSelection()?.toString() ?? '';
    if (text) await copy(text);
}

function genericSelectAll() {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(document.body);
    sel.removeAllRanges();
    sel.addRange(range);
}

function linkOpen() {
    const ctx = linkCtx.value;
    if (!ctx) return;
    window.open(ctx.href, '_blank');
}

async function linkCopy() {
    const ctx = linkCtx.value;
    if (!ctx) return;
    await copy(ctx.href);
}

async function imageCopyUrl() {
    const ctx = imageCtx.value;
    if (!ctx) return;
    await copy(ctx.src);
}

async function imageCopy() {
    const ctx = imageCtx.value;
    if (!ctx) return;
    try {
        const response = await fetch(ctx.src);
        const blob = await response.blob();

        const item = new ClipboardItem({ [blob.type]: blob });
        await navigator.clipboard.write([item]);
    } catch {
        await imageCopyUrl();
    }
}

function imageSaveAs() {
    const ctx = imageCtx.value;
    if (!ctx) return;
    const a = document.createElement('a');
    a.href = ctx.src;
    a.download = ctx.alt || 'image';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function findActiveTextarea(): HTMLTextAreaElement | null {
    return document.querySelector<HTMLTextAreaElement>('textarea[data-message-input]');
}

function usernameMention() {
    const ctx = usernameCtx.value;
    if (!ctx || !ctx.username) return;
    const textarea = findActiveTextarea();
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const before = textarea.value.slice(0, start);
    const needsSpace = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
    const insertion = `${needsSpace ? ' ' : ''}@${ctx.username} `;
    textarea.setRangeText(insertion, start, end, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
}

function usernameProfile() {
    const ctx = usernameCtx.value;
    if (!ctx) return;
    const rect = ctx.el.getBoundingClientRect();
    document.dispatchEvent(
        new CustomEvent('chat-user-action', {
            detail: {
                action: 'view-profile',
                userId: ctx.userId,
                username: ctx.username,
                rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
            },
        }),
    );
}

function usernameDm() {
    const ctx = usernameCtx.value;
    if (!ctx) return;
    document.dispatchEvent(
        new CustomEvent('chat-user-action', {
            detail: { action: 'send-dm', userId: ctx.userId, username: ctx.username },
        }),
    );
}

const membersQueryEnabled = shallowRef(false);
// Trigger the fetch the first time an admin right-clicks a username; stays true after that.
watch(usernameCtx, (ctx) => {
    if (ctx && canJailMembers.value) membersQueryEnabled.value = true;
});
const { data: membersQueryData } = useQuery({ ...settingsMembersQuery, enabled: membersQueryEnabled });

const isTargetJailed = computed(() => {
    const ctx = usernameCtx.value;
    if (!ctx || !membersQueryData.value?.data) return false;
    const member = membersQueryData.value.data.find((m) => m.id === ctx.userId);
    if (!member) return false;
    const roleIds = relationshipIds(member.relationships?.roles);
    return roleIds.some((rid) => {
        const role = findIncluded<RoleResource>(membersQueryData.value!.included, 'roles', rid);
        return role?.attributes.name === 'Jailed';
    });
});

const showUsernameAdminActions = computed(() => {
    const ctx = usernameCtx.value;
    if (!ctx || ctx.userId === authStore.user?.id) return false;
    return canKickMembers.value || canBanMembers.value || canJailMembers.value || canManageRoles.value;
});

function dispatchUserAdminAction(action: 'kick' | 'ban' | 'jail' | 'release' | 'manage-roles') {
    const ctx = usernameCtx.value;
    if (!ctx) return;
    setTimeout(() => {
        document.dispatchEvent(
            new CustomEvent('chat-user-action', {
                detail: { action, userId: ctx.userId, username: ctx.username },
            }),
        );
    }, 0);
}

function dispatchCreateChannel(categoryId: string, channelType?: string) {
    setTimeout(() => {
        document.dispatchEvent(
            new CustomEvent('chat-channel-action', {
                detail: { action: 'create-channel', categoryId, channelType },
            }),
        );
    }, 0);
}

function dispatchEditChannel() {
    const ctx = channelCtx.value;
    if (!ctx) return;
    setTimeout(() => {
        document.dispatchEvent(
            new CustomEvent('chat-channel-action', {
                detail: { action: 'edit-channel', channelId: ctx.channelId },
            }),
        );
    }, 0);
}

function dispatchDeleteChannel() {
    const ctx = channelCtx.value;
    if (!ctx) return;
    setTimeout(() => {
        document.dispatchEvent(
            new CustomEvent('chat-channel-action', {
                detail: { action: 'delete-channel', channelId: ctx.channelId },
            }),
        );
    }, 0);
}
</script>

<template>
    <ContextMenu>
        <ContextMenuTrigger as="div" class="contents">
            <slot />
        </ContextMenuTrigger>
        <ContextMenuContent v-if="showMenu" class="w-56">
            <template v-if="messageCtx">
                <ContextMenuItem @select="copyMessageText">
                    <Copy /> {{ t('appContextMenu.copyText') }}
                </ContextMenuItem>

                <template v-if="messageCtx.canReact || messageCtx.canReply || messageCtx.canThread">
                    <ContextMenuSeparator />
                    <ContextMenuItem v-if="messageCtx.canReact" @select="dispatchMessageAction('react')">
                        <SmilePlus /> {{ t('appContextMenu.addReaction') }}
                    </ContextMenuItem>
                    <ContextMenuItem v-if="messageCtx.canReply" @select="dispatchMessageAction('reply')">
                        <Reply /> {{ t('appContextMenu.reply') }}
                    </ContextMenuItem>
                    <ContextMenuItem v-if="messageCtx.canThread" @select="dispatchMessageAction('thread')">
                        <MessageSquareText /> {{ t('appContextMenu.replyInThread') }}
                    </ContextMenuItem>
                </template>

                <template v-if="messageCtx.canPin || messageCtx.canEdit || messageCtx.canDelete">
                    <ContextMenuSeparator />
                    <ContextMenuItem v-if="messageCtx.canPin" @select="dispatchMessageAction('pin')">
                        <component :is="messageCtx.isPinned ? PinOff : Pin" />
                        {{ messageCtx.isPinned ? t('appContextMenu.unpinMessage') : t('appContextMenu.pinMessage') }}
                    </ContextMenuItem>
                    <ContextMenuItem v-if="messageCtx.canEdit" @select="dispatchMessageAction('edit')">
                        <Pencil /> {{ t('appContextMenu.editMessage') }}
                    </ContextMenuItem>
                    <ContextMenuItem
                        v-if="messageCtx.canDelete"
                        variant="destructive"
                        @select="dispatchMessageAction('delete')"
                    >
                        <Trash2 /> {{ t('appContextMenu.deleteMessage') }}
                    </ContextMenuItem>
                </template>
            </template>

            <template v-else-if="inputCtx">
                <ContextMenuItem :disabled="!inputCtx.hasSelection || inputCtx.isReadonly" @select="inputCut">
                    <Scissors /> {{ t('appContextMenu.cut') }}
                </ContextMenuItem>
                <ContextMenuItem :disabled="!inputCtx.hasSelection" @select="inputCopy">
                    <Copy /> {{ t('appContextMenu.copy') }}
                </ContextMenuItem>
                <ContextMenuItem :disabled="inputCtx.isReadonly" @select="inputPaste">
                    <CornerDownRight /> {{ t('appContextMenu.paste') }}
                </ContextMenuItem>
                <ContextMenuItem :disabled="inputCtx.isReadonly" @select="inputPastePlain">
                    <CornerDownRight /> {{ t('appContextMenu.pastePlain') }}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuSub>
                    <ContextMenuSubTrigger :disabled="inputCtx.isReadonly">
                        <Code2 /> {{ t('appContextMenu.wrapCodeBlock') }}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent class="max-h-80 w-44 overflow-y-auto">
                        <ContextMenuLabel>{{ t('appContextMenu.language') }}</ContextMenuLabel>
                        <ContextMenuItem
                            v-for="lang in CODE_LANGUAGES"
                            :key="lang.id || 'plain'"
                            @select="inputWrapCodeBlock(lang.id)"
                        >
                            {{ codeLanguageLabel(lang) }}
                        </ContextMenuItem>
                    </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem @select="inputSelectAll">
                    <SquareDashedMousePointer /> {{ t('appContextMenu.selectAll') }}
                </ContextMenuItem>
            </template>

            <template v-else-if="usernameCtx">
                <ContextMenuLabel>@{{ usernameCtx.username }}</ContextMenuLabel>
                <ContextMenuItem @select="usernameMention">
                    <AtSign /> {{ t('appContextMenu.mention') }}
                </ContextMenuItem>
                <ContextMenuItem @select="usernameProfile">
                    <UserRound /> {{ t('appContextMenu.viewProfile') }}
                </ContextMenuItem>
                <ContextMenuItem @select="usernameDm">
                    <MessageSquare /> {{ t('appContextMenu.sendMessage') }}
                </ContextMenuItem>

                <template v-if="showUsernameAdminActions">
                    <ContextMenuSeparator />
                    <ContextMenuItem v-if="canManageRoles" @select="dispatchUserAdminAction('manage-roles')">
                        <Shield /> {{ t('appContextMenu.manageRoles') }}
                    </ContextMenuItem>
                    <ContextMenuItem v-if="canJailMembers && !isTargetJailed" @select="dispatchUserAdminAction('jail')">
                        <Lock /> {{ t('appContextMenu.jail') }}
                    </ContextMenuItem>
                    <ContextMenuItem
                        v-if="canJailMembers && isTargetJailed"
                        @select="dispatchUserAdminAction('release')"
                    >
                        <Lock /> {{ t('appContextMenu.release') }}
                    </ContextMenuItem>
                    <ContextMenuItem
                        v-if="canKickMembers"
                        variant="destructive"
                        @select="dispatchUserAdminAction('kick')"
                    >
                        <UserX /> {{ t('appContextMenu.kick') }}
                    </ContextMenuItem>
                    <ContextMenuItem
                        v-if="canBanMembers"
                        variant="destructive"
                        @select="dispatchUserAdminAction('ban')"
                    >
                        <Ban /> {{ t('appContextMenu.ban') }}
                    </ContextMenuItem>
                </template>
            </template>

            <template v-else-if="categoryCtx">
                <ContextMenuItem
                    v-if="categoryChannelType !== 'voice'"
                    @select="dispatchCreateChannel(categoryCtx.categoryId, 'text')"
                >
                    <Hash /> {{ t('appContextMenu.createTextChannel') }}
                </ContextMenuItem>
                <ContextMenuItem
                    v-if="categoryChannelType !== 'text'"
                    @select="dispatchCreateChannel(categoryCtx.categoryId, 'voice')"
                >
                    <Volume2 /> {{ t('appContextMenu.createVoiceChannel') }}
                </ContextMenuItem>
            </template>

            <template v-else-if="channelCtx">
                <ContextMenuItem @select="dispatchEditChannel">
                    <Pencil /> {{ t('appContextMenu.editChannel') }}
                </ContextMenuItem>
                <ContextMenuItem variant="destructive" @select="dispatchDeleteChannel">
                    <Trash2 /> {{ t('appContextMenu.deleteChannel') }}
                </ContextMenuItem>
            </template>

            <template v-else-if="imageCtx">
                <ContextMenuItem @select="imageCopy">
                    <ImageIcon /> {{ t('appContextMenu.copyImage') }}
                </ContextMenuItem>
                <ContextMenuItem @select="imageCopyUrl">
                    <Link2 /> {{ t('appContextMenu.copyImageAddress') }}
                </ContextMenuItem>
                <ContextMenuItem @select="imageSaveAs">
                    <Download /> {{ t('appContextMenu.saveImageAs') }}
                </ContextMenuItem>
            </template>

            <template v-else-if="linkCtx">
                <ContextMenuItem @select="linkOpen">
                    <ExternalLink /> {{ t('appContextMenu.openLink') }}
                </ContextMenuItem>
                <ContextMenuItem @select="linkCopy"> <Link2 /> {{ t('appContextMenu.copyLink') }} </ContextMenuItem>
            </template>

            <template v-else-if="genericCtx?.hasSelection">
                <ContextMenuItem @select="genericCopy"> <Copy /> {{ t('appContextMenu.copy') }} </ContextMenuItem>
                <ContextMenuItem @select="genericSelectAll">
                    <SquareDashedMousePointer /> {{ t('appContextMenu.selectAll') }}
                </ContextMenuItem>
            </template>
        </ContextMenuContent>
    </ContextMenu>
</template>
