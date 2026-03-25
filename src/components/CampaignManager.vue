<template>
  <div class="flex gap-4" style="height: calc(100vh - 220px); min-height: 400px;">
    <!-- Left: Campaign list -->
    <div class="w-[400px] shrink-0 bg-surface border border-slate-700 rounded-lg overflow-hidden flex flex-col">
      <!-- Search -->
      <div class="p-3 border-b border-slate-700">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search campaigns..."
          class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          @input="debouncedSearch"
        />
      </div>

      <!-- List -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="listLoading" class="flex items-center justify-center h-full text-slate-400 text-sm">
          Loading...
        </div>
        <div v-else-if="filteredCampaigns.length === 0" class="flex items-center justify-center h-full text-slate-400 text-sm p-6 text-center">
          No campaigns found. Create your first campaign using the form.
        </div>
        <div
          v-for="campaign in filteredCampaigns"
          :key="campaign.id"
          class="flex flex-col gap-0.5 px-4 py-3 border-b border-slate-700 cursor-pointer transition-colors hover:bg-surface-hover"
          :class="{ 'bg-surface-hover border-l-[3px] border-l-blue-500': selectedCampaign?.id === campaign.id }"
          @click="selectCampaign(campaign)"
        >
          <div class="flex justify-between items-center">
            <span class="font-semibold text-sm text-slate-100">{{ campaign.name }}</span>
            <span
              class="text-[11px] px-2 py-0.5 rounded-full font-medium"
              :class="statusClass(campaign.status)"
            >{{ campaign.status }}</span>
          </div>
          <div class="flex justify-between items-center mt-1">
            <span class="text-[13px] text-slate-400">{{ campaign.agent_count ?? 0 }} agent{{ (campaign.agent_count ?? 0) === 1 ? '' : 's' }}</span>
            <span class="text-[11px] text-slate-400">{{ relativeTime(campaign.created_at) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Create/Detail panel -->
    <div class="flex-1 bg-surface border border-slate-700 rounded-lg overflow-hidden flex flex-col">
      <!-- Tab bar -->
      <div class="flex border-b border-slate-700 shrink-0">
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          :class="activeTab === 'create' ? 'text-blue-400 border-b-2 border-blue-500 bg-surface-hover' : 'text-slate-400 hover:text-slate-200'"
          @click="activeTab = 'create'"
        >
          Create Campaign
        </button>
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          :class="activeTab === 'detail' ? 'text-blue-400 border-b-2 border-blue-500 bg-surface-hover' : 'text-slate-400 hover:text-slate-200'"
          :disabled="!selectedCampaign"
          @click="activeTab = 'detail'"
        >
          Campaign Detail
        </button>
      </div>

      <!-- Create Campaign Form -->
      <div v-if="activeTab === 'create'" class="flex-1 overflow-y-auto p-6">
        <form @submit.prevent="createCampaign" class="max-w-md space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Campaign Name *</label>
            <input
              v-model="form.name"
              type="text"
              required
              placeholder="e.g. Spring Lead Gen"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <!-- Business Hours -->
          <fieldset class="border border-slate-700 rounded-lg p-4 space-y-3">
            <legend class="text-sm font-medium text-slate-300 px-1">Business Hours</legend>

            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Timezone</label>
              <select
                v-model="form.timezone"
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Active Days</label>
              <div class="flex flex-wrap gap-2">
                <label
                  v-for="(dayLabel, dayIndex) in dayLabels"
                  :key="dayIndex"
                  class="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :value="dayIndex"
                    v-model="form.activeDays"
                    class="rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                  />
                  {{ dayLabel }}
                </label>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">Start Time</label>
                <select
                  v-model="form.startTime"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">End Time</label>
                <select
                  v-model="form.endTime"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
            </div>
          </fieldset>

          <!-- Stop Conditions -->
          <fieldset class="border border-slate-700 rounded-lg p-4 space-y-3">
            <legend class="text-sm font-medium text-slate-300 px-1">Stop Conditions</legend>

            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Max Messages</label>
              <input
                v-model.number="form.maxMessages"
                type="number"
                min="1"
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Max Days</label>
              <input
                v-model.number="form.maxDays"
                type="number"
                min="1"
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Max No-Reply Hours</label>
              <input
                v-model.number="form.maxNoReplyHours"
                type="number"
                min="1"
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </fieldset>

          <!-- Success/Error messages -->
          <div v-if="formSuccess" class="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-lg">
            {{ formSuccess }}
          </div>
          <div v-if="formError" class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
            {{ formError }}
          </div>

          <button
            type="submit"
            :disabled="formLoading"
            class="w-full py-2.5 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {{ formLoading ? 'Creating...' : 'Create Campaign' }}
          </button>
        </form>
      </div>

      <!-- Campaign Detail -->
      <div v-else-if="activeTab === 'detail'" class="flex-1 overflow-y-auto p-6">
        <div v-if="!selectedCampaign" class="flex items-center justify-center h-full text-slate-400 text-sm">
          Select a campaign from the list to view details
        </div>
        <div v-else-if="detailLoading" class="flex items-center justify-center h-full text-slate-400 text-sm">
          Loading campaign details...
        </div>
        <div v-else class="max-w-md space-y-4">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-lg">
              {{ selectedCampaign.name.charAt(0).toUpperCase() }}
            </div>
            <div>
              <div class="text-lg font-semibold">{{ selectedCampaign.name }}</div>
              <div class="text-sm text-slate-400">Created {{ formatDate(selectedCampaign.created_at) }}</div>
            </div>
          </div>

          <!-- Editable fields -->
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Campaign Name</label>
            <input
              v-model="detail.name"
              type="text"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Status</label>
            <select
              v-model="detail.status"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <!-- Business Hours Edit -->
          <fieldset class="border border-slate-700 rounded-lg p-4 space-y-3">
            <legend class="text-sm font-medium text-slate-300 px-1">Business Hours</legend>

            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Timezone</label>
              <select
                v-model="detail.timezone"
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Active Days</label>
              <div class="flex flex-wrap gap-2">
                <label
                  v-for="(dayLabel, dayIndex) in dayLabels"
                  :key="dayIndex"
                  class="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :value="dayIndex"
                    v-model="detail.activeDays"
                    class="rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                  />
                  {{ dayLabel }}
                </label>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">Start Time</label>
                <select
                  v-model="detail.startTime"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">End Time</label>
                <select
                  v-model="detail.endTime"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
            </div>
          </fieldset>

          <!-- Stop Conditions Edit -->
          <fieldset class="border border-slate-700 rounded-lg p-4 space-y-3">
            <legend class="text-sm font-medium text-slate-300 px-1">Stop Conditions</legend>

            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Max Messages</label>
              <input
                v-model.number="detail.maxMessages"
                type="number"
                min="1"
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Max Days</label>
              <input
                v-model.number="detail.maxDays"
                type="number"
                min="1"
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Max No-Reply Hours</label>
              <input
                v-model.number="detail.maxNoReplyHours"
                type="number"
                min="1"
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </fieldset>

          <!-- Save Success/Error -->
          <div v-if="detailSuccess" class="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-lg">
            {{ detailSuccess }}
          </div>
          <div v-if="detailError" class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
            {{ detailError }}
          </div>

          <button
            type="button"
            :disabled="detailSaving"
            class="w-full py-2.5 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
            @click="saveCampaign"
          >
            {{ detailSaving ? 'Saving...' : 'Save Changes' }}
          </button>

          <!-- Agents section -->
          <div class="border border-slate-700 rounded-lg p-4 mt-4 space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-sm font-medium text-slate-300">Agents ({{ campaignAgents.length }})</span>
              <a
                :href="`/campaigns?campaign_id=${selectedCampaign.id}&tab=agents`"
                class="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >Manage Agents &rarr;</a>
            </div>
            <div v-if="campaignAgents.length === 0" class="text-sm text-slate-500">
              No agents assigned to this campaign yet.
            </div>
            <div
              v-for="agent in campaignAgents"
              :key="agent.id"
              class="flex justify-between items-center py-2 border-b border-slate-700 last:border-0"
            >
              <span class="text-sm text-slate-200">{{ agent.name }}</span>
              <span class="text-[12px] px-2 py-0.5 rounded-full font-medium bg-blue-500/15 text-blue-400">
                weight: {{ agent.weight ?? 1 }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { createClient } from '@supabase/supabase-js';

const API_BASE = '/.netlify/functions';
const supabase = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL ?? '',
  (import.meta as any).env.PUBLIC_SUPABASE_ANON_KEY ?? '',
);

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

// Create form state
const form = ref({
  name: '',
  timezone: 'America/New_York',
  activeDays: [1, 2, 3, 4, 5] as number[],
  startTime: '09:00',
  endTime: '17:00',
  maxMessages: 50,
  maxDays: 14,
  maxNoReplyHours: 72,
});
const formLoading = ref(false);
const formError = ref('');
const formSuccess = ref('');

// Detail/edit state
const detail = ref({
  name: '',
  status: 'active',
  timezone: 'America/New_York',
  activeDays: [] as number[],
  startTime: '09:00',
  endTime: '17:00',
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
      return 'bg-green-500/15 text-green-400';
    case 'paused':
      return 'bg-yellow-500/15 text-yellow-400';
    case 'archived':
      return 'bg-slate-500/15 text-slate-400';
    default:
      return 'bg-slate-500/15 text-slate-400';
  }
}

async function resolveWorkspace(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from('workspace_users')
    .select('workspace_id')
    .eq('user_id', session.user.id)
    .limit(1)
    .single();
  return data?.workspace_id ?? null;
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
        business_hours_json: buildBusinessHoursJson(
          form.value.timezone,
          form.value.activeDays,
          form.value.startTime,
          form.value.endTime,
        ),
        stop_conditions_json: buildStopConditionsJson(
          form.value.maxMessages,
          form.value.maxDays,
          form.value.maxNoReplyHours,
        ),
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
      timezone: 'America/New_York',
      activeDays: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00',
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

    detail.value = {
      name: data.name,
      status: data.status,
      timezone: bh?.timezone ?? 'America/New_York',
      activeDays: bh?.schedule?.map((s: { day: number }) => s.day) ?? [1, 2, 3, 4, 5],
      startTime: bh?.schedule?.[0]?.start ?? '09:00',
      endTime: bh?.schedule?.[0]?.end ?? '17:00',
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
        business_hours_json: buildBusinessHoursJson(
          detail.value.timezone,
          detail.value.activeDays,
          detail.value.startTime,
          detail.value.endTime,
        ),
        stop_conditions_json: buildStopConditionsJson(
          detail.value.maxMessages,
          detail.value.maxDays,
          detail.value.maxNoReplyHours,
        ),
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
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

onMounted(async () => {
  workspaceId = await resolveWorkspace();
  if (!workspaceId) {
    listLoading.value = false;
    return;
  }
  await fetchCampaigns();
  listLoading.value = false;
});
</script>
