<template>
  <div class="w-full" style="min-height: calc(100vh - 280px);">
    <div v-if="loading" class="empty-state">Loading agent...</div>
    <div v-else-if="!agent" class="empty-state">Agent not found.</div>
    <div v-else class="space-y-6">
      <div class="page-header">
        <div class="page-header-row !items-start">
          <div class="flex min-w-0 flex-1 items-start gap-4">
            <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-teal-100 text-lg font-bold text-teal-700">
              {{ agent.name.charAt(0).toUpperCase() }}{{ agent.name.charAt(1)?.toUpperCase() || '' }}
            </div>
            <div class="min-w-0 flex-1">
              <a href="/agents" class="text-sm font-medium text-teal-700 hover:text-teal-800">&larr; Back to Agents</a>
              <p class="page-kicker mt-3">Agent Detail</p>

              <div class="mt-2">
                <button
                  v-if="inlineEdit !== 'name'"
                  type="button"
                  class="inline-edit-trigger"
                  @click="inlineEdit = 'name'"
                >
                  <span class="page-title mt-0 truncate">{{ editForm.name || agent.name }}</span>
                  <svg class="inline-edit-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 3.5a2.12 2.12 0 1 1 3 3L7 16l-4 1 1-4 9.5-9.5Z" />
                  </svg>
                </button>
                <input
                  v-else
                  v-model="editForm.name"
                  type="text"
                  class="inline-edit-field max-w-2xl text-2xl font-semibold tracking-tight"
                  @blur="inlineEdit = null"
                  @keydown.enter.prevent="inlineEdit = null"
                  @keydown.esc.prevent="inlineEdit = null"
                />
              </div>

              <div class="mt-2">
                <button
                  v-if="inlineEdit !== 'description'"
                  type="button"
                  class="inline-edit-trigger w-full justify-start"
                  @click="inlineEdit = 'description'"
                >
                  <span class="page-subtitle mt-0 max-w-4xl text-left">
                    {{ editForm.description || 'Add a short description for how this agent should behave.' }}
                  </span>
                  <svg class="inline-edit-icon mt-0.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 3.5a2.12 2.12 0 1 1 3 3L7 16l-4 1 1-4 9.5-9.5Z" />
                  </svg>
                </button>
                <textarea
                  v-else
                  v-model="editForm.description"
                  rows="3"
                  class="inline-edit-field max-w-4xl resize-none"
                  placeholder="Brief description"
                  @blur="inlineEdit = null"
                  @keydown.esc.prevent="inlineEdit = null"
                ></textarea>
              </div>

              <div class="mt-4 flex flex-wrap items-center gap-2">
                <a :href="`/campaigns/${agent.campaign_id}`" class="page-badge">
                  {{ agent.campaign_name }}
                </a>

                <button
                  v-if="inlineEdit !== 'status'"
                  type="button"
                  class="inline-edit-trigger"
                  @click="inlineEdit = 'status'"
                >
                  <span class="badge" :class="statusClass(editForm.status)">{{ editForm.status }}</span>
                  <svg class="inline-edit-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 3.5a2.12 2.12 0 1 1 3 3L7 16l-4 1 1-4 9.5-9.5Z" />
                  </svg>
                </button>
                <select
                  v-else
                  v-model="editForm.status"
                  class="select w-auto min-w-[140px]"
                  @blur="inlineEdit = null"
                  @change="inlineEdit = null"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </select>

                <span class="page-badge">Weight {{ editForm.weight }}</span>
                <span class="page-badge">
                  {{ activeVersion ? `Active v${activeVersion.version_number}` : 'No active prompt' }}
                </span>
              </div>
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap items-center gap-3">
            <button type="button" :disabled="editLoading" class="button-primary" @click="updateAgent">
              {{ editLoading ? 'Saving...' : 'Save Changes' }}
            </button>
            <button
              v-if="editForm.status !== 'archived'"
              type="button"
              class="button-ghost text-red-600"
              :disabled="editLoading"
              @click="archiveAgent"
            >
              Archive
            </button>
          </div>
        </div>
      </div>

      <div v-if="editSuccess" class="feedback-success">{{ editSuccess }}</div>
      <div v-if="editError" class="feedback-error">{{ editError }}</div>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div class="space-y-6">
          <section class="panel space-y-6">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div class="page-kicker">Active Prompt</div>
                <h2 class="section-title mt-3">{{ activeVersion ? `Version ${activeVersion.version_number}` : 'Draft prompt setup' }}</h2>
                <p class="section-copy mt-2">
                  Edit the live prompt settings here. Saving publishes a new version only if these prompt fields changed.
                </p>
              </div>
              <span v-if="activeVersion" class="page-badge">{{ formatDate(activeVersion.created_at) }}</span>
            </div>

            <div v-if="!activeVersion" class="note-box">
              No prompt version is active yet. Fill out the settings below and save to publish the first version.
            </div>

            <div class="panel-muted">
              <label class="form-label">Prompt Text *</label>
              <textarea
                v-model="versionForm.prompt_text"
                rows="6"
                placeholder="You are a helpful sales assistant who qualifies leads..."
                class="input font-mono text-sm"
              ></textarea>
              <p class="form-help">The main guidance prompt sent to the AI for each conversation turn.</p>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
              <fieldset class="panel-muted space-y-4">
                <legend class="form-label">System Rules</legend>
                <div class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label class="form-label">Tone</label>
                    <select v-model="versionForm.tone" class="select">
                      <option value="friendly">Friendly</option>
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                      <option value="formal">Formal</option>
                    </select>
                  </div>
                  <div>
                    <label class="form-label">Max Message Length</label>
                    <input v-model.number="versionForm.max_message_length" type="number" min="50" max="1600" class="input" />
                  </div>
                </div>
              </fieldset>

              <fieldset class="panel-muted space-y-4">
                <legend class="form-label">Reply Cadence</legend>
                <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label class="form-label">Reply Delay (s)</label>
                    <input v-model.number="versionForm.reply_delay_seconds" type="number" min="0" class="input" />
                    <p class="mt-1 text-xs text-slate-500">Wait before replying; resets if another message arrives</p>
                  </div>
                  <div>
                    <label class="form-label">Followup Delay (s)</label>
                    <input v-model.number="versionForm.followup_delay_seconds" type="number" min="0" class="input" />
                  </div>
                  <div>
                    <label class="form-label">Max Followups</label>
                    <input v-model.number="versionForm.max_followups" type="number" min="0" class="input" />
                  </div>
                </div>
              </fieldset>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
              <fieldset class="panel-muted space-y-4">
                <legend class="form-label">Allowed Actions</legend>
                <label class="flex items-center gap-3 text-sm text-slate-700">
                  <input v-model="versionForm.can_book" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                  Can book appointments
                </label>
                <label class="flex items-center gap-3 text-sm text-slate-700">
                  <input v-model="versionForm.can_escalate_to_human" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                  Can escalate to a human
                </label>
                <label class="flex items-center gap-3 text-sm text-slate-700">
                  <input v-model="versionForm.can_close_unqualified" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                  Can close unqualified leads
                </label>
              </fieldset>

              <fieldset class="panel-muted space-y-4">
                <legend class="form-label">AI Configuration</legend>
                <div class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label class="form-label">Model</label>
                    <select v-model="versionForm.model" class="select">
                      <option value="">Default</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="claude-sonnet-4-20250514">Claude Sonnet</option>
                      <option value="claude-haiku-4-5-20251001">Claude Haiku</option>
                    </select>
                  </div>
                  <div>
                    <label class="form-label">Temperature</label>
                    <input v-model.number="versionForm.temperature" type="number" min="0" max="2" step="0.1" class="input" />
                  </div>
                </div>
              </fieldset>
            </div>

            <fieldset class="panel-muted space-y-4">
              <legend class="form-label">Qualification Rules</legend>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="(field, index) in versionForm.required_fields"
                  :key="`${field}-${index}`"
                  class="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium text-slate-700"
                  style="border-color: rgba(17,17,17,0.08); background: rgba(255,255,255,0.92);"
                >
                  {{ field }}
                  <button type="button" class="ml-1 text-slate-400 hover:text-red-500" @click="versionForm.required_fields.splice(index, 1)">&times;</button>
                </span>
              </div>
              <div class="flex gap-2">
                <input
                  v-model="newRequiredField"
                  type="text"
                  placeholder="e.g. budget, timeline"
                  class="input flex-1"
                  @keydown.enter.prevent="addRequiredField"
                />
                <button type="button" class="button-secondary" @click="addRequiredField">Add</button>
              </div>
            </fieldset>
          </section>

          <section class="panel space-y-4">
            <div>
              <div class="page-kicker">Version History</div>
              <h2 class="section-title mt-3">Prompt timeline</h2>
              <p class="section-copy mt-2">Older versions stay available to compare or reactivate.</p>
            </div>

            <div v-if="versionsLoading" class="note-box">Loading versions...</div>
            <div v-else-if="versions.length === 0" class="note-box">No versions yet.</div>
            <div v-if="versionSuccess" class="feedback-success">{{ versionSuccess }}</div>
            <div v-if="versionError" class="feedback-error">{{ versionError }}</div>
            <div v-else class="space-y-2">
              <div
                v-for="ver in versions"
                :key="ver.id"
                class="flex flex-col gap-3 rounded-[16px] border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                :style="ver.is_active
                  ? 'border-color: rgba(22,163,74,0.2); background: rgba(22,163,74,0.04);'
                  : 'border-color: rgba(17,17,17,0.06); background: rgba(251,251,249,0.94);'"
              >
                <div>
                  <div class="flex items-center gap-3">
                    <span class="text-sm font-semibold text-slate-900">Version {{ ver.version_number }}</span>
                    <span v-if="ver.is_active" class="badge bg-emerald-50 text-emerald-700">active</span>
                    <span v-else class="badge bg-slate-100 text-slate-600">inactive</span>
                  </div>
                  <div class="mt-2 text-xs text-slate-500">{{ formatDate(ver.created_at) }}</div>
                </div>
                <button
                  v-if="!ver.is_active"
                  class="button-secondary px-3 py-2 text-xs"
                  @click="activateVersion(ver)"
                >
                  Activate
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside class="space-y-6">
          <section class="panel-muted space-y-4">
            <div>
              <div class="page-kicker">Routing</div>
              <h2 class="section-title mt-3">Traffic allocation</h2>
              <p class="section-copy mt-2">Adjust how much of this campaign’s traffic reaches this agent.</p>
            </div>

            <div>
              <label class="form-label">Split Test Weight</label>
              <input v-model.number="editForm.weight" type="number" min="1" max="1000" class="input" />
            </div>

            <div class="overflow-hidden rounded-full" style="background: rgba(17,17,17,0.06);">
              <div
                class="flex h-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                :style="{ width: Math.max(weightPercent, 8) + '%', background: '#111' }"
              >
                {{ weightPercent }}%
              </div>
            </div>
            <p class="form-help -mt-1">Current share of traffic inside {{ agent.campaign_name }}.</p>
          </section>

          <section class="panel-muted space-y-4">
            <div>
              <div class="page-kicker">Snapshot</div>
              <h2 class="section-title mt-3">At a glance</h2>
            </div>
            <div class="grid gap-3">
              <div class="stat-card">
                <div class="stat-label">Campaign</div>
                <div class="stat-value text-[1.3rem]">{{ agent.campaign_name }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Prompt Versions</div>
                <div class="stat-value text-[1.3rem]">{{ versions.length }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Updated</div>
                <div class="stat-meta !mt-2">{{ formatDate(agent.updated_at) }}</div>
              </div>
            </div>
          </section>

          <section v-if="versionForm.can_book" class="panel-muted space-y-4">
            <div>
              <div class="page-kicker">Booking</div>
              <h2 class="section-title mt-3">Calendar Assignments</h2>
              <p class="section-copy mt-2">Calendars are now assigned at the campaign level.</p>
            </div>
            <div class="note-box text-xs">
              Manage calendar assignments from the <a :href="agent?.campaign_id ? `/campaigns/${agent.campaign_id}` : '/campaigns'" class="text-teal-700 hover:text-teal-800 font-medium">Campaign detail page</a>.
            </div>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

const props = defineProps<{ agentId: string }>();

const API_BASE = '/api';

interface AgentRecord {
  id: string;
  campaign_id: string;
  campaign_name: string;
  name: string;
  description: string | null;
  weight: number;
  status: string;
  active_version_number: number | null;
  created_at: string;
  updated_at: string;
}

interface VersionRecord {
  id: string;
  agent_id: string;
  version_number: number;
  prompt_text: string;
  system_rules_json: Record<string, unknown> | null;
  reply_cadence_json: Record<string, unknown> | null;
  allowed_actions_json: Record<string, unknown> | null;
  qualification_rules_json: Record<string, unknown> | null;
  config_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

interface PromptFields {
  prompt_text: string;
  tone: string;
  max_message_length: number;
  reply_delay_seconds: number;
  followup_delay_seconds: number;
  max_followups: number;
  can_book: boolean;
  can_escalate_to_human: boolean;
  can_close_unqualified: boolean;
  required_fields: string[];
  model: string;
  temperature: number;
}

const DEFAULT_PROMPT_FIELDS: PromptFields = {
  prompt_text: '',
  tone: 'friendly',
  max_message_length: 160,
  reply_delay_seconds: 30,
  followup_delay_seconds: 3600,
  max_followups: 5,
  can_book: true,
  can_escalate_to_human: true,
  can_close_unqualified: false,
  required_fields: [],
  model: '',
  temperature: 0.7,
};

const loading = ref(true);
const agent = ref<AgentRecord | null>(null);
const allCampaignAgents = ref<AgentRecord[]>([]);
const inlineEdit = ref<'name' | 'description' | 'status' | null>(null);

const editForm = ref({ name: '', description: '', weight: 100, status: 'active' });
const editLoading = ref(false);
const editError = ref('');
const editSuccess = ref('');

const versions = ref<VersionRecord[]>([]);
const versionsLoading = ref(false);

const versionForm = ref<PromptFields>(structuredClone(DEFAULT_PROMPT_FIELDS));
const versionError = ref('');
const versionSuccess = ref('');
const newRequiredField = ref('');
let editPromptSnapshot = '';

// Calendar assignments
interface CalendarRecord {
  id: string;
  name: string;
  status: string;
  settings_json?: Record<string, unknown>;
}

function calLabel(cal: CalendarRecord): string {
  const label = cal.settings_json?.label;
  return typeof label === 'string' && label ? label : cal.name;
}

const workspaceCalendars = ref<CalendarRecord[]>([]);
const assignedCalendarIds = ref<Set<string>>(new Set());
const calendarsLoading = ref(false);
const calendarToggling = ref<string | null>(null);
const calendarAssignSuccess = ref('');
const calendarAssignError = ref('');

let workspaceId: string | null = null;

const totalCampaignWeight = computed(() => allCampaignAgents.value.reduce((sum, item) => sum + item.weight, 0));
const weightPercent = computed(() => {
  if (!agent.value || totalCampaignWeight.value === 0) return 0;
  const adjustedTotal = totalCampaignWeight.value - agent.value.weight + editForm.value.weight;
  if (adjustedTotal <= 0) return 0;
  return Math.round((editForm.value.weight / adjustedTotal) * 100);
});
const activeVersion = computed(() => versions.value.find((ver) => ver.is_active) ?? null);

function normalizeVersion(version?: VersionRecord | null): PromptFields {
  if (!version) return structuredClone(DEFAULT_PROMPT_FIELDS);

  const systemRules = (version.system_rules_json ?? {}) as Record<string, unknown>;
  const cadence = (version.reply_cadence_json ?? {}) as Record<string, unknown>;
  const actions = (version.allowed_actions_json ?? {}) as Record<string, unknown>;
  const qualificationRules = (version.qualification_rules_json ?? {}) as Record<string, unknown>;
  const config = (version.config_json ?? {}) as Record<string, unknown>;
  const requiredFields = qualificationRules.required_fields;

  return {
    prompt_text: version.prompt_text ?? '',
    tone: String(systemRules.tone ?? 'friendly'),
    max_message_length: Number(systemRules.max_message_length ?? 160),
    reply_delay_seconds: cadence.reply_delay_seconds !== undefined
      ? Number(cadence.reply_delay_seconds)
      : (Number(cadence.coalesce_window_seconds) || 0) + (Number(cadence.initial_delay_seconds) || 30),
    followup_delay_seconds: Number(cadence.followup_delay_seconds ?? 3600),
    max_followups: Number(cadence.max_followups ?? 5),
    can_book: Boolean(actions.can_book ?? true),
    can_escalate_to_human: Boolean(actions.can_escalate_to_human ?? true),
    can_close_unqualified: Boolean(actions.can_close_unqualified ?? false),
    required_fields: Array.isArray(requiredFields) ? requiredFields.filter((field): field is string => typeof field === 'string') : [],
    model: String(config.model ?? ''),
    temperature: Number(config.temperature ?? 0.7),
  };
}

function syncPromptFormFromActiveVersion() {
  versionForm.value = normalizeVersion(activeVersion.value);
  editPromptSnapshot = promptFingerprint(versionForm.value);
}

function promptFingerprint(fields: PromptFields): string {
  return JSON.stringify({
    prompt_text: fields.prompt_text,
    tone: fields.tone,
    max_message_length: fields.max_message_length,
    reply_delay_seconds: fields.reply_delay_seconds,
    followup_delay_seconds: fields.followup_delay_seconds,
    max_followups: fields.max_followups,
    can_book: fields.can_book,
    can_escalate_to_human: fields.can_escalate_to_human,
    can_close_unqualified: fields.can_close_unqualified,
    required_fields: fields.required_fields,
    model: fields.model,
    temperature: fields.temperature,
  });
}

function buildVersionPayload(fields: PromptFields) {
  return {
    prompt_text: fields.prompt_text,
    system_rules_json: {
      tone: fields.tone,
      max_message_length: fields.max_message_length,
    },
    reply_cadence_json: {
      reply_delay_seconds: fields.reply_delay_seconds,
      followup_delay_seconds: fields.followup_delay_seconds,
      max_followups: fields.max_followups,
    },
    allowed_actions_json: {
      can_book: fields.can_book,
      can_escalate_to_human: fields.can_escalate_to_human,
      can_close_unqualified: fields.can_close_unqualified,
    },
    qualification_rules_json: {
      required_fields: fields.required_fields,
    },
    config_json: {
      ...(fields.model ? { model: fields.model } : {}),
      temperature: fields.temperature,
    },
  };
}

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

async function fetchAgent() {
  if (!workspaceId) return;

  try {
    const params = new URLSearchParams({ workspace_id: workspaceId });
    const res = await fetch(`${API_BASE}/api-agents-workspace-list?${params}`);
    if (!res.ok) return;

    const allAgents: AgentRecord[] = await res.json();
    const found = allAgents.find((item) => item.id === props.agentId);
    if (!found) return;

    agent.value = found;
    editForm.value = {
      name: found.name,
      description: found.description ?? '',
      weight: found.weight,
      status: found.status,
    };

    allCampaignAgents.value = allAgents.filter((item) => item.campaign_id === found.campaign_id);
    await fetchVersions();
  } finally {
    loading.value = false;
  }
}

async function fetchVersions() {
  if (!agent.value) return;

  versionsLoading.value = true;
  try {
    const params = new URLSearchParams({ agent_id: agent.value.id });
    const res = await fetch(`${API_BASE}/api-agent-versions-list?${params}`);
    if (res.ok) {
      versions.value = await res.json();
      syncPromptFormFromActiveVersion();
    }
  } finally {
    versionsLoading.value = false;
  }
}

async function updateAgent() {
  if (!agent.value) return;

  editError.value = '';
  editSuccess.value = '';
  versionError.value = '';
  editLoading.value = true;

  try {
    const res = await fetch(`${API_BASE}/api-agents-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agent.value.id,
        name: editForm.value.name,
        description: editForm.value.description || null,
        weight: editForm.value.weight,
        status: editForm.value.status,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      editError.value = data.error || 'Failed to update agent';
      return;
    }

    const currentFingerprint = promptFingerprint(versionForm.value);
    let versionCreated = false;

    if (currentFingerprint !== editPromptSnapshot) {
      if (!versionForm.value.prompt_text.trim()) {
        editError.value = 'Prompt text is required to publish a version.';
        await fetchAgent();
        return;
      }

      const versionPayload = buildVersionPayload(versionForm.value);
      const versionRes = await fetch(`${API_BASE}/api-agent-versions-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.value.id, ...versionPayload }),
      });

      if (!versionRes.ok) {
        const versionData = await versionRes.json();
        editError.value = `Agent updated but new version failed: ${versionData.error || 'Unknown error'}`;
        await fetchAgent();
        return;
      }

      versionCreated = true;
    }

    editSuccess.value = versionCreated ? 'Agent updated. New version created.' : 'Agent updated.';
    inlineEdit.value = null;
    await fetchAgent();
  } catch {
    editError.value = 'Network error. Please try again.';
  } finally {
    editLoading.value = false;
  }
}

