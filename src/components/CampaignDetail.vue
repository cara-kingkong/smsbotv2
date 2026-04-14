<template>
  <div class="w-full" style="min-height: calc(100vh - 280px);">
    <div v-if="loading" class="empty-state">Loading campaign...</div>
    <div v-else-if="!campaign" class="empty-state">Campaign not found.</div>
    <div v-else class="space-y-6">
      <div class="page-header">
        <div class="page-header-row !items-start">
          <div class="min-w-0 flex-1">
            <a href="/campaigns" class="text-sm font-medium text-teal-700 hover:text-teal-800">&larr; Back to Campaigns</a>
            <p class="page-kicker mt-3">Campaign Detail</p>

            <div class="mt-2">
              <button
                v-if="inlineEdit !== 'name'"
                type="button"
                class="inline-edit-trigger"
                @click="inlineEdit = 'name'"
              >
                <span class="page-title mt-0 truncate">{{ detail.name || campaign.name }}</span>
                <svg class="inline-edit-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 3.5a2.12 2.12 0 1 1 3 3L7 16l-4 1 1-4 9.5-9.5Z" />
                </svg>
              </button>
              <input
                v-else
                v-model="detail.name"
                type="text"
                class="inline-edit-field max-w-2xl text-2xl font-semibold tracking-tight"
                @blur="inlineEdit = null"
                @keydown.enter.prevent="inlineEdit = null"
                @keydown.esc.prevent="inlineEdit = null"
              />
            </div>

            <p class="page-subtitle mt-2 max-w-4xl">
              {{ campaignAgents.length }} assigned agent{{ campaignAgents.length === 1 ? '' : 's' }}. Created {{ formatDate(campaign.created_at) }}.
            </p>

            <div class="mt-4 flex flex-wrap items-center gap-2">
              <button
                v-if="inlineEdit !== 'status'"
                type="button"
                class="inline-edit-trigger"
                @click="inlineEdit = 'status'"
              >
                <span class="badge" :class="statusClass(detail.status)">{{ detail.status }}</span>
                <svg class="inline-edit-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 3.5a2.12 2.12 0 1 1 3 3L7 16l-4 1 1-4 9.5-9.5Z" />
                </svg>
              </button>
              <select
                v-else
                v-model="detail.status"
                class="select w-auto min-w-[140px]"
                @blur="inlineEdit = null"
                @change="inlineEdit = null"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>

              <span class="page-badge">{{ detail.useCustomHours ? 'Custom business hours' : 'Workspace business hours' }}</span>
              <span class="page-badge">{{ detail.useCustomStopConditions ? 'Custom stop conditions' : 'Workspace stop conditions' }}</span>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-3">
            <button type="button" :disabled="saving" class="button-primary" @click="saveCampaign">
              {{ saving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="saveSuccess" class="feedback-success">{{ saveSuccess }}</div>
      <div v-if="saveError" class="feedback-error">{{ saveError }}</div>

      <section class="panel space-y-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div class="page-kicker">Campaign Agents</div>
            <h2 class="section-title mt-3">Assigned agents</h2>
            <p class="section-copy mt-2">The split-test roster currently serving this campaign.</p>
          </div>
          <a :href="`/agents?campaign=${campaignId}`" class="button-secondary">View in Agent Directory</a>
        </div>

        <div v-if="campaignAgents.length === 0" class="empty-state">
          <div class="text-center space-y-3">
            <div class="text-base font-semibold text-slate-900">This campaign needs an AI agent</div>
            <p class="text-sm text-slate-500 max-w-xs mx-auto">An agent handles conversations for this campaign. Add one to start qualifying leads automatically.</p>
            <a :href="`/agents?campaign=${campaignId}`" class="button-primary inline-flex">Add agent to this campaign</a>
          </div>
        </div>

        <div v-else class="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          <a
            v-for="agent in campaignAgents"
            :key="agent.id"
            :href="`/agents/${agent.id}`"
            class="list-card block"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-sm font-bold text-teal-700">
                    {{ agent.name.charAt(0).toUpperCase() }}{{ agent.name.charAt(1)?.toUpperCase() || '' }}
                  </div>
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-slate-900">{{ agent.name }}</div>
                    <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>Weight {{ agent.weight ?? 1 }}</span>
                      <span v-if="agent.active_version_number">v{{ agent.active_version_number }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="agent.description" class="mt-3 text-xs leading-6 text-slate-500 line-clamp-2">{{ agent.description }}</div>
              </div>
              <span class="badge shrink-0" :class="statusClass(agent.status)">{{ agent.status }}</span>
            </div>

            <div v-if="metricsByAgent[agent.id]" class="mt-4 grid grid-cols-2 gap-2">
              <div class="rounded-2xl border px-3 py-2" style="border-color: rgba(17,17,17,0.06); background: rgba(251,251,249,0.94);">
                <div class="form-help mt-0">Conversations</div>
                <div class="text-sm font-semibold text-slate-900">{{ metricsByAgent[agent.id].total_conversations }}</div>
              </div>
              <div class="rounded-2xl border px-3 py-2" style="border-color: rgba(17,17,17,0.06); background: rgba(251,251,249,0.94);">
                <div class="form-help mt-0">Booking rate</div>
                <div class="text-sm font-semibold text-slate-900">{{ formatPercent(metricsByAgent[agent.id].booking_rate) }}</div>
              </div>
            </div>
          </a>
        </div>
      </section>

      <section class="panel space-y-5">
        <div>
          <div class="page-kicker">Booking</div>
          <h2 class="section-title mt-3">Calendar Assignments</h2>
          <p class="section-copy mt-2">Select which calendars this campaign's agents can book into.</p>
        </div>

        <div v-if="calendarsLoading" class="note-box text-xs">Loading calendars...</div>

        <div v-else-if="workspaceCalendars.length === 0" class="note-box text-xs">
          No calendar targets found. <a href="/calendar" class="text-teal-700 hover:text-teal-800 font-medium">Import calendars</a> first.
        </div>

        <div v-else class="space-y-2">
          <label
            v-for="cal in workspaceCalendars"
            :key="cal.id"
            class="flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors cursor-pointer"
            :style="assignedCalendarIds.has(cal.id)
              ? 'border-color: rgba(13,148,136,0.3); background: rgba(240,253,250,0.7);'
              : 'border-color: rgba(17,17,17,0.06); background: rgba(251,251,249,0.94);'"
          >
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              :checked="assignedCalendarIds.has(cal.id)"
              :disabled="calendarToggling === cal.id"
              @change="toggleCalendarAssignment(cal.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="font-medium text-slate-800">{{ cal.name }}</span>
            <span v-if="cal.booking_url" class="text-xs text-slate-400 truncate max-w-xs">{{ cal.booking_url }}</span>
          </label>
        </div>

        <div v-if="calendarAssignSuccess" class="feedback-success text-xs">{{ calendarAssignSuccess }}</div>
        <div v-if="calendarAssignError" class="feedback-error text-xs">{{ calendarAssignError }}</div>
      </section>

      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="page-kicker">Campaign Stats</div>
            <h2 class="section-title mt-3">Performance snapshot</h2>
          </div>
          <span v-if="metricsLoading" class="page-badge">Refreshing...</span>
        </div>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div class="stat-card">
            <div class="stat-label">Total Conversations</div>
            <div class="stat-value">{{ metrics?.total_conversations ?? 0 }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Active</div>
            <div class="stat-value">{{ metrics?.active_conversations ?? 0 }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Booked</div>
            <div class="stat-value">{{ metrics?.booked ?? 0 }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Qualified</div>
            <div class="stat-value">{{ metrics?.qualified_not_booked ?? 0 }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Opted Out</div>
            <div class="stat-value">{{ metrics?.opted_out ?? 0 }}</div>
          </div>
        </div>
      </section>

      <div class="grid gap-6 xl:grid-cols-2">
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
          <template v-else>
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
          <template v-else>
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { timezoneOptions } from '@lib/utils/timezones';

const props = defineProps<{ campaignId: string }>();

const API_BASE = '/api';

interface CampaignRecord {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  business_hours_json: { timezone: string; schedule: { day: number; start: string; end: string }[] } | null;
  stop_conditions_json: { max_messages: number; max_days: number; max_no_reply_hours: number } | null;
  agents?: AgentRecord[];
  created_at: string;
  updated_at: string;
}

interface AgentRecord {
  id: string;
  name: string;
  weight?: number;
  status: string;
  description?: string;
  active_version_number?: number;
}

interface AgentMetric {
  agent_id: string;
  total_conversations: number;
  booking_rate: number;
}

interface CampaignMetrics {
  total_conversations: number;
  active_conversations: number;
  booked: number;
  qualified_not_booked: number;
  opted_out: number;
  agent_metrics: AgentMetric[];
}

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const timeOptions = (() => {
  const options: string[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      options.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }
  }
  return options;
})();

const loading = ref(true);
const campaign = ref<CampaignRecord | null>(null);
const campaignAgents = ref<AgentRecord[]>([]);
const metrics = ref<CampaignMetrics | null>(null);
const metricsLoading = ref(false);
const inlineEdit = ref<'name' | 'status' | null>(null);

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

const saving = ref(false);
const saveError = ref('');
const saveSuccess = ref('');

// Calendar assignments
interface CalendarRecord {
  id: string;
  name: string;
  booking_url?: string | null;
  status?: string;
}

const workspaceCalendars = ref<CalendarRecord[]>([]);
const assignedCalendarIds = ref<Set<string>>(new Set());
const calendarsLoading = ref(false);
const calendarToggling = ref<string | null>(null);
const calendarAssignSuccess = ref('');
const calendarAssignError = ref('');

const metricsByAgent = computed(() => Object.fromEntries((metrics.value?.agent_metrics ?? []).map((item) => [item.agent_id, item])));

function statusClass(status: string): string {
  switch (status) {
    case 'active': return 'bg-emerald-50 text-emerald-700';
    case 'paused': return 'bg-amber-50 text-amber-700';
    case 'archived': return 'bg-slate-100 text-slate-600';
    default: return 'bg-slate-100 text-slate-600';
  }
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

function formatPercent(value: number): string {
  return `${Math.round((value ?? 0) * 100)}%`;
}

async function fetchCampaign() {
  try {
    const params = new URLSearchParams({ campaign_id: props.campaignId });
    const res = await fetch(`${API_BASE}/api-campaigns-get?${params}`);
    if (!res.ok) return;

    const data = await res.json();
    campaign.value = data;

    const businessHours = data.business_hours_json;
    const stopConditions = data.stop_conditions_json;

    detail.value = {
      name: data.name,
      status: data.status,
      useCustomHours: Boolean(businessHours?.schedule?.length),
      timezone: businessHours?.timezone ?? 'America/New_York',
      activeDays: businessHours?.schedule?.map((item: { day: number }) => item.day) ?? [1, 2, 3, 4, 5],
      startTime: businessHours?.schedule?.[0]?.start ?? '09:00',
      endTime: businessHours?.schedule?.[0]?.end ?? '17:00',
      useCustomStopConditions: stopConditions?.max_messages !== undefined && Object.keys(stopConditions ?? {}).length > 0,
      maxMessages: stopConditions?.max_messages ?? 50,
      maxDays: stopConditions?.max_days ?? 14,
      maxNoReplyHours: stopConditions?.max_no_reply_hours ?? 72,
    };

    campaignAgents.value = data.agents ?? [];
    await Promise.all([fetchMetrics(), fetchCalendars()]);
  } catch {
    // Ignore transient fetch errors and rely on the empty state.
  } finally {
    loading.value = false;
  }
}

async function fetchMetrics() {
  metricsLoading.value = true;
  try {
    const params = new URLSearchParams({ campaign_id: props.campaignId });
    const res = await fetch(`${API_BASE}/api-reporting-campaign?${params}`);
    if (res.ok) metrics.value = await res.json();
  } finally {
    metricsLoading.value = false;
  }
}

async function saveCampaign() {
  if (!campaign.value) return;

  saveError.value = '';
  saveSuccess.value = '';
  saving.value = true;

  try {
    const res = await fetch(`${API_BASE}/api-campaigns-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: campaign.value.id,
        name: detail.value.name,
        status: detail.value.status,
        business_hours_json: detail.value.useCustomHours
          ? {
              timezone: detail.value.timezone,
              schedule: detail.value.activeDays.map((day) => ({
                day,
                start: detail.value.startTime,
                end: detail.value.endTime,
              })),
            }
          : {},
        stop_conditions_json: detail.value.useCustomStopConditions
          ? {
              max_messages: detail.value.maxMessages,
              max_days: detail.value.maxDays,
              max_no_reply_hours: detail.value.maxNoReplyHours,
            }
          : {},
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      saveError.value = data.error || 'Failed to update campaign';
      return;
    }

    saveSuccess.value = 'Campaign updated successfully.';
    inlineEdit.value = null;
    campaign.value = { ...campaign.value, ...data };
  } catch {
    saveError.value = 'Network error. Please try again.';
  } finally {
    saving.value = false;
  }
}

async function fetchCalendars() {
  if (!campaign.value) return;
  const wsId = campaign.value.workspace_id;
  if (!wsId) return;
  calendarsLoading.value = true;

  try {
    const [wsRes, campCalRes] = await Promise.all([
      fetch(`${API_BASE}/api-calendars-list?workspace_id=${wsId}`),
      fetch(`${API_BASE}/api-campaign-calendars-list?workspace_id=${wsId}&campaign_id=${props.campaignId}`),
    ]);

    if (wsRes.ok) {
      workspaceCalendars.value = await wsRes.json();
    }
    if (campCalRes.ok) {
      const assigned: CalendarRecord[] = await campCalRes.json();
      assignedCalendarIds.value = new Set(assigned.map((c) => c.id));
    }
  } finally {
    calendarsLoading.value = false;
  }
}

async function toggleCalendarAssignment(calendarId: string, checked: boolean) {
  if (!campaign.value) return;
  const wsId = campaign.value.workspace_id;
  calendarToggling.value = calendarId;
  calendarAssignSuccess.value = '';
  calendarAssignError.value = '';

  try {
    if (checked) {
      const res = await fetch(`${API_BASE}/api-campaign-calendars-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: wsId,
          campaign_id: props.campaignId,
          calendar_id: calendarId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        calendarAssignError.value = data.error || 'Failed to assign calendar';
        return;
      }

      assignedCalendarIds.value = new Set([...assignedCalendarIds.value, calendarId]);
      calendarAssignSuccess.value = 'Calendar assigned';
    } else {
      const res = await fetch(`${API_BASE}/api-campaign-calendars-remove`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: wsId,
          campaign_id: props.campaignId,
          calendar_id: calendarId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        calendarAssignError.value = data.error || 'Failed to remove calendar';
        return;
      }

      const next = new Set(assignedCalendarIds.value);
      next.delete(calendarId);
      assignedCalendarIds.value = next;
      calendarAssignSuccess.value = 'Calendar removed';
    }
  } catch {
    calendarAssignError.value = 'Network error. Please try again.';
  } finally {
    calendarToggling.value = null;
  }
}

onMounted(() => {
  fetchCampaign();
});
</script>
