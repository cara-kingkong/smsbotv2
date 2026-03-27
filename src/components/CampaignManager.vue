<template>
  <div class="w-full" style="min-height: calc(100vh - 280px);">
    <!-- Action bar -->
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search campaigns..."
        class="input sm:max-w-xs"
        @input="debouncedSearch"
      />
      <button class="button-primary" @click="showCreateModal = true">
        Create Campaign
      </button>
    </div>

    <!-- Campaign list -->
    <div v-if="listLoading" class="empty-state">Loading campaigns...</div>
    <div v-else-if="filteredCampaigns.length === 0" class="empty-state">
      No campaigns found. Click "Create Campaign" to get started.
    </div>
    <div v-else class="space-y-3">
      <a
        v-for="campaign in filteredCampaigns"
        :key="campaign.id"
        :href="`/campaigns/${campaign.id}`"
        class="list-card block"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-sm font-bold text-teal-700">
                {{ campaign.name.charAt(0).toUpperCase() }}
              </div>
              <div class="min-w-0">
                <div class="text-sm font-semibold text-slate-900 truncate">{{ campaign.name }}</div>
                <div class="mt-0.5 text-xs text-slate-500">
                  {{ campaign.agent_count ?? 0 }} agent{{ (campaign.agent_count ?? 0) === 1 ? '' : 's' }}
                  &middot; Created {{ relativeTime(campaign.created_at) }}
                </div>
              </div>
            </div>
          </div>
          <span class="badge shrink-0" :class="statusClass(campaign.status)">{{ campaign.status }}</span>
        </div>
      </a>
    </div>

    <!-- Create Campaign Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal-panel">
        <div class="flex items-center justify-between border-b px-5 py-4" style="border-color: rgba(17,17,17,0.06);">
          <h2 class="section-title">Create Campaign</h2>
          <button class="text-slate-400 hover:text-slate-600 text-lg" @click="showCreateModal = false">&times;</button>
        </div>

        <form class="space-y-5 px-5 py-5" @submit.prevent="createCampaign">
          <div class="panel-muted">
            <label class="form-label">Campaign Name *</label>
            <input
              v-model="form.name"
              type="text"
              required
              placeholder="e.g. Spring Lead Gen"
              class="input"
            />
            <p class="form-help">Choose a name that is easy to identify in analytics and conversation routing.</p>
          </div>

          <fieldset class="panel-muted space-y-4">
            <legend class="form-label">Business Hours</legend>
            <label class="flex items-center gap-3 text-sm text-slate-700">
              <input
                v-model="form.useCustomHours"
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Override workspace defaults
            </label>
            <div v-if="!form.useCustomHours" class="note-box">
              Using workspace default business hours.
            </div>
            <template v-if="form.useCustomHours">
              <div>
                <label class="form-label">Timezone</label>
                <select v-model="form.timezone" class="select">
                  <option v-for="tz in timezoneOptions" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
                </select>
              </div>
              <div>
                <label class="form-label">Active Days</label>
                <div class="flex flex-wrap gap-3">
                  <label
                    v-for="(dayLabel, dayIndex) in dayLabels"
                    :key="dayIndex"
                    class="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      v-model="form.activeDays"
                      type="checkbox"
                      :value="dayIndex"
                      class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    {{ dayLabel }}
                  </label>
                </div>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="form-label">Start Time</label>
                  <select v-model="form.startTime" class="select">
                    <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">End Time</label>
                  <select v-model="form.endTime" class="select">
                    <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
                  </select>
                </div>
              </div>
            </template>
          </fieldset>

          <fieldset class="panel-muted space-y-4">
            <legend class="form-label">Stop Conditions</legend>
            <label class="flex items-center gap-3 text-sm text-slate-700">
              <input
                v-model="form.useCustomStopConditions"
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Override workspace defaults
            </label>
            <div v-if="!form.useCustomStopConditions" class="note-box">
              Using workspace default stop conditions.
            </div>
            <template v-if="form.useCustomStopConditions">
              <div class="grid gap-4 sm:grid-cols-3">
                <div>
                  <label class="form-label">Max Messages</label>
                  <input v-model.number="form.maxMessages" type="number" min="1" class="input" />
                </div>
                <div>
                  <label class="form-label">Max Days</label>
                  <input v-model.number="form.maxDays" type="number" min="1" class="input" />
                </div>
                <div>
                  <label class="form-label">Max No-Reply Hours</label>
                  <input v-model.number="form.maxNoReplyHours" type="number" min="1" class="input" />
                </div>
              </div>
            </template>
          </fieldset>

          <div v-if="formSuccess" class="feedback-success">{{ formSuccess }}</div>
          <div v-if="formError" class="feedback-error">{{ formError }}</div>

          <div class="flex gap-3">
            <button type="submit" :disabled="formLoading" class="button-primary">
              {{ formLoading ? 'Creating...' : 'Create Campaign' }}
            </button>
            <button type="button" class="button-secondary" @click="showCreateModal = false">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';
