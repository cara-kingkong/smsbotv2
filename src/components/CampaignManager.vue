<template>
  <div
    class="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]"
    style="min-height: calc(100vh - 280px);"
  >
    <aside class="panel flex min-h-[560px] flex-col overflow-hidden p-0">
      <div class="border-b border-slate-200/80 px-5 py-5">
        <div class="page-kicker">Campaign Library</div>
        <h2 class="section-title mt-3">Browse campaigns</h2>
        <p class="section-copy mt-2">
          Search by name, review status quickly, and move into detailed editing without losing the list view.
        </p>
      </div>

      <div class="border-b border-slate-200/70 px-4 py-4">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search campaigns..."
          class="input"
          @input="debouncedSearch"
        />
      </div>

      <div class="flex-1 overflow-y-auto px-3 py-3">
        <div v-if="listLoading" class="empty-state min-h-full">Loading campaigns...</div>
        <div v-else-if="filteredCampaigns.length === 0" class="empty-state min-h-full">
          No campaigns found. Create your first campaign from the panel on the right.
        </div>
        <div v-else class="space-y-2">
          <button
            v-for="campaign in filteredCampaigns"
            :key="campaign.id"
            class="list-card"
            :class="
              selectedCampaign?.id === campaign.id
                ? 'list-card-active'
                : ''
            "
            @click="selectCampaign(campaign)"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-slate-900">{{ campaign.name }}</div>
                <div class="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Created {{ relativeTime(campaign.created_at) }}
                </div>
              </div>
              <span class="badge" :class="statusClass(campaign.status)">{{ campaign.status }}</span>
            </div>
            <div class="mt-3 text-sm text-slate-600">
              {{ campaign.agent_count ?? 0 }} agent{{ (campaign.agent_count ?? 0) === 1 ? '' : 's' }} assigned
            </div>
          </button>
        </div>
      </div>
    </aside>

    <section class="panel min-h-[560px] overflow-hidden p-0">
      <div class="border-b border-slate-200/80 px-5 py-4">
        <div class="flex flex-wrap gap-2">
          <button
            class="pill-tab"
            :class="activeTab === 'create' ? 'pill-tab-active' : ''"
            @click="activeTab = 'create'"
          >
            Create campaign
          </button>
          <button
            class="pill-tab"
            :class="activeTab === 'detail' ? 'pill-tab-active' : ''"
            :disabled="!selectedCampaign"
            @click="activeTab = 'detail'"
          >
            Campaign detail
          </button>
        </div>
      </div>

      <div v-if="activeTab === 'create'" class="px-5 py-5 sm:px-6 sm:py-6">
        <div class="mx-auto max-w-4xl space-y-6">
          <div>
            <div class="page-kicker">New Campaign</div>
            <h2 class="section-title mt-3">Launch a campaign with clean defaults.</h2>
            <p class="section-copy mt-2">
              Start with a strong name, optionally override business hours, and control stop conditions only where needed.
            </p>
          </div>

          <form class="space-y-6" @submit.prevent="createCampaign">
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
                Using workspace default business hours. Update them in <a href="/settings" class="font-semibold text-teal-700">Settings</a> if you want a shared change.
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
                Using workspace default stop conditions. Update them in <a href="/settings" class="font-semibold text-teal-700">Settings</a> if you want a shared change.
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

            <button type="submit" :disabled="formLoading" class="button-primary w-full sm:w-auto">
              {{ formLoading ? 'Creating...' : 'Create Campaign' }}
            </button>
          </form>
        </div>
      </div>

      <div v-else class="px-5 py-5 sm:px-6 sm:py-6">
        <div v-if="!selectedCampaign" class="empty-state min-h-[420px]">
          Select a campaign from the list to review details and adjust configuration.
        </div>
        <div v-else-if="detailLoading" class="empty-state min-h-[420px]">Loading campaign details...</div>
        <div v-else class="mx-auto max-w-4xl space-y-6">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-[20px] bg-teal-100 text-lg font-bold text-teal-700">
                {{ selectedCampaign.name.charAt(0).toUpperCase() }}
              </div>
              <div>
                <div class="page-kicker">Campaign Detail</div>
                <h2 class="section-title mt-2">{{ selectedCampaign.name }}</h2>
                <p class="section-copy mt-1">Created {{ formatDate(selectedCampaign.created_at) }}</p>
              </div>
            </div>
            <span class="badge self-start sm:self-auto" :class="statusClass(detail.status)">{{ detail.status }}</span>
          </div>

          <div class="grid gap-6">
            <div class="panel-muted space-y-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="form-label">Campaign Name</label>
                  <input v-model="detail.name" type="text" class="input" />
                </div>
                <div>
                  <label class="form-label">Status</label>
                  <select v-model="detail.status" class="select">
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>

            <fieldset class="panel-muted space-y-4">
              <legend class="form-label">Business Hours</legend>

              <label class="flex items-center gap-3 text-sm text-slate-700">
                <input
                  v-model="detail.useCustomHours"
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Override workspace defaults
              </label>

              <div v-if="!detail.useCustomHours" class="note-box">
                Using workspace default business hours. Update them in <a href="/settings" class="font-semibold text-teal-700">Settings</a> if you want a shared change.
              </div>

              <template v-if="detail.useCustomHours">
                <div>
                  <label class="form-label">Timezone</label>
                  <select v-model="detail.timezone" class="select">
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
                        v-model="detail.activeDays"
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
                    <select v-model="detail.startTime" class="select">
                      <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="form-label">End Time</label>
                    <select v-model="detail.endTime" class="select">
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
                  v-model="detail.useCustomStopConditions"
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Override workspace defaults
              </label>

              <div v-if="!detail.useCustomStopConditions" class="note-box">
                Using workspace default stop conditions. Update them in <a href="/settings" class="font-semibold text-teal-700">Settings</a> if you want a shared change.
              </div>

              <template v-if="detail.useCustomStopConditions">
                <div class="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label class="form-label">Max Messages</label>
                    <input v-model.number="detail.maxMessages" type="number" min="1" class="input" />
                  </div>
                  <div>
                    <label class="form-label">Max Days</label>
                    <input v-model.number="detail.maxDays" type="number" min="1" class="input" />
                  </div>
                  <div>
                    <label class="form-label">Max No-Reply Hours</label>
                    <input v-model.number="detail.maxNoReplyHours" type="number" min="1" class="input" />
                  </div>
                </div>
              </template>
            </fieldset>

            <div class="panel-muted">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 class="text-base font-semibold text-slate-900">Assigned Agents</h3>
                  <p class="mt-1 text-sm text-slate-600">
                    {{ campaignAgents.length }} agent{{ campaignAgents.length === 1 ? '' : 's' }} currently assigned to this campaign.
                  </p>
                </div>
                <a
                  :href="`/campaigns?campaign_id=${selectedCampaign.id}&tab=agents`"
                  class="button-secondary"
                >
                  Manage Agents
                </a>
              </div>

              <div v-if="campaignAgents.length === 0" class="note-box mt-4">
                No agents assigned to this campaign yet.
              </div>
              <div v-else class="mt-4 space-y-2">
                <div
                  v-for="agent in campaignAgents"
                  :key="agent.id"
                  class="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3"
                >
                  <span class="text-sm font-semibold text-slate-900">{{ agent.name }}</span>
                  <span class="badge bg-teal-50 text-teal-700">weight {{ agent.weight ?? 1 }}</span>
                </div>
              </div>
            </div>

            <div v-if="detailSuccess" class="feedback-success">{{ detailSuccess }}</div>
            <div v-if="detailError" class="feedback-error">{{ detailError }}</div>

            <button type="button" :disabled="detailSaving" class="button-primary w-full sm:w-auto" @click="saveCampaign">
              {{ detailSaving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>
    </section>
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

interface AgentRecord {
  id: string;
  name: string;
  weight?: number;
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
const selectedCampaign = ref<CampaignRecord | null>(null);
const activeTab = ref<'create' | 'detail'>('create');

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

const detail = ref({
  name: '',
  status: 'active',
  useCustomHours: false,
  timezone: 'America/New_York',
  activeDays: [] as number[],
  startTime: '09:00',
  endTime: '17:00',
  useCustomStopConditions: false,
  maxMessages: 50,
  maxDays: 14,
  maxNoReplyHours: 72,
});
const detailLoading = ref(false);
const detailSaving = ref(false);
const detailError = ref('');
const detailSuccess = ref('');
const campaignAgents = ref<AgentRecord[]>([]);

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
          ? buildBusinessHoursJson(
              form.value.timezone,
              form.value.activeDays,
              form.value.startTime,
              form.value.endTime,
            )
          : {},
        stop_conditions_json: form.value.useCustomStopConditions
          ? buildStopConditionsJson(
              form.value.maxMessages,
              form.value.maxDays,
              form.value.maxNoReplyHours,
            )
          : {},
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      formError.value = data.error || 'Failed to create campaign';
      return;
    }

    formSuccess.value = `Campaign "${data.name}" created successfully.`;
    form.value = {
      name: '',
      useCustomHours: false,
      timezone: 'America/New_York',
      activeDays: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00',
      useCustomStopConditions: false,
      maxMessages: 50,
      maxDays: 14,
      maxNoReplyHours: 72,
    };
    await fetchCampaigns();
  } catch {
    formError.value = 'Network error. Please try again.';
  } finally {
    formLoading.value = false;
  }
}

