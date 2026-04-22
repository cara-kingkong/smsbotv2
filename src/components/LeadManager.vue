<template>
  <div class="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]" style="height: calc(100vh - 220px); min-height: 520px;">
    <aside class="panel flex min-h-0 flex-col overflow-hidden p-0">
      <div class="border-b px-5 py-5" style="border-color: rgba(17,17,17,0.06);">
        <div class="page-kicker">Lead Directory</div>
        <h2 class="section-title mt-3">Recent leads</h2>
        <p class="section-copy mt-2">Search, review, and open a lead to start a conversation.</p>
      </div>

      <div class="border-b px-4 py-4" style="border-color: rgba(17,17,17,0.06);">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search leads..."
          class="input"
          @input="debouncedSearch"
        />
      </div>

      <div class="flex-1 overflow-y-auto px-3 py-3">
        <div v-if="listLoading" class="space-y-2 p-1">
          <div v-for="i in 5" :key="i" class="skeleton-row"></div>
        </div>
        <div v-else-if="leads.length === 0" class="empty-state min-h-full">
          No leads found. Add your first lead using the form.
        </div>
        <div v-else class="space-y-2">
          <button
            v-for="lead in leads"
            :key="lead.id"
            type="button"
            class="list-card text-left"
            :class="selectedLead?.id === lead.id ? 'list-card-active' : ''"
            @click="selectedLead = lead; activeTab = 'detail'"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="text-sm font-semibold text-slate-900 truncate">{{ lead.first_name }} {{ lead.last_name }}</div>
                <div class="mt-1 text-xs text-slate-500">{{ lead.phone_e164 }}</div>
                <div v-if="lead.email" class="mt-1 truncate text-xs text-slate-400">{{ lead.email }}</div>
              </div>
              <span class="shrink-0 text-[11px] text-slate-400">{{ relativeTime(lead.created_at) }}</span>
            </div>
          </button>
        </div>
      </div>
    </aside>

    <section class="panel flex min-h-0 flex-col overflow-hidden p-0">
      <div class="border-b px-5 py-4" style="border-color: rgba(17,17,17,0.06);">
        <div class="flex flex-wrap gap-2">
          <button
            class="pill-tab"
            :class="activeTab === 'add' ? 'pill-tab-active' : ''"
            @click="activeTab = 'add'"
          >
            Add Lead
          </button>
          <button
            class="pill-tab"
            :class="activeTab === 'detail' ? 'pill-tab-active' : ''"
            :disabled="!selectedLead"
            @click="activeTab = 'detail'"
          >
            Lead Detail
          </button>
        </div>
      </div>

      <div v-if="activeTab === 'add'" class="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
        <form @submit.prevent="createLead" class="w-full space-y-5">
          <div>
            <label class="form-label">Phone Number *</label>
            <input
              v-model="form.phone"
              type="tel"
              required
              placeholder="+1 (555) 123-4567"
              class="input"
            />
            <p class="form-help">US numbers can omit the country code.</p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="form-label">First Name *</label>
              <input
                v-model="form.first_name"
                type="text"
                required
                placeholder="Jane"
                class="input"
              />
            </div>
            <div>
              <label class="form-label">Last Name</label>
              <input
                v-model="form.last_name"
                type="text"
                placeholder="Doe"
                class="input"
              />
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="form-label">Email</label>
              <input
                v-model="form.email"
                type="email"
                placeholder="jane@example.com"
                class="input"
              />
            </div>

            <div class="relative" ref="timezoneContainerRef">
              <label class="form-label">Timezone</label>
              <input
                v-model="timezoneSearch"
                type="text"
                placeholder="Search timezones..."
                autocomplete="off"
                class="input"
                @focus="showTimezoneDropdown = true"
                @input="onTimezoneInput"
              />
              <div v-if="form.timezone && !showTimezoneDropdown" class="form-help mt-2">
                Selected: {{ form.timezone }}
              </div>
              <div
                v-if="showTimezoneDropdown && filteredTimezones.length > 0"
                class="absolute z-50 mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border bg-white shadow-lg"
                style="border-color: rgba(17,17,17,0.08);"
              >
                <button
                  v-for="tz in filteredTimezones"
                  :key="tz"
                  type="button"
                  class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                  :class="form.timezone === tz ? 'bg-slate-50 text-slate-900' : ''"
                  @mousedown.prevent="selectTimezone(tz)"
                >
                  {{ tz }}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label class="form-label">External Contact ID</label>
            <input
              v-model="form.external_contact_id"
              type="text"
              placeholder="CRM contact ID (optional)"
              class="input"
            />
          </div>

          <div v-if="formSuccess" class="feedback-success">{{ formSuccess }}</div>
          <div v-if="formError" class="feedback-error">{{ formError }}</div>

          <button type="submit" :disabled="formLoading" class="button-primary">
            {{ formLoading ? 'Creating...' : 'Add Lead' }}
          </button>
        </form>
      </div>

      <div v-else class="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
        <div v-if="!selectedLead" class="empty-state min-h-full">Select a lead from the list to view details.</div>
        <div v-else class="w-full space-y-6">
          <div class="flex items-center gap-4">
            <div class="flex h-14 w-14 items-center justify-center rounded-[20px] bg-teal-100 text-lg font-bold text-teal-700">
              {{ selectedLead.first_name[0] }}{{ (selectedLead.last_name || '')[0] || '' }}
            </div>
            <div>
              <div class="text-lg font-semibold text-slate-900">{{ selectedLead.first_name }} {{ selectedLead.last_name }}</div>
              <div class="mt-1 text-sm text-slate-500">{{ selectedLead.phone_e164 }}</div>
            </div>
          </div>

          <div class="grid gap-3">
            <div class="flex items-center justify-between rounded-2xl border px-4 py-3" style="border-color: rgba(17,17,17,0.06);">
              <span class="text-sm text-slate-500">Email</span>
              <span class="text-sm font-medium text-slate-900">{{ selectedLead.email || 'Not provided' }}</span>
            </div>
            <div class="flex items-center justify-between rounded-2xl border px-4 py-3" style="border-color: rgba(17,17,17,0.06);">
              <span class="text-sm text-slate-500">Timezone</span>
              <span class="text-sm font-medium text-slate-900">{{ selectedLead.timezone || 'Not set' }}</span>
            </div>
            <div class="flex items-center justify-between rounded-2xl border px-4 py-3" style="border-color: rgba(17,17,17,0.06);">
              <span class="text-sm text-slate-500">External ID</span>
              <span class="text-sm font-medium text-slate-900">{{ selectedLead.external_contact_id || 'None' }}</span>
            </div>
            <div class="flex items-center justify-between rounded-2xl border px-4 py-3" style="border-color: rgba(17,17,17,0.06);">
              <span class="text-sm text-slate-500">Status</span>
              <span class="badge bg-emerald-50 text-emerald-700">{{ selectedLead.status }}</span>
            </div>
            <div class="flex items-center justify-between rounded-2xl border px-4 py-3" style="border-color: rgba(17,17,17,0.06);">
              <span class="text-sm text-slate-500">Opted Out</span>
              <span class="text-sm font-medium" :class="selectedLead.opted_out ? 'text-red-600' : 'text-emerald-700'">{{ selectedLead.opted_out ? 'Yes' : 'No' }}</span>
            </div>
            <div class="flex items-center justify-between rounded-2xl border px-4 py-3" style="border-color: rgba(17,17,17,0.06);">
              <span class="text-sm text-slate-500">Created</span>
              <span class="text-sm font-medium text-slate-900">{{ formatDate(selectedLead.created_at) }}</span>
            </div>
          </div>

          <div class="space-y-3">
            <div>
              <label class="form-label">Campaign</label>
              <select
                v-if="campaigns.length > 0"
                v-model="selectedCampaignId"
                class="input"
              >
                <option value="" disabled>Select a campaign...</option>
                <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <p v-else class="text-sm text-slate-500">
                No active campaigns found.
                <a href="/campaigns" class="text-teal-700 hover:text-teal-800 font-medium">Create one</a>
              </p>
            </div>

            <button
              class="button-primary"
              :disabled="startConvLoading || !selectedCampaignId || !canStartConversation"
              @click="startConversation"
            >
              {{ startConvLoading ? 'Starting...' : 'Start Conversation' }}
            </button>
            <p v-if="!canStartConversation" class="form-help text-amber-700">
              This lead is missing {{ missingLeadFields }}. Add it before starting a conversation.
            </p>
          </div>
          <div v-if="startConvError" class="feedback-error">{{ startConvError }}</div>
          <div v-if="startConvSuccess" class="feedback-success">{{ startConvSuccess }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

const API_BASE = '/api';

interface LeadRecord {
  id: string;
  workspace_id: string;
  first_name: string;
  last_name: string;
  phone_e164: string;
  email: string | null;
  timezone: string | null;
  external_contact_id: string | null;
  status: string;
  opted_out: boolean;
  source_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const leads = ref<LeadRecord[]>([]);
const listLoading = ref(true);
const searchQuery = ref('');
const selectedLead = ref<LeadRecord | null>(null);
const activeTab = ref<'add' | 'detail'>('add');

const form = ref({
  phone: '',
  first_name: '',
  last_name: '',
  email: '',
  timezone: '',
  external_contact_id: '',
});
const formLoading = ref(false);
const formError = ref('');
const formSuccess = ref('');

const startConvLoading = ref(false);
const startConvError = ref('');
const startConvSuccess = ref('');

interface CampaignOption {
  id: string;
  name: string;
  status: string;
}
const campaigns = ref<CampaignOption[]>([]);
const selectedCampaignId = ref<string>('');

const canStartConversation = computed(() => {
  const lead = selectedLead.value;
  if (!lead) return false;
  return Boolean(lead.email && lead.timezone);
});

const missingLeadFields = computed(() => {
  const lead = selectedLead.value;
  if (!lead) return '';
  const missing: string[] = [];
  if (!lead.email) missing.push('an email');
  if (!lead.timezone) missing.push('a timezone');
  return missing.join(' and ');
});

// Timezone combobox state
const allTimezones: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    // Fallback for older browsers
    return [
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix', 'America/Toronto',
      'America/Vancouver', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
      'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
      'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland',
      'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos',
    ];
  }
})();
const timezoneSearch = ref('');
const showTimezoneDropdown = ref(false);
const timezoneContainerRef = ref<HTMLElement | null>(null);

