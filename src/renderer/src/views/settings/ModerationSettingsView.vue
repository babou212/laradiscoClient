<!-- ModerationSettingsView - Ban and jail management -->

<script setup lang="ts">
import { getLocalTimeZone, today, type DateValue } from '@internationalized/date';
import { useQuery, useMutation, useQueryCache } from '@pinia/colada';
import { format } from 'date-fns';
import { Ban, CalendarIcon, ChevronLeft, ChevronRight, Lock, Search, ShieldAlert, Unlock } from 'lucide-vue-next';
import {
    DatePickerAnchor,
    DatePickerCalendar,
    DatePickerCell,
    DatePickerCellTrigger,
    DatePickerContent,
    DatePickerGrid,
    DatePickerGridBody,
    DatePickerGridHead,
    DatePickerGridRow,
    DatePickerHeadCell,
    DatePickerHeader,
    DatePickerHeading,
    DatePickerNext,
    DatePickerPrev,
    DatePickerRoot,
    DatePickerTrigger,
} from 'reka-ui';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getApiErrorMessage } from '@/api/errors';
import { banUser, unbanUser, jailUser, unjailUser, getSettingsMembers } from '@/api/settings';
import type { BanData } from '@/api/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { currentDateFnsLocale } from '@/i18n';
import { SETTINGS_KEYS } from '@/queries/keys';
import { settingsBansQuery } from '@/queries/settings/moderation';

const { t } = useI18n();
const queryCache = useQueryCache();

// ─── Bans ──────────────────────────────────────────────────────────────────

const { data: bansData, isLoading: bansLoading, error: bansError } = useQuery(settingsBansQuery);

const bansErrorMsg = computed(() => {
    if (bansError.value) return getApiErrorMessage(bansError.value);
    return '';
});

const activeBans = computed<BanData[]>(() => {
    return bansData.value?.data ?? [];
});

// ─── Members (for ban/jail actions) ────────────────────────────────────────

const { data: membersData } = useQuery({
    key: SETTINGS_KEYS.members(),
    query: () => getSettingsMembers(),
});

type SimpleMember = { id: string; name: string; username: string; display_name: string };

const members = computed<SimpleMember[]>(() => {
    if (!membersData.value?.data) return [];
    return membersData.value.data.map((res) => ({
        id: res.id,
        name: res.attributes.name ?? '',
        username: res.attributes.username,
        display_name: res.attributes.display_name ?? res.attributes.name ?? res.attributes.username,
    }));
});

const memberSearch = ref('');
const filteredMembers = computed(() => {
    if (!memberSearch.value) return members.value;
    const q = memberSearch.value.toLowerCase();
    return members.value.filter((m) => m.username.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
});

// ─── Ban dialog ────────────────────────────────────────────────────────────

const showBanDialog = ref(false);
const selectedMember = ref<SimpleMember | null>(null);
const banReason = ref('');
const banExpiry = ref<DateValue | undefined>();
const actionError = ref('');
const minDate = today(getLocalTimeZone());

const { mutateAsync: doBan, isLoading: banning } = useMutation({
    mutation: (params: { userId: string; reason?: string; expires_at?: string }) =>
        banUser(params.userId, { reason: params.reason, expires_at: params.expires_at }),
    onSuccess: () => {
        queryCache.invalidateQueries({ key: SETTINGS_KEYS.bans() });
        queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() });
    },
});

const { mutateAsync: doUnban, isLoading: unbanning } = useMutation({
    mutation: (userId: string) => unbanUser(userId),
    onSuccess: () => {
        queryCache.invalidateQueries({ key: SETTINGS_KEYS.bans() });
        queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() });
    },
});

function openBanDialog(member: SimpleMember) {
    selectedMember.value = member;
    banReason.value = '';
    banExpiry.value = undefined;
    actionError.value = '';
    showBanDialog.value = true;
}

function formatExpiryForApi(date: DateValue | undefined): string | undefined {
    if (!date) return undefined;
    // Convert DateValue to ISO string (end of selected day in local timezone)
    const jsDate = date.toDate(getLocalTimeZone());
    jsDate.setHours(23, 59, 59);
    return jsDate.toISOString();
}

async function confirmBan() {
    if (!selectedMember.value) return;
    actionError.value = '';
    try {
        await doBan({
            userId: selectedMember.value.id,
            reason: banReason.value || undefined,
            expires_at: formatExpiryForApi(banExpiry.value),
        });
        showBanDialog.value = false;
        selectedMember.value = null;
    } catch (err: unknown) {
        actionError.value = getApiErrorMessage(err);
    }
}

async function handleUnban(ban: BanData) {
    actionError.value = '';
    try {
        await doUnban(String(ban.user_id));
    } catch (err: unknown) {
        actionError.value = getApiErrorMessage(err);
    }
}

// ─── Jail / Unjail ─────────────────────────────────────────────────────────

const showJailDialog = ref(false);
const jailTarget = ref<SimpleMember | null>(null);