async function selectCampaign(campaign: CampaignRecord) {
  selectedCampaign.value = campaign;
  activeTab.value = 'detail';
  detailError.value = '';
  detailSuccess.value = '';
  detailLoading.value = true;
  campaignAgents.value = [];

  try {
    const params = new URLSearchParams({ campaign_id: campaign.id });
    const res = await fetch(`${API_BASE}/api-campaigns-get?${params}`);

    if (!res.ok) {
      detailError.value = 'Failed to load campaign details';
      detailLoading.value = false;
      return;
    }

    const data = await res.json();
    selectedCampaign.value = data;

    const bh = data.business_hours_json;
    const sc = data.stop_conditions_json;
    const hasCustomHours = bh?.schedule?.length > 0;
    const hasCustomStopConditions = sc?.max_messages !== undefined && Object.keys(sc).length > 0;

    detail.value = {
      name: data.name,
      status: data.status,
      useCustomHours: hasCustomHours,
      timezone: bh?.timezone ?? 'America/New_York',
      activeDays: bh?.schedule?.map((s: { day: number }) => s.day) ?? [1, 2, 3, 4, 5],
      startTime: bh?.schedule?.[0]?.start ?? '09:00',
      endTime: bh?.schedule?.[0]?.end ?? '17:00',
      useCustomStopConditions: hasCustomStopConditions,
      maxMessages: sc?.max_messages ?? 50,
      maxDays: sc?.max_days ?? 14,
      maxNoReplyHours: sc?.max_no_reply_hours ?? 72,
    };

    campaignAgents.value = data.agents ?? [];
  } catch {
    detailError.value = 'Network error loading campaign details.';
  } finally {
    detailLoading.value = false;
  }
}

async function saveCampaign() {
  if (!selectedCampaign.value) return;
  detailError.value = '';
  detailSuccess.value = '';
  detailSaving.value = true;

  try {
    const res = await fetch(`${API_BASE}/api-campaigns-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: selectedCampaign.value.id,
        name: detail.value.name,
        status: detail.value.status,
        business_hours_json: detail.value.useCustomHours
          ? buildBusinessHoursJson(
              detail.value.timezone,
              detail.value.activeDays,
              detail.value.startTime,
              detail.value.endTime,
            )
          : {},
        stop_conditions_json: detail.value.useCustomStopConditions
          ? buildStopConditionsJson(
              detail.value.maxMessages,
              detail.value.maxDays,
              detail.value.maxNoReplyHours,
            )
          : {},
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      detailError.value = data.error || 'Failed to update campaign';
      return;
    }

    detailSuccess.value = 'Campaign updated successfully.';
    selectedCampaign.value = { ...selectedCampaign.value, ...data };
    await fetchCampaigns();
  } catch {
    detailError.value = 'Network error. Please try again.';
  } finally {
    detailSaving.value = false;
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

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
