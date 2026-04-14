<template>
  <div class="space-y-6">
    <div v-if="loading" class="empty-state min-h-[320px]">Loading calendar status...</div>

    <!-- Not connected state -->
    <template v-else-if="!connected">
      <section class="panel">
        <div class="max-w-lg mx-auto text-center py-8">
          <div class="flex justify-center mb-4">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50">
              <svg class="h-7 w-7 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
          </div>
          <h2 class="section-title text-xl">Connect your calendar</h2>
          <p class="section-copy mt-2 mx-auto max-w-sm">
            When your AI qualifies a lead, it books directly into your Calendly. No manual follow-up needed.
          </p>
        </div>
      </section>

      <section class="panel">
        <div class="max-w-md">
          <h3 class="section-title">Calendly API Key</h3>
          <p class="section-copy mt-1">Enter your Calendly personal access token to enable automatic booking.</p>

          <div class="mt-4 space-y-4">
            <div>
              <label class="form-label">API Key</label>
              <input
                v-model="form.apiKey"
                type="password"
                placeholder="Your Calendly API key"
                class="input"
              />
            </div>
            <div>
              <label class="form-label">Label</label>
              <input
                v-model="form.label"
                type="text"
                placeholder="My Calendly"
                class="input"
              />
            </div>

            <div class="note-box">
              You can find your API key in Calendly under Integrations &gt; API &amp; Webhooks.
            </div>

            <div v-if="saveSuccess" class="feedback-success">{{ saveSuccess }}</div>
            <div v-if="saveError" class="feedback-error">{{ saveError }}</div>

            <button :disabled="saving || !form.apiKey.trim()" class="button-primary w-full" @click="saveCalendly">
              {{ saving ? 'Connecting...' : 'Connect Calendly' }}
            </button>
          </div>
        </div>
      </section>
    </template>

    <!-- Connected state -->
    <template v-else>
      <section class="panel">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="page-kicker">Connected</div>
            <h2 class="section-title mt-2">{{ savedLabel }}</h2>
            <p class="section-copy mt-1">Your Calendly is connected and available for automatic booking.</p>
          </div>
          <span class="badge bg-emerald-50 text-emerald-700">Connected</span>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <div class="stat-card">
            <div class="stat-label">Status</div>
            <div class="mt-2 text-sm font-semibold text-emerald-700">Active</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Provider</div>
            <div class="mt-2 text-sm font-semibold text-slate-900">Calendly</div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h3 class="section-title">Update Connection</h3>
        <p class="section-copy mt-1">Change your API key or label if needed.</p>

        <div class="mt-4 space-y-4 max-w-md">
          <div>
            <label class="form-label">API Key</label>
            <input
              v-model="form.apiKey"
              type="password"
              placeholder="Enter new API key to update"
              class="input"
            />
          </div>
          <div>
            <label class="form-label">Label</label>
            <input
              v-model="form.label"
              type="text"
              :placeholder="savedLabel"
              class="input"
            />
          </div>

          <div v-if="saveSuccess" class="feedback-success">{{ saveSuccess }}</div>
          <div v-if="saveError" class="feedback-error">{{ saveError }}</div>

          <div class="flex gap-3">
            <button :disabled="saving" class="button-primary" @click="saveCalendly">
              {{ saving ? 'Saving...' : 'Update' }}
            </button>
          </div>
        </div>
      </section>

      <!-- Event Types Discovery -->
      <section class="panel">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="page-kicker">Event Types</div>
            <h3 class="section-title mt-2">Available Calendly Event Types</h3>
            <p class="section-copy mt-1">
              Fetch your Calendly event types and import them as bookable calendar targets for your agents.
            </p>
          </div>
          <button
            :disabled="eventTypesLoading"
            class="button-secondary shrink-0"
            @click="fetchEventTypes"
          >
            {{ eventTypesLoading ? 'Fetching...' : 'Fetch Event Types' }}
          </button>
        </div>

        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div class="flex-1">
            <label class="form-label">Search Event Types</label>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search by name..."
              class="input"
              @keydown.enter.prevent="fetchEventTypes"
            />
          </div>
          <label class="flex items-center gap-2 text-sm text-slate-700 pb-1">
            <input
              v-model="includeInactive"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Include inactive
          </label>
        </div>

        <div v-if="eventTypesError" class="mt-4 feedback-error">{{ eventTypesError }}</div>

        <div v-if="eventTypes.length > 0" class="mt-5 space-y-3">
          <div class="text-xs text-slate-500 mb-1">
            Showing {{ (eventTypesPage - 1) * eventTypesPerPage + 1 }}–{{ Math.min(eventTypesPage * eventTypesPerPage, eventTypes.length) }} of {{ eventTypes.length }} event types
          </div>

          <div
            v-for="et in paginatedEventTypes"
            :key="et.uri"
            class="flex flex-col gap-3 rounded-[16px] border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            style="border-color: rgba(17,17,17,0.06); background: rgba(251,251,249,0.94);"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-slate-900">{{ et.name }}</span>
                <span v-if="!et.active" class="badge bg-slate-100 text-slate-600">inactive</span>
              </div>
              <div class="mt-1 text-xs text-slate-500">{{ et.duration }} min</div>
              <div class="mt-1 text-xs text-slate-500 break-all">{{ et.scheduling_url }}</div>
            </div>
            <button
              v-if="!isAlreadyImported(et.uri)"
              class="button-primary px-3 py-2 text-xs shrink-0"
              :disabled="importingUri === et.uri"
              @click="importEventType(et)"
            >
              {{ importingUri === et.uri ? 'Importing...' : 'Import' }}
            </button>
            <span v-else class="badge bg-emerald-50 text-emerald-700 shrink-0">Imported</span>
          </div>

          <!-- Pagination controls -->
          <div v-if="eventTypesTotalPages > 1" class="flex items-center justify-between pt-2">
            <button
              class="button-secondary px-3 py-2 text-xs"
              :disabled="eventTypesPage <= 1"
              @click="eventTypesPage--"
            >
              Previous
            </button>
            <span class="text-xs text-slate-500">
              Page {{ eventTypesPage }} of {{ eventTypesTotalPages }}
            </span>
            <button
              class="button-secondary px-3 py-2 text-xs"
              :disabled="eventTypesPage >= eventTypesTotalPages"
              @click="eventTypesPage++"
            >
              Next
            </button>
          </div>
        </div>

        <div v-else-if="eventTypesFetched && eventTypes.length === 0" class="mt-4 note-box">
          No event types found. Try adjusting your search or enabling inactive types.
        </div>
      </section>

      <!-- Imported Calendar Targets -->
      <section class="panel">
        <div>
          <div class="page-kicker">Calendar Targets</div>
          <h3 class="section-title mt-2">Imported Calendars</h3>
          <p class="section-copy mt-1">
            Manage your bookable calendar targets and set eligibility rules to control which leads can book.
          </p>
        </div>

        <div v-if="calendarsLoading" class="mt-4 note-box">Loading calendars...</div>

        <div v-else-if="calendars.length === 0" class="mt-4 note-box">
          No calendar targets imported yet. Fetch and import event types above.
        </div>

        <div v-else class="mt-5 space-y-4">
          <div
            v-for="cal in calendars"
            :key="cal.id"
            class="rounded-[16px] border px-4 py-4"
            :style="cal.status === 'active'
              ? 'border-color: rgba(22,163,74,0.2); background: rgba(22,163,74,0.04);'
              : 'border-color: rgba(17,17,17,0.06); background: rgba(251,251,249,0.94);'"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-slate-900">{{ calendarLabel(cal) }}</span>
                  <span class="badge" :class="cal.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'">
                    {{ cal.status }}
                  </span>
                </div>
                <div v-if="calendarLabel(cal) !== cal.name" class="mt-1 text-xs text-slate-500">{{ cal.name }}</div>
                <div v-if="cal.booking_url" class="mt-1 text-xs text-slate-500 break-all">{{ cal.booking_url }}</div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  class="button-secondary px-3 py-2 text-xs"
                  @click="toggleRulesEditor(cal.id)"
                >
                  {{ expandedCalendarId === cal.id ? 'Close' : 'Edit' }}
                </button>
                <button
                  v-if="cal.status === 'active'"
                  class="button-ghost px-3 py-2 text-xs text-amber-600"
                  @click="updateCalendarStatus(cal.id, 'paused')"
                >
                  Pause
                </button>
                <button
                  v-if="cal.status === 'paused'"
                  class="button-ghost px-3 py-2 text-xs text-emerald-600"
                  @click="updateCalendarStatus(cal.id, 'active')"
                >
                  Activate
                </button>
                <button
                  class="button-ghost px-3 py-2 text-xs text-red-600"
                  @click="deleteCalendar(cal.id)"
                >
                  Delete
                </button>
              </div>
            </div>

            <!-- Calendar Settings & Eligibility Rules Editor -->
            <div v-if="expandedCalendarId === cal.id" class="mt-4 space-y-4 border-t pt-4" style="border-color: rgba(17,17,17,0.06);">
              <div>
                <label class="form-label">Label</label>
                <p class="form-help mb-2">A friendly display name for this calendar in your dashboard.</p>
                <input
                  v-model="rulesForm.label"
                  type="text"
                  :placeholder="cal.name"
                  class="input"
                />
              </div>

              <div>
                <label class="form-label">Booking Criteria</label>
                <p class="form-help mb-2">Describe when the AI should book a lead into this calendar. The agent will use this to choose the right calendar.</p>
                <textarea
                  v-model="rulesForm.booking_criteria"
                  rows="4"
                  placeholder="e.g. Book into this calendar when the lead has a budget over $3,000 and is interested in consulting services."
                  class="input resize-y"
                ></textarea>
              </div>

              <div v-if="rulesSaveSuccess" class="feedback-success">{{ rulesSaveSuccess }}</div>
              <div v-if="rulesSaveError" class="feedback-error">{{ rulesSaveError }}</div>

              <button
                :disabled="rulesSaving"
                class="button-primary"
                @click="saveRules(cal.id)"
              >
                {{ rulesSaving ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <CalendarEventsPanel />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';
import CalendarEventsPanel from './CalendarEventsPanel.vue';

const API_BASE = '/api';

const loading = ref(true);
const connected = ref(false);
const savedLabel = ref('');
const saving = ref(false);
const saveSuccess = ref('');
const saveError = ref('');

const form = ref({
  apiKey: '',
  label: 'My Calendly',
});

let workspaceId: string | null = null;
let integrationId: string | null = null;

// Event types
interface EventType {
  uri: string;
  name: string;
  slug: string;
  scheduling_url: string;
  duration: number;
  active: boolean;
}

const eventTypes = ref<EventType[]>([]);
const eventTypesLoading = ref(false);
const eventTypesError = ref('');
const eventTypesFetched = ref(false);
const importingUri = ref('');
const searchQuery = ref('');
const includeInactive = ref(false);
const eventTypesPage = ref(1);
const eventTypesPerPage = 5;

const eventTypesTotalPages = computed(() => Math.max(1, Math.ceil(eventTypes.value.length / eventTypesPerPage)));
const paginatedEventTypes = computed(() => {
  const start = (eventTypesPage.value - 1) * eventTypesPerPage;
  return eventTypes.value.slice(start, start + eventTypesPerPage);
});

// Calendar targets
interface CalendarTarget {
  id: string;
  name: string;
  external_calendar_id: string | null;
  booking_url: string | null;
  eligibility_rules_json: Record<string, unknown>;
  settings_json: Record<string, unknown>;
  status: string;
  created_at: string;
}

function calendarLabel(cal: CalendarTarget): string {
  const label = cal.settings_json?.label;
  return typeof label === 'string' && label ? label : cal.name;
}

const calendars = ref<CalendarTarget[]>([]);
const calendarsLoading = ref(false);

// Rules editor
const expandedCalendarId = ref<string | null>(null);
const rulesForm = ref<{
  label: string;
  booking_criteria: string;
}>({
  label: '',
  booking_criteria: '',
});
const rulesSaving = ref(false);
const rulesSaveSuccess = ref('');
const rulesSaveError = ref('');

function isAlreadyImported(uri: string): boolean {
  return calendars.value.some((c) => c.external_calendar_id === uri);
}

function toggleRulesEditor(calendarId: string) {
  if (expandedCalendarId.value === calendarId) {
    expandedCalendarId.value = null;
    return;
  }

  expandedCalendarId.value = calendarId;
  rulesSaveSuccess.value = '';
  rulesSaveError.value = '';

  const cal = calendars.value.find((c) => c.id === calendarId);
  const rules = (cal?.eligibility_rules_json ?? {}) as Record<string, unknown>;
  const settings = (cal?.settings_json ?? {}) as Record<string, unknown>;

  rulesForm.value = {
    label: typeof settings.label === 'string' ? settings.label : '',
    booking_criteria: typeof rules.booking_criteria === 'string' ? rules.booking_criteria : '',
  };
}

async function fetchCalendly() {
  if (!workspaceId) return;
  const params = new URLSearchParams({ workspace_id: workspaceId });
  const res = await fetch(`${API_BASE}/api-integrations-list?${params}`);
  if (!res.ok) return;

  const integrations = await res.json();
  const calendly = integrations.find((i: { provider: string; id: string; name?: string }) => i.provider === 'calendly');

  if (calendly) {
    connected.value = true;
    integrationId = calendly.id;
    savedLabel.value = calendly.name || 'Calendly';
    form.value.label = calendly.name || 'My Calendly';
  }
}

async function fetchCalendars() {
  if (!workspaceId) return;
  calendarsLoading.value = true;
  try {
    const params = new URLSearchParams({ workspace_id: workspaceId });
    const res = await fetch(`${API_BASE}/api-calendars-list?${params}`);
    if (res.ok) {
      calendars.value = await res.json();
    }
  } finally {
    calendarsLoading.value = false;
  }
}

async function saveCalendly() {
  if (!workspaceId) return;
  saving.value = true;
  saveSuccess.value = '';
  saveError.value = '';

  try {
    const res = await fetch(`${API_BASE}/api-integrations-upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        type: 'calendar',
        provider: 'calendly',
        name: form.value.label.trim() || 'Calendly',
        config_json: {
          api_key_ref: form.value.apiKey ? 'CALENDLY_API_KEY' : '',
          configured: !!form.value.apiKey.trim(),
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      saveError.value = data.error || 'Failed to save';
      return;
    }

    connected.value = true;
    integrationId = data.id;
    savedLabel.value = form.value.label.trim() || 'Calendly';
    saveSuccess.value = 'Calendly connected successfully';
  } catch {
    saveError.value = 'Network error. Please try again.';
  } finally {
    saving.value = false;
  }
}

async function fetchEventTypes() {
  if (!workspaceId || !integrationId) return;
  eventTypesLoading.value = true;
  eventTypesError.value = '';

  try {
    const params = new URLSearchParams({
      workspace_id: workspaceId,
      integration_id: integrationId,
    });
    if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim());
    if (includeInactive.value) params.set('include_inactive', 'true');
    const res = await fetch(`${API_BASE}/api-calendars-event-types?${params}`);
    const data = await res.json();

    if (!res.ok) {
      eventTypesError.value = data.error || 'Failed to fetch event types';
      return;
    }

    eventTypes.value = data;
    eventTypesFetched.value = true;
    eventTypesPage.value = 1;
  } catch {
    eventTypesError.value = 'Network error. Please try again.';
  } finally {
    eventTypesLoading.value = false;
  }
}

async function importEventType(et: EventType) {
  if (!workspaceId || !integrationId) return;
  importingUri.value = et.uri;

  try {
    const res = await fetch(`${API_BASE}/api-calendars-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        integration_id: integrationId,
        name: et.name,
        external_calendar_id: et.uri,
        booking_url: et.scheduling_url,
      }),
    });

    if (res.ok) {
      await fetchCalendars();
    }
  } finally {
    importingUri.value = '';
  }
}