const filteredTimezones = computed(() => {
  const query = timezoneSearch.value.toLowerCase().trim();
  if (!query) return allTimezones.slice(0, 50);
  return allTimezones.filter(tz => tz.toLowerCase().includes(query)).slice(0, 50);
});

function onTimezoneInput() {
  showTimezoneDropdown.value = true;
  // Clear selection if the user edits the search after selecting
  if (form.value.timezone && timezoneSearch.value !== form.value.timezone) {
    form.value.timezone = '';
  }
}

function selectTimezone(tz: string) {
  form.value.timezone = tz;
  timezoneSearch.value = tz;
  showTimezoneDropdown.value = false;
}

function handleClickOutsideTimezone(e: MouseEvent) {
  if (timezoneContainerRef.value && !timezoneContainerRef.value.contains(e.target as Node)) {
    showTimezoneDropdown.value = false;
    // Restore display to selected value if user didn't pick anything
    if (form.value.timezone) {
      timezoneSearch.value = form.value.timezone;
    }
  }
}

let workspaceId: string | null = null;
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function resolveWorkspace(): string | null {
  const { workspaceId } = getSessionContext();
  return workspaceId || null;
}

async function fetchCampaigns() {
  if (!workspaceId) return;
  const params = new URLSearchParams({ workspace_id: workspaceId, status: 'active' });
  const res = await fetch(`${API_BASE}/api-campaigns-list?${params}`);
  if (res.ok) {
    campaigns.value = await res.json();
    if (campaigns.value.length === 1) {
      selectedCampaignId.value = campaigns.value[0].id;
    }
  }
}

