<script setup lang="ts">
import { config } from '@/common/config';
import FeedbackIcon from '@/components/common/icons/feedback-icon.vue';
import RedditIcon from '@/components/common/icons/reddit-icon.vue';
import FeedbackDialog from '@/components/dialogs/feedback-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { useLogout } from '@/composable/actions/logout';
import { useAvailableUpdate } from '@/composable/use-available-update';
import { useFeedbackAttention } from '@/composable/use-feedback-attention';
import { useSupportButton } from '@/composable/use-support-button';
import { ROUTES_NAMES } from '@/routes/constants';
import { useUserStore } from '@/stores';
import { EXTERNAL_URLS } from '@bt/shared/const/external-urls';
import {
  BookOpenIcon,
  CircleArrowUpIcon,
  ExternalLinkIcon,
  HeartIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const { user } = storeToRefs(useUserStore());
const logoutHandler = useLogout();
const isOpen = ref(false);
const availableUpdate = useAvailableUpdate();
const { isSupportButtonVisible, openSupport } = useSupportButton();
const { isPulsing: isFeedbackPulsing, onEnter: onFeedbackEnter, onClick: onFeedbackClick } = useFeedbackAttention();
const isFeedbackOpen = ref(false);

const openFeedback = () => {
  onFeedbackClick();
  isOpen.value = false;
  isFeedbackOpen.value = true;
};

const handleOpenSupport = () => {
  openSupport();
  isOpen.value = false;
};

// The menu is the one home for the profile, so the trigger names the user rather than showing an initial alone.
const displayName = computed(() => user.value?.username || user.value?.email || '');
const appRelease = __APP_RELEASE__;
const commitHash = __APP_VERSION__;
// Builds without git (no CI hash, no .git) fall back to a `dev-<timestamp>` id that isn't a commit.
const isRealCommit = /^[0-9a-f]{40}$/.test(commitHash);
</script>

<template>
  <Popover.Popover v-model:open="isOpen">
    <Popover.PopoverTrigger as-child>
      <button
        class="hover:bg-hover flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-1 transition-colors sm:px-2"
        :aria-label="displayName || t('navigation.accountDetails')"
      >
        <div
          :class="[
            'bg-primary/20 text-primary-text relative flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            { 'feedback-pulse': isFeedbackPulsing },
          ]"
        >
          {{ displayName.charAt(0).toUpperCase() || '?' }}
          <span
            v-if="availableUpdate"
            class="bg-primary ring-card absolute -top-px -right-px size-2.5 rounded-full ring-2"
          >
            <span class="sr-only">{{ t('navigation.updateAvailable') }}</span>
          </span>
        </div>
        <span class="max-w-32 truncate text-sm font-medium max-sm:hidden">{{ displayName }}</span>
      </button>
    </Popover.PopoverTrigger>
    <Popover.PopoverContent side="bottom" align="end" class="w-64 p-1">
      <div class="px-3 py-2">
        <div class="truncate text-sm font-medium">{{ displayName || 'User' }}</div>
        <div v-if="user?.email && user.email !== displayName" class="text-muted-foreground truncate text-xs">
          {{ user.email }}
        </div>
      </div>
      <div class="bg-border/50 mx-1 mb-1 h-px" />

      <router-link :to="{ name: ROUTES_NAMES.settings }" @click="isOpen = false">
        <UiButton variant="ghost" class="w-full justify-start gap-2 px-3" size="default">
          <SettingsIcon class="size-4" />
          <span>{{ t('header.settings') }}</span>
        </UiButton>
      </router-link>

      <router-link :to="{ name: ROUTES_NAMES.settingsSecurity }" @click="isOpen = false">
        <UiButton variant="ghost" class="w-full justify-start gap-2 px-3" size="default">
          <UserIcon class="size-4" />
          <span>{{ t('navigation.accountDetails') }}</span>
        </UiButton>
      </router-link>

      <UiButton
        v-if="isSupportButtonVisible"
        variant="ghost"
        class="w-full justify-start gap-2 px-3"
        size="default"
        @click="handleOpenSupport"
      >
        <HeartIcon class="text-heart size-4 fill-current" />
        <span>{{ t('header.support') }}</span>
        <ExternalLinkIcon class="text-muted-foreground ml-auto size-3" />
      </UiButton>

      <UiButton
        variant="ghost"
        class="w-full justify-start gap-2 px-3"
        size="default"
        @mouseenter="onFeedbackEnter"
        @click="openFeedback"
      >
        <FeedbackIcon class="text-primary-text size-4" />
        <span>{{ t('header.feedback') }}</span>
      </UiButton>

      <a :href="config.docsUrl" target="_blank" rel="noopener noreferrer" @click="isOpen = false">
        <UiButton variant="ghost" class="w-full justify-start gap-2 px-3" size="default">
          <BookOpenIcon class="size-4" />
          <span>{{ t('navigation.helpAndDocs') }}</span>
          <ExternalLinkIcon class="text-muted-foreground ml-auto size-3" />
        </UiButton>
      </a>

      <a :href="EXTERNAL_URLS.redditCommunity" target="_blank" rel="noopener noreferrer" @click="isOpen = false">
        <UiButton variant="ghost" class="w-full justify-start gap-2 px-3" size="default">
          <RedditIcon class="size-4" />
          <span>{{ t('navigation.community') }}</span>
          <ExternalLinkIcon class="text-muted-foreground ml-auto size-3" />
        </UiButton>
      </a>

      <a
        v-if="availableUpdate"
        :href="availableUpdate.url"
        target="_blank"
        rel="noopener noreferrer"
        @click="isOpen = false"
      >
        <UiButton variant="ghost-primary" class="w-full justify-start gap-2 px-3" size="default">
          <CircleArrowUpIcon class="size-4" />
          <span>{{ t('navigation.updateAvailable') }}</span>
          <span class="ml-auto font-mono text-xs">{{ availableUpdate.version }}</span>
        </UiButton>
      </a>

      <UiButton
        variant="ghost-destructive"
        class="w-full justify-start gap-2 px-3"
        size="default"
        @click="
          logoutHandler();
          isOpen = false;
        "
      >
        <LogOutIcon class="size-4" />
        <span>{{ t('navigation.logout') }}</span>
      </UiButton>

      <template v-if="config.isSelfHost">
        <div class="bg-border/50 mx-1 my-1 h-px" />
        <div class="flex items-center justify-between gap-2 px-3 py-2 text-xs">
          <i18n-t keypath="navigation.appVersion" tag="span" class="text-muted-foreground truncate">
            <template #version>
              <span class="text-foreground font-medium">{{ appRelease }}</span>
            </template>
          </i18n-t>
          <a
            v-if="availableUpdate"
            :href="availableUpdate.url"
            target="_blank"
            rel="noopener noreferrer"
            class="bg-primary/15 text-primary-text hover:bg-primary/25 flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-semibold transition-colors"
          >
            <CircleArrowUpIcon class="size-3" />
            {{ t('navigation.updateToVersion', { version: availableUpdate.version }) }}
          </a>
          <a
            v-else-if="isRealCommit"
            :href="`https://github.com/letehaha/moneymatter/commit/${commitHash}`"
            target="_blank"
            rel="noopener noreferrer"
            class="bg-muted hover:bg-accent text-foreground flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono transition-colors"
          >
            {{ commitHash.slice(0, 7) }}
            <ExternalLinkIcon class="size-3" />
          </a>
        </div>
      </template>
    </Popover.PopoverContent>
  </Popover.Popover>

  <!-- Outside the popover: closing the menu would unmount a dialog rendered inside it. -->
  <FeedbackDialog v-model:open="isFeedbackOpen" />
</template>