import { timezoneOptions } from '@lib/utils/timezones';

const API_BASE = '/api';

interface CampaignRecord {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  business_hours_json: { timezone: string; schedule: { day: number; start: string; end: string }[] } | null;
  stop_conditions_json: { max_messages: number; max_days: number; max_no_reply_hours: number } | null;
  agent_count?: number;
  created_at: string;
  updated_at: string;
}

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const timeOptions = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return opts;
})();

const campaigns = ref<CampaignRecord[]>([]);
const listLoading = ref(true);
const searchQuery = ref('');
const showCreateModal = ref(false);

const form = ref({
  name: '',
  useCustomHours: false,
  timezone: 'America/New_York',
  activeDays: [1, 2, 3, 4, 5] as number[],
  startTime: '09:00',
  endTime: '17:00',
  useCustomStopConditions: false,
  maxMessages: 50,
  maxDays: 14,
  maxNoReplyHours: 72,
});
const formLoading = ref(false);
const formError = ref('');
const formSuccess = ref('');

let workspaceId: string | null = null;
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const filteredCampaigns = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return campaigns.value;
  return campaigns.value.filter((c) => c.name.toLowerCase().includes(q));
});

function statusClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700';
    case 'paused':
      return 'bg-amber-50 text-amber-700';
    case 'archived':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function resolveWorkspace(): string | null {
  const { workspaceId } = getSessionContext();
  return workspaceId || null;
}

async function fetchCampaigns() {
  if (!workspaceId) return;
  const params = new URLSearchParams({ workspace_id: workspaceId });
  const res = await fetch(`${API_BASE}/api-campaigns-list?${params}`);
  if (res.ok) campaigns.value = await res.json();
}

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchCampaigns(), 300);
}

function buildBusinessHoursJson(tz: string, days: number[], start: string, end: string) {
  return {
    timezone: tz,
    schedule: days.map((day) => ({ day, start, end })),
  };
}

function buildStopConditionsJson(maxMessages: number, maxDays: number, maxNoReplyHours: number) {
  return {
    max_messages: maxMessages,
    max_days: maxDays,
    max_no_reply_hours: maxNoReplyHours,
  };
}

async function createCampaign() {
  if (!workspaceId) return;
  formError.value = '';
  formSuccess.value = '';
  formLoading.value = true;

  try {
    const res = await fetch(`${API_BASE}/api-campaigns-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        name: form.value.name,
        business_hours_json: form.value.useCustomHours
          ? buildBusinessHoursJson(form.value.timezone, form.value.activeDays, form.value.startTime, form.value.endTime)
          : {},
        stop_conditions_json: form.value.useCustomStopConditions
          ? buildStopConditionsJson(form.value.maxMessages, form.value.maxDays, form.value.maxNoReplyHours)
          : {},
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      formError.value = data.error || 'Failed to create campaign';
      return;
    }

    // Navigate to the new campaign
    window.location.href = `/campaigns/${data.id}`;
  } catch {
    formError.value = 'Network error. Please try again.';
  } finally {
    formLoading.value = false;
  }
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

onMounted(async () => {
  workspaceId = resolveWorkspace();
  if (!workspaceId) {
    listLoading.value = false;
    return;
  }
  await fetchCampaigns();
  listLoading.value = false;
});
</script>