async function fetchLeads() {
  if (!workspaceId) return;
  const params = new URLSearchParams({ workspace_id: workspaceId });
  if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim());
  const res = await fetch(`${API_BASE}/api-leads-list?${params}`);
  if (res.ok) leads.value = await res.json();
}

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchLeads(), 300);
}

async function createLead() {
  if (!workspaceId) return;
  formError.value = '';
  formSuccess.value = '';
  formLoading.value = true;

  try {
    const res = await fetch(`${API_BASE}/api-leads-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        phone: form.value.phone,
        first_name: form.value.first_name,
        last_name: form.value.last_name || undefined,
        email: form.value.email || undefined,
        timezone: form.value.timezone || undefined,
        external_contact_id: form.value.external_contact_id || undefined,
        source_metadata: { source: 'manual_entry' },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      formError.value = data.error || 'Failed to create lead';
      return;
    }

    formSuccess.value = `Lead created: ${data.first_name} ${data.last_name || ''} (${data.phone_e164})`;
    form.value = { phone: '', first_name: '', last_name: '', email: '', timezone: '', external_contact_id: '' };
    timezoneSearch.value = '';
    await fetchLeads();
  } catch {
    formError.value = 'Network error. Please try again.';
  } finally {
    formLoading.value = false;
  }
}

async function startConversation() {
  if (!selectedLead.value || !workspaceId) return;
  startConvError.value = '';
  startConvSuccess.value = '';

  if (!selectedCampaignId.value) {
    startConvError.value = 'Please select a campaign first.';
    return;
  }

  startConvLoading.value = true;

  try {
    const res = await fetch(`${API_BASE}/webhook-start-conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        campaign_id: selectedCampaignId.value,
        lead: {
          phone: selectedLead.value.phone_e164,
          first_name: selectedLead.value.first_name,
          last_name: selectedLead.value.last_name,
          email: selectedLead.value.email,
          timezone: selectedLead.value.timezone,
        },
        source_metadata: { source: 'manual_ui' },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      startConvError.value = data.error || 'Failed to start conversation';
      return;
    }

    if (data.message?.includes('already has an active conversation')) {
      startConvSuccess.value = 'Lead already has an active conversation.';
    } else {
      startConvSuccess.value = `Conversation started! ID: ${data.conversation_id}`;
    }
  } catch {
    startConvError.value = 'Network error. Please try again.';
  } finally {
    startConvLoading.value = false;
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
  document.addEventListener('click', handleClickOutsideTimezone);
  workspaceId = resolveWorkspace();
  if (!workspaceId) {
    listLoading.value = false;
    return;
  }
  await Promise.all([fetchLeads(), fetchCampaigns()]);
  listLoading.value = false;
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutsideTimezone);
});
</script>
