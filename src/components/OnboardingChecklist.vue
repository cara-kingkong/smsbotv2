<template>
  <div v-if="!dismissed && !state.isActivated" class="onboarding-checklist">
    <div class="flex items-center justify-between mb-4">
      <div>
        <div class="page-kicker">Get Started</div>
        <h2 class="section-title mt-1">{{ state.completedSteps }} of 4 complete</h2>
      </div>
    </div>

    <div class="onboarding-progress-track">
      <div class="onboarding-progress-fill" :style="{ width: `${(state.completedSteps / 4) * 100}%` }"></div>
    </div>

    <div class="mt-5 space-y-2">
      <div v-for="step in steps" :key="step.id" class="onboarding-step" :class="{ 'onboarding-step-done': step.done, 'onboarding-step-current': step.current }">
        <div class="onboarding-step-indicator">
          <svg v-if="step.done" class="h-4 w-4 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
          <div v-else class="h-2.5 w-2.5 rounded-full" :class="step.current ? 'bg-slate-900' : 'bg-slate-300'"></div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold" :class="step.done ? 'text-slate-400 line-through' : 'text-slate-900'">{{ step.label }}</div>
          <div class="text-xs mt-0.5" :class="step.done ? 'text-slate-400' : 'text-slate-500'">{{ step.description }}</div>
        </div>
        <div v-if="step.current" class="shrink-0">
          <a :href="step.href" class="button-primary text-xs !px-3 !py-2">{{ step.cta }}</a>
        </div>
        <div v-else-if="step.done" class="shrink-0">
          <span class="badge bg-emerald-50 text-emerald-700">Done</span>
        </div>
        <div v-else class="shrink-0">
          <span class="text-xs text-slate-400">Waiting</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Completion banner -->
  <div v-else-if="!dismissed && state.isActivated && showCelebration" class="onboarding-complete">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100">
          <svg class="h-4 w-4 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
        </div>
        <div>
          <div class="text-sm font-semibold text-slate-900">Setup complete</div>
          <div class="text-xs text-slate-500">Your first campaign is live and ready to receive SMS.</div>
        </div>
      </div>
      <button class="text-xs font-semibold text-slate-400 hover:text-slate-600" @click="dismiss">Dismiss</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';

interface OnboardingState {
  hasCampaign: boolean;
  hasAgent: boolean;
  hasSmsProvider: boolean;
  hasCalendar: boolean;
  isActivated: boolean;
  currentStep: number;
  completedSteps: number;
}

const state = ref<OnboardingState>({
  hasCampaign: false,
  hasAgent: false,
  hasSmsProvider: false,
  hasCalendar: false,
  isActivated: false,
  currentStep: 1,
  completedSteps: 0,
});

const dismissed = ref(false);
const showCelebration = ref(false);

const steps = computed(() => {
  const s = state.value;
  const items = [
    { id: 1, label: 'Create a campaign', description: 'Name your first campaign to start routing conversations', href: '/campaigns', cta: 'Create campaign', done: s.hasCampaign, current: false },
    { id: 2, label: 'Add an AI agent', description: 'Tell your agent how to qualify leads and what to say', href: '/agents', cta: 'Add agent', done: s.hasAgent, current: false },
    { id: 3, label: 'Connect your phone number', description: 'Link your Twilio number so leads can text in', href: '/settings', cta: 'Connect Twilio', done: s.hasSmsProvider, current: false },
    { id: 4, label: 'Connect your calendar', description: 'Let your AI book meetings directly into Calendly', href: '/calendar', cta: 'Connect Calendly', done: s.hasCalendar, current: false },
  ];

  // Mark the first incomplete step as current
  const firstIncomplete = items.find(i => !i.done);
  if (firstIncomplete) firstIncomplete.current = true;

  return items;
});

function dismiss() {
  dismissed.value = true;
  try {
    localStorage.setItem('kong_onboarding_dismissed', 'true');
  } catch {}
}

onMounted(() => {
  const injected = (window as any).__KONG_ONBOARDING__;
  if (injected) {
    state.value = injected;
  }

  // Check if celebration was already dismissed
  try {
    if (localStorage.getItem('kong_onboarding_dismissed') === 'true') {
      dismissed.value = true;
    }
  } catch {}

  // Show celebration if just activated
  if (state.value.isActivated) {
    showCelebration.value = true;
  }
});
</script>
