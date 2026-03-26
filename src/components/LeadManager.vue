<template>
  <div class="flex gap-4" style="height: calc(100vh - 220px); min-height: 400px;">
    <!-- Left: Lead list -->
    <div class="w-[400px] shrink-0 bg-surface border border-slate-700 rounded-lg overflow-hidden flex flex-col">
      <!-- Search -->
      <div class="p-3 border-b border-slate-700">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search leads..."
          class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          @input="debouncedSearch"
        />
      </div>

      <!-- List -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="listLoading" class="flex items-center justify-center h-full text-slate-400 text-sm">
          Loading...
        </div>
        <div v-else-if="leads.length === 0" class="flex items-center justify-center h-full text-slate-400 text-sm p-6 text-center">
          No leads found. Add your first lead using the form.
        </div>
        <div
          v-for="lead in leads"
          :key="lead.id"
          class="flex flex-col gap-0.5 px-4 py-3 border-b border-slate-700 cursor-pointer transition-colors hover:bg-surface-hover"
          :class="{ 'bg-surface-hover border-l-[3px] border-l-blue-500': selectedLead?.id === lead.id }"
          @click="selectedLead = lead"
        >
          <div class="flex justify-between items-center">
            <span class="font-semibold text-sm text-slate-100">{{ lead.first_name }} {{ lead.last_name }}</span>
            <span class="text-[11px] text-slate-400">{{ relativeTime(lead.created_at) }}</span>
          </div>
          <div class="text-[13px] text-slate-400">{{ lead.phone_e164 }}</div>
          <div v-if="lead.email" class="text-[12px] text-slate-500">{{ lead.email }}</div>
        </div>
      </div>
    </div>

    <!-- Right: Add/Detail panel -->
    <div class="flex-1 bg-surface border border-slate-700 rounded-lg overflow-hidden flex flex-col">
      <!-- Tab bar -->
      <div class="flex border-b border-slate-700 shrink-0">
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          :class="activeTab === 'add' ? 'text-blue-400 border-b-2 border-blue-500 bg-surface-hover' : 'text-slate-400 hover:text-slate-200'"
          @click="activeTab = 'add'"
        >
          Add Lead
        </button>
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          :class="activeTab === 'detail' ? 'text-blue-400 border-b-2 border-blue-500 bg-surface-hover' : 'text-slate-400 hover:text-slate-200'"
          :disabled="!selectedLead"
          @click="activeTab = 'detail'"
        >
          Lead Detail
        </button>
      </div>

      <!-- Add Lead Form -->
      <div v-if="activeTab === 'add'" class="flex-1 overflow-y-auto p-6">
        <form @submit.prevent="createLead" class="max-w-md space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Phone Number *</label>
            <input
              v-model="form.phone"
              type="tel"
              required
              placeholder="+1 (555) 123-4567"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            <p class="text-[12px] text-slate-500 mt-1">US numbers can omit country code</p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">First Name *</label>
              <input
                v-model="form.first_name"
                type="text"
                required
                placeholder="Jane"
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Last Name</label>
              <input
                v-model="form.last_name"
                type="text"
                placeholder="Doe"
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              v-model="form.email"
              type="email"
              placeholder="jane@example.com"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div class="relative" ref="timezoneContainerRef">
            <label class="block text-sm font-medium text-slate-300 mb-1">Timezone</label>
            <input
              v-model="timezoneSearch"
              type="text"
              placeholder="Search timezones..."
              autocomplete="off"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              @focus="showTimezoneDropdown = true"
              @input="onTimezoneInput"
            />
            <div v-if="form.timezone && !showTimezoneDropdown" class="text-[12px] text-slate-400 mt-1">
              Selected: {{ form.timezone }}
            </div>
            <div
              v-if="showTimezoneDropdown && filteredTimezones.length > 0"
              class="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-lg"
            >
              <div
                v-for="tz in filteredTimezones"
                :key="tz"
                class="px-3 py-2 text-sm text-slate-200 cursor-pointer hover:bg-slate-700 transition-colors"
                :class="{ 'bg-slate-800 text-blue-400': form.timezone === tz }"
                @mousedown.prevent="selectTimezone(tz)"
              >
                {{ tz }}
              </div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">External Contact ID</label>
            <input
              v-model="form.external_contact_id"
              type="text"
              placeholder="CRM contact ID (optional)"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

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
            {{ formLoading ? 'Creating...' : 'Add Lead' }}
          </button>
        </form>
      </div>

      <!-- Lead Detail -->
      <div v-else-if="activeTab === 'detail'" class="flex-1 overflow-y-auto p-6">
        <div v-if="!selectedLead" class="flex items-center justify-center h-full text-slate-400 text-sm">
          Select a lead from the list to view details
        </div>
        <div v-else class="max-w-md space-y-4">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-lg">
              {{ selectedLead.first_name[0] }}{{ (selectedLead.last_name || '')[0] || '' }}
            </div>
            <div>
              <div class="text-lg font-semibold">{{ selectedLead.first_name }} {{ selectedLead.last_name }}</div>
              <div class="text-sm text-slate-400">{{ selectedLead.phone_e164 }}</div>
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex justify-between py-2 border-b border-slate-700">
              <span class="text-sm text-slate-400">Email</span>
              <span class="text-sm text-slate-200">{{ selectedLead.email || 'Not provided' }}</span>
            </div>
            <div class="flex justify-between py-2 border-b border-slate-700">
              <span class="text-sm text-slate-400">Timezone</span>
              <span class="text-sm text-slate-200">{{ selectedLead.timezone || 'Not set' }}</span>
            </div>
            <div class="flex justify-between py-2 border-b border-slate-700">
              <span class="text-sm text-slate-400">External ID</span>
              <span class="text-sm text-slate-200">{{ selectedLead.external_contact_id || 'None' }}</span>
            </div>
            <div class="flex justify-between py-2 border-b border-slate-700">
              <span class="text-sm text-slate-400">Status</span>
              <span class="text-[12px] px-2 py-0.5 rounded-full font-medium bg-green-500/15 text-green-400">{{ selectedLead.status }}</span>
            </div>
            <div class="flex justify-between py-2 border-b border-slate-700">
              <span class="text-sm text-slate-400">Opted Out</span>
              <span class="text-sm" :class="selectedLead.opted_out ? 'text-red-400' : 'text-green-400'">{{ selectedLead.opted_out ? 'Yes' : 'No' }}</span>
            </div>
            <div class="flex justify-between py-2 border-b border-slate-700">
              <span class="text-sm text-slate-400">Created</span>
              <span class="text-sm text-slate-200">{{ formatDate(selectedLead.created_at) }}</span>
            </div>
          </div>

          <!-- Start conversation button -->
          <button
            class="w-full mt-4 py-2.5 rounded-lg text-sm font-medium bg-green-500 text-slate-900 hover:bg-green-400 disabled:opacity-50 transition-colors"
            :disabled="startConvLoading"
            @click="startConversation"
          >
            {{ startConvLoading ? 'Starting...' : 'Start Conversation' }}
          </button>
          <div v-if="startConvError" class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
            {{ startConvError }}
          </div>
          <div v-if="startConvSuccess" class="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-lg">
            {{ startConvSuccess }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { getPublicSupabaseClient, getSessionContext } from '@lib/config/public-client';

const API_BASE = '/api';
const supabase = getPublicSupabaseClient();

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
let campaignId: string | null = null;
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function resolveWorkspace(): string | null {
  const { workspaceId } = getSessionContext();
  return workspaceId || null;
}

async function resolveDefaultCampaign(): Promise<string | null> {
  if (!workspaceId) return null;
  const { data } = await supabase
    .from('campaigns')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return data?.id ?? null;
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

  if (!campaignId) {
    campaignId = await resolveDefaultCampaign();
    if (!campaignId) {
      startConvError.value = 'No active campaign found. Create a campaign first.';
      return;
    }
  }

  startConvLoading.value = true;

  try {
    const res = await fetch(`${API_BASE}/webhook-start-conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        campaign_id: campaignId,
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
  await fetchLeads();
  listLoading.value = false;
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutsideTimezone);
});
</script>