async function saveRules(calendarId: string) {
  if (!workspaceId) return;
  rulesSaving.value = true;
  rulesSaveSuccess.value = '';
  rulesSaveError.value = '';

  const rulesPayload: Record<string, unknown> = {
    required_tags: ['qualified'],
  };
  if (rulesForm.value.booking_criteria.trim()) {
    rulesPayload.booking_criteria = rulesForm.value.booking_criteria.trim();
  }

  const settingsPayload: Record<string, unknown> = {};
  if (rulesForm.value.label.trim()) settingsPayload.label = rulesForm.value.label.trim();

  try {
    const res = await fetch(`${API_BASE}/api-calendars-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendar_id: calendarId,
        workspace_id: workspaceId,
        eligibility_rules_json: rulesPayload,
        ...(Object.keys(settingsPayload).length > 0 ? { settings_json: settingsPayload } : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      rulesSaveError.value = data.error || 'Failed to save';
      return;
    }

    rulesSaveSuccess.value = 'Calendar settings saved';
    await fetchCalendars();
  } catch {
    rulesSaveError.value = 'Network error. Please try again.';
  } finally {
    rulesSaving.value = false;
  }
}

async function updateCalendarStatus(calendarId: string, status: string) {
  if (!workspaceId) return;

  try {
    await fetch(`${API_BASE}/api-calendars-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendar_id: calendarId,
        workspace_id: workspaceId,
        status,
      }),
    });
    await fetchCalendars();
  } catch {
    // silent — calendar list will reflect current state
  }
}

async function deleteCalendar(calendarId: string) {
  if (!workspaceId) return;

  try {
    await fetch(`${API_BASE}/api-calendars-delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendar_id: calendarId,
        workspace_id: workspaceId,
      }),
    });
    if (expandedCalendarId.value === calendarId) expandedCalendarId.value = null;
    await fetchCalendars();
  } catch {
    // silent
  }
}

onMounted(async () => {
  const ctx = getSessionContext();
  workspaceId = ctx.workspaceId || null;
  if (!workspaceId) {
    loading.value = false;
    return;
  }
  await fetchCalendly();
  if (connected.value) {
    await fetchCalendars();
  }
  loading.value = false;
});
</script>
