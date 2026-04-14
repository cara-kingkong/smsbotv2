<template>
  <section class="panel">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="page-kicker">Calendar Events</div>
        <h3 class="section-title mt-2">Booked calls and booking failures</h3>
        <p class="section-copy mt-1">
          Review recent booking outcomes without leaving the calendar area.
        </p>
      </div>
      <button class="button-secondary shrink-0" :disabled="loading" @click="fetchEvents">
        {{ loading ? 'Refreshing...' : 'Refresh activity' }}
      </button>
    </div>

    <div class="mt-5">
      <div class="pill-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="pill-tab"
          :class="activeTab === tab.value ? 'pill-tab-active' : ''"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div v-if="error" class="mt-4 feedback-error">{{ error }}</div>
    <div v-else-if="loading && events.length === 0" class="mt-4 note-box">Loading booking activity...</div>
    <div v-else-if="filteredEvents.length === 0" class="mt-4 note-box">
      No {{ activeTab === 'all' ? '' : activeTab }} booking activity found yet.
    </div>
    <div v-else class="mt-5 overflow-hidden rounded-[18px] border border-slate-200/80 bg-white/92">
      <table class="w-full text-sm">
        <thead class="bg-slate-50/90 text-left text-slate-500">
          <tr>
            <th class="px-4 py-3 font-medium">Lead</th>
            <th class="px-4 py-3 font-medium">Event</th>
            <th class="px-4 py-3 font-medium">Conversation</th>
            <th class="px-4 py-3 font-medium">Details</th>
            <th class="px-4 py-3 font-medium text-right">When</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="event in filteredEvents"
            :key="event.id"
            class="border-t border-slate-200/70 align-top"
          >
            <td class="px-4 py-3">
              <div class="text-sm font-semibold text-slate-900">{{ leadName(event) }}</div>
              <div class="mt-1 text-xs text-slate-500">{{ event.lead?.phone_e164 ?? '-' }}</div>
            </td>
            <td class="px-4 py-3">
              <span class="badge" :class="eventBadgeClass(event.event_type)">
                {{ event.event_type.replace(/_/g, ' ') }}
              </span>
            </td>
            <td class="px-4 py-3">
              <div class="text-sm text-slate-700">{{ event.conversation.status.replace(/_/g, ' ') }}</div>
              <div v-if="event.conversation.outcome" class="mt-1 text-xs text-slate-500">
                {{ event.conversation.outcome.replace(/_/g, ' ') }}
              </div>
            </td>
            <td class="px-4 py-3 text-slate-600">
              {{ eventSummary(event) }}
            </td>
            <td class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              {{ formatDateTime(event.created_at) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

const API_BASE = '/api';

interface BookingActivityRow {
  id: string;
  conversation_id: string;
  event_type: string;
  event_payload_json: Record<string, unknown>;
  created_at: string;
  conversation: {
    id: string;
    status: string;
    outcome: string | null;
    closed_at: string | null;
  };
  lead: {
    first_name?: string;
    last_name?: string;
    phone_e164?: string;
  } | null;
}

const events = ref<BookingActivityRow[]>([]);
const loading = ref(false);
const error = ref('');
const activeTab = ref<'all' | 'booked' | 'failed'>('booked');
let workspaceId: string | null = null;

const tabs = [
  { label: 'Booked Calls', value: 'booked' },
  { label: 'Failures', value: 'failed' },
  { label: 'All Activity', value: 'all' },
] as const;

const filteredEvents = computed(() => {
  if (activeTab.value === 'all') return events.value;
  if (activeTab.value === 'booked') return events.value.filter((event) => event.event_type === 'booking_confirmed');
  return events.value.filter((event) => event.event_type === 'booking_failed');
});

async function fetchEvents() {
  if (!workspaceId) return;

  loading.value = true;
  error.value = '';

  try {
    const params = new URLSearchParams({ workspace_id: workspaceId, limit: '40' });
    const res = await fetch(`${API_BASE}/api-calendar-events-list?${params}`);
    const data = await res.json();

    if (!res.ok) {
      error.value = data.error || 'Failed to load booking activity';
      return;
    }

    events.value = data;
  } catch {
    error.value = 'Network error. Please try again.';
  } finally {
    loading.value = false;
  }
}

function leadName(event: BookingActivityRow): string {
  const first = event.lead?.first_name?.trim() ?? '';
  const last = event.lead?.last_name?.trim() ?? '';
  return `${first} ${last}`.trim() || 'Unknown lead';
}

function eventSummary(event: BookingActivityRow): string {
  const payload = event.event_payload_json ?? {};

  if (event.event_type === 'booking_confirmed') {
    if (typeof payload.booking_url === 'string' && payload.booking_url) {
      return `Booking confirmed. Link: ${payload.booking_url}`;
    }
    return 'Booking confirmed successfully.';
  }

  if (event.event_type === 'booking_failed') {
    return typeof payload.error === 'string' && payload.error
      ? payload.error
      : 'Booking failed with no error detail recorded.';
  }

  if (event.event_type === 'booking_initiated') {
    return typeof payload.calendar_id === 'string' && payload.calendar_id
      ? `Attempting booking with ${payload.calendar_id}`
      : 'Booking job started.';
  }

  return 'Booking activity recorded.';
}

function eventBadgeClass(eventType: string): string {
  switch (eventType) {
    case 'booking_confirmed': return 'bg-emerald-50 text-emerald-700';
    case 'booking_failed': return 'bg-red-50 text-red-700';
    case 'booking_initiated': return 'bg-blue-50 text-blue-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

onMounted(async () => {
  const ctx = getSessionContext();
  workspaceId = ctx.workspaceId || null;
  await fetchEvents();
});
</script>