async function archiveAgent() {
  const previousStatus = editForm.value.status;
  editForm.value.status = 'archived';
  await updateAgent();
  if (editError.value) editForm.value.status = previousStatus;
}

async function activateVersion(version: VersionRecord) {
  if (!agent.value) return;

  versionError.value = '';
  versionSuccess.value = '';

  try {
    const res = await fetch(`${API_BASE}/api-agent-versions-activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agent.value.id, version_id: version.id }),
    });

    const data = await res.json();
    if (!res.ok) {
      versionError.value = data.error || 'Failed to activate version';
      return;
    }

    versionSuccess.value = `Version ${version.version_number} activated.`;
    await fetchAgent();
  } catch {
    versionError.value = 'Network error. Please try again.';
  }
}

function addRequiredField() {
  const value = newRequiredField.value.trim();
  if (!value) return;
  if (!versionForm.value.required_fields.includes(value)) {
    versionForm.value.required_fields.push(value);
  }
  newRequiredField.value = '';
}

async function fetchCalendars() {
  if (!workspaceId || !agent.value) return;
  calendarsLoading.value = true;

  try {
    const wsParams = new URLSearchParams({ workspace_id: workspaceId });
    const agentParams = new URLSearchParams({ workspace_id: workspaceId, agent_id: agent.value.id });

    const [wsRes, agentRes] = await Promise.all([
      fetch(`${API_BASE}/api-calendars-list?${wsParams}`),
      fetch(`${API_BASE}/api-agent-calendars-list?${agentParams}`),
    ]);

    if (wsRes.ok) {
      workspaceCalendars.value = await wsRes.json();
    }
    if (agentRes.ok) {
      const assigned: CalendarRecord[] = await agentRes.json();
      assignedCalendarIds.value = new Set(assigned.map((c) => c.id));
    }
  } finally {
    calendarsLoading.value = false;
  }
}

async function toggleCalendarAssignment(calendarId: string, checked: boolean) {
  if (!workspaceId || !agent.value) return;
  calendarToggling.value = calendarId;
  calendarAssignSuccess.value = '';
  calendarAssignError.value = '';

  try {
    if (checked) {
      const res = await fetch(`${API_BASE}/api-agent-calendars-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          agent_id: agent.value.id,
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
      const res = await fetch(`${API_BASE}/api-agent-calendars-remove`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          agent_id: agent.value.id,
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

onMounted(async () => {
  const session = await getSessionContext();
  workspaceId = session.workspaceId;
  await fetchAgent();
  await fetchCalendars();
});
</script>