const { mutateAsync: doJail, isLoading: jailing } = useMutation({
    mutation: (userId: string) => jailUser(userId),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() }),
});

const { isLoading: unjailing } = useMutation({
    mutation: (userId: string) => unjailUser(userId),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() }),
});

function openJailDialog(member: SimpleMember) {
    jailTarget.value = member;
    actionError.value = '';
    showJailDialog.value = true;
}

async function confirmJail() {
    if (!jailTarget.value) return;
    actionError.value = '';
    try {
        await doJail(jailTarget.value.id);
        showJailDialog.value = false;
        jailTarget.value = null;
    } catch (err: unknown) {
        actionError.value = getApiErrorMessage(err);
    }
}

function formatDate(dateStr: string): string {
    return format(new Date(dateStr), 'PP p', { locale: currentDateFnsLocale.value });
}
</script>

<template>
    <div class="space-y-6">
        <!-- Active Bans -->
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.moderation.bans.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.moderation.bans.description') }}
                </p>
            </div>

            <div class="p-6">
                <div
                    v-if="bansErrorMsg"
                    class="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-md border px-4 py-3 text-sm"
                >
                    {{ bansErrorMsg }}
                </div>

                <div v-if="bansLoading" class="text-muted-foreground text-sm">
                    {{ t('settings.moderation.bans.loading') }}
                </div>

                <div
                    v-else-if="activeBans.length === 0"
                    class="flex flex-col items-center justify-center py-8 text-center"
                >
                    <div class="border-border bg-muted mb-3 rounded-full border p-3">
                        <ShieldAlert class="text-muted-foreground h-6 w-6" />
                    </div>
                    <p class="text-sm font-medium">{{ t('settings.moderation.bans.emptyTitle') }}</p>
                    <p class="text-muted-foreground mt-1 text-sm">
                        {{ t('settings.moderation.bans.emptyDescription') }}
                    </p>
                </div>

                <div v-else class="space-y-2">
                    <div
                        v-for="ban in activeBans"
                        :key="ban.id"
                        class="border-border bg-background flex items-center justify-between gap-4 rounded-lg border p-4"
                    >
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2">
                                <span class="text-sm font-medium">{{ ban.user.name }}</span>
                                <span class="text-muted-foreground text-xs">@{{ ban.user.username }}</span>
                                <Badge variant="destructive" class="text-xs">{{
                                    t('settings.moderation.bans.bannedBadge')
                                }}</Badge>
                            </div>
                            <div class="text-muted-foreground mt-1 text-xs">
                                <span v-if="ban.reason">{{
                                    t('settings.moderation.bans.reasonLabel', { reason: ban.reason })
                                }}</span>
                                <span v-else>{{ t('settings.moderation.bans.noReason') }}</span>
                                <span class="mx-1">&middot;</span>
                                <span>{{
                                    t('settings.moderation.bans.byUser', { user: ban.banned_by_user.username })
                                }}</span>
                                <span v-if="ban.expires_at" class="mx-1">&middot;</span>
                                <span v-if="ban.expires_at">{{
                                    t('settings.moderation.bans.expires', { date: formatDate(ban.expires_at) })
                                }}</span>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" :disabled="unbanning" @click="handleUnban(ban)">
                            <Unlock class="mr-1.5 h-3.5 w-3.5" />
                            {{ t('settings.moderation.bans.unban') }}
                        </Button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Member Actions -->
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.moderation.actions.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.moderation.actions.description') }}
                </p>
            </div>

            <div class="p-6">
                <div
                    v-if="actionError"
                    class="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-md border px-4 py-3 text-sm"
                >
                    {{ actionError }}
                </div>

                <div class="relative mb-4">
                    <Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                        v-model="memberSearch"
                        :placeholder="t('settings.moderation.actions.searchPlaceholder')"
                        class="pl-9"
                    />
                </div>

                <div v-if="filteredMembers.length === 0" class="text-muted-foreground py-4 text-center text-sm">
                    {{ t('settings.moderation.actions.empty') }}
                </div>

                <div v-else class="space-y-2">
                    <div
                        v-for="member in filteredMembers"
                        :key="member.id"
                        class="border-border bg-background flex items-center justify-between gap-4 rounded-lg border p-4"
                    >
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2">
                                <span class="truncate text-sm font-medium">{{ member.display_name }}</span>
                                <span class="text-muted-foreground text-xs">@{{ member.username }}</span>
                            </div>
                        </div>

                        <div class="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                :disabled="jailing || unjailing"
                                @click="openJailDialog(member)"
                            >
                                <Lock class="mr-1.5 h-3.5 w-3.5" />
                                {{ t('settings.moderation.actions.jail') }}
                            </Button>
                            <Button variant="destructive" size="sm" :disabled="banning" @click="openBanDialog(member)">
                                <Ban class="mr-1.5 h-3.5 w-3.5" />
                                {{ t('settings.moderation.actions.ban') }}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Ban Dialog -->
        <Dialog v-model:open="showBanDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.moderation.banDialog.title') }}</DialogTitle>
                    <DialogDescription>
                        {{
                            t('settings.moderation.banDialog.description', {
                                name: selectedMember?.display_name ?? '',
                            })
                        }}
                    </DialogDescription>
                </DialogHeader>

                <div
                    v-if="actionError"
                    class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
                >
                    {{ actionError }}
                </div>

                <div class="space-y-4">
                    <div class="space-y-2">
                        <Label for="ban-reason">{{ t('settings.moderation.banDialog.reason') }}</Label>
                        <Input
                            id="ban-reason"
                            v-model="banReason"
                            :placeholder="t('settings.moderation.banDialog.reasonPlaceholder')"
                        />
                    </div>
                    <div class="space-y-2">
                        <Label>{{ t('settings.moderation.banDialog.expires') }}</Label>
                        <DatePickerRoot v-model="banExpiry" :min-value="minDate">
                            <DatePickerAnchor>
                                <DatePickerTrigger
                                    class="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-xs"
                                >
                                    <CalendarIcon class="size-4 opacity-50" />
                                    <span v-if="banExpiry">{{ banExpiry.toString() }}</span>
                                    <span v-else class="text-muted-foreground">{{
                                        t('settings.moderation.banDialog.pickDate')
                                    }}</span>
                                </DatePickerTrigger>

                                <DatePickerContent
                                    :side-offset="8"
                                    class="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 rounded-md border p-3 shadow-md"
                                >
                                    <DatePickerCalendar v-slot="{ weekDays, grid }">
                                        <DatePickerHeader class="flex items-center justify-between pb-2">
                                            <DatePickerPrev
                                                class="hover:bg-accent hover:text-accent-foreground inline-flex size-7 items-center justify-center rounded-md"
                                            >
                                                <ChevronLeft class="size-4" />
                                            </DatePickerPrev>
                                            <DatePickerHeading class="text-sm font-medium" />
                                            <DatePickerNext
                                                class="hover:bg-accent hover:text-accent-foreground inline-flex size-7 items-center justify-center rounded-md"
                                            >
                                                <ChevronRight class="size-4" />
                                            </DatePickerNext>
                                        </DatePickerHeader>

                                        <DatePickerGrid
                                            v-for="month in grid"
                                            :key="month.value.toString()"
                                            class="w-full border-collapse"
                                        >
                                            <DatePickerGridHead>
                                                <DatePickerGridRow class="flex">
                                                    <DatePickerHeadCell
                                                        v-for="day in weekDays"
                                                        :key="day"
                                                        class="text-muted-foreground w-8 text-center text-xs font-normal"
                                                    >
                                                        {{ day }}
                                                    </DatePickerHeadCell>
                                                </DatePickerGridRow>
                                            </DatePickerGridHead>
                                            <DatePickerGridBody>
                                                <DatePickerGridRow
                                                    v-for="(weekDates, index) in month.rows"
                                                    :key="`weekDate-${index}`"
                                                    class="flex"
                                                >
                                                    <DatePickerCell
                                                        v-for="weekDate in weekDates"
                                                        :key="weekDate.toString()"
                                                        :date="weekDate"
                                                        class="relative p-0"
                                                    >
                                                        <DatePickerCellTrigger
                                                            :day="weekDate"
                                                            :month="month.value"
                                                            class="hover:bg-accent hover:text-accent-foreground data-[outside-month]:text-muted-foreground/50 data-[selected]:bg-primary data-[selected]:text-primary-foreground inline-flex size-8 items-center justify-center rounded-md text-sm data-[disabled]:pointer-events-none data-[disabled]:opacity-30 data-[selected]:font-medium data-[today]:font-semibold"
                                                        />
                                                    </DatePickerCell>
                                                </DatePickerGridRow>
                                            </DatePickerGridBody>
                                        </DatePickerGrid>
                                    </DatePickerCalendar>
                                </DatePickerContent>
                            </DatePickerAnchor>
                        </DatePickerRoot>
                        <p class="text-muted-foreground text-xs">
                            {{ t('settings.moderation.banDialog.permanentHint') }}
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" @click="showBanDialog = false">{{
                        t('settings.common.cancel')
                    }}</Button>
                    <Button variant="destructive" :disabled="banning" @click="confirmBan">{{
                        t('settings.moderation.banDialog.submit')
                    }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Jail Dialog -->
        <Dialog v-model:open="showJailDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.moderation.jailDialog.title') }}</DialogTitle>
                    <DialogDescription>
                        {{
                            t('settings.moderation.jailDialog.description', {
                                name: jailTarget?.display_name ?? '',
                            })
                        }}
                    </DialogDescription>
                </DialogHeader>

                <div
                    v-if="actionError"
                    class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
                >
                    {{ actionError }}
                </div>

                <DialogFooter>
                    <Button variant="outline" @click="showJailDialog = false">{{
                        t('settings.common.cancel')
                    }}</Button>
                    <Button variant="destructive" :disabled="jailing" @click="confirmJail">{{
                        t('settings.moderation.jailDialog.submit')
                    }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
