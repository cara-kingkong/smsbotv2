<template>
  <div v-if="message" class="setup-notification">
    <div class="flex items-center gap-3">
      <div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-100">
        <svg class="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <span class="text-sm text-slate-700">{{ message }}</span>
      <a v-if="actionHref" :href="actionHref" class="ml-auto shrink-0 text-sm font-semibold text-slate-900 hover:underline">{{ actionLabel }}</a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const props = defineProps<{
  context: 'campaigns' | 'agents' | 'conversations' | 'dashboard';
}>();

const message = ref('');
const actionHref = ref('');
const actionLabel = ref('');

onMounted(() => {
  const state = (window as any).__KONG_ONBOARDING__;
  if (!state || state.isActivated) return;

  if (props.context === 'campaigns' && !state.hasCampaign) {
    // No message needed — empty state handles it
    return;
  }

  if (props.context === 'campaigns' && state.hasCampaign && !state.hasAgent) {
    message.value = 'Next step: add an AI agent to your campaign.';
    actionHref.value = '/agents';
    actionLabel.value = 'Add agent';
    return;
  }

  if (props.context === 'agents' && !state.hasCampaign) {
    message.value = 'Create a campaign first, then add agents to it.';
    actionHref.value = '/campaigns';
    actionLabel.value = 'Create campaign';
    return;
  }

  if (props.context === 'agents' && state.hasAgent && !state.hasSmsProvider) {
    message.value = 'Agent ready. Connect your phone number to start receiving SMS.';
    actionHref.value = '/settings';
    actionLabel.value = 'Connect Twilio';
    return;
  }

  if (props.context === 'conversations') {
    if (!state.isActivated) {
      message.value = 'Complete setup to start receiving conversations.';
      actionHref.value = '/dashboard';
      actionLabel.value = 'View setup';
      return;
    }
  }
});
</script>
