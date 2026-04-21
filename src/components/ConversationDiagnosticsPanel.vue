<template>
  <aside class="diag-panel">
    <div class="diag-header">
      <h2 class="text-[12px] font-semibold text-zinc-900">Diagnostics</h2>
    </div>

    <div v-if="!conversationId" class="flex flex-1 items-center justify-center p-4 text-sm text-zinc-400">
      Select a conversation to inspect.
    </div>

    <template v-else>
      <div class="diag-body">
        <div v-if="loading" class="space-y-2">
          <div v-for="i in 5" :key="i" class="skeleton-row"></div>
        </div>
        <div v-else-if="error" class="feedback-error">{{ error }}</div>
        <div v-else-if="!diagnostics" class="text-sm text-zinc-400">No diagnostics available.</div>
        <div v-else>
          <!-- Current State -->
          <div class="diag-section">
            <div class="diag-label">State</div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <span class="badge" :class="statusClass(diagnostics.conversation.status)">
                {{ diagnostics.conversation.status.replace(/_/g, ' ') }}
              </span>
              <span v-if="diagnostics.conversation.outcome" class="badge bg-emerald-50 text-emerald-700">
                {{ diagnostics.conversation.outcome.replace(/_/g, ' ') }}
              </span>
              <span v-if="diagnostics.conversation.human_controlled" class="badge bg-sky-50 text-sky-700">
                human
              </span>
              <span v-if="diagnostics.conversation.needs_human" class="badge bg-amber-50 text-amber-700">
                needs human
              </span>
              <span v-if="latestQualification" class="badge bg-zinc-100 text-zinc-600">
                {{ latestQualification.replace(/_/g, ' ') }}
              </span>
            </div>
            <p class="mt-2 text-[13px] leading-relaxed text-zinc-500">{{ debugSummary }}</p>
          </div>

          <!-- Internal Markers -->
          <div class="diag-section">
            <div class="flex items-center justify-between">
              <div class="diag-label">Markers</div>
              <div v-if="latestDecisionTime" class="text-[11px] text-zinc-400">
                {{ latestDecisionTime }}
              </div>
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="tag in internalTags" :key="tag" class="badge bg-zinc-100 text-zinc-600">
                {{ tag }}
              </span>
              <span v-if="internalTags.length === 0" class="text-[13px] text-zinc-400">
                No tags emitted.
              </span>
            </div>
            <p v-if="latestReasonSummary" class="mt-2 text-[13px] leading-relaxed text-zinc-500">
              {{ latestReasonSummary }}
            </p>
          </div>

          <!-- Booking Trace -->
          <div class="diag-section">
            <div class="diag-label">Booking trace</div>
            <div v-if="bookingEvents.length === 0" class="mt-2 text-[13px] text-zinc-400">
              No booking events logged.
            </div>
            <div v-else class="mt-2">
              <div v-for="event in bookingEvents" :key="event.id" class="diag-event">
                <div class="flex items-center justify-between gap-2">
                  <span class="badge" :class="eventBadgeClass(event.event_type)">
                    {{ event.event_type.replace(/_/g, ' ') }}
                  </span>
                  <span class="text-[11px] text-zinc-400">{{ formatDateTime(event.created_at) }}</span>
                </div>
                <pre
                  v-if="hasPayload(event.event_payload_json)"
                  class="mt-2 overflow-x-auto rounded-md bg-zinc-900 px-2 py-2 text-[11px] leading-5 text-zinc-300"
                ><code>{{ formatJson(event.event_payload_json) }}</code></pre>
              </div>
            </div>
          </div>

          <!-- Related Jobs -->
          <div class="diag-section">
            <div class="flex items-center justify-between">
              <div class="diag-label">Jobs</div>
              <a href="/admin/jobs" class="text-[11px] font-medium text-zinc-400 hover:text-zinc-700">View all</a>
            </div>
            <div v-if="diagnostics.related_jobs.length === 0" class="mt-2 text-[13px] text-zinc-400">
              No related jobs.
            </div>
            <div v-else class="mt-2">
              <div v-for="job in diagnostics.related_jobs.slice(0, 6)" :key="job.id" class="diag-event">
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-[13px] font-medium text-zinc-900 truncate">{{ job.job_type }}</div>
                    <div class="text-[11px] text-zinc-400">
                      {{ job.queue_name }} · {{ formatDateTime(job.created_at) }}
                    </div>
                  </div>
                  <span class="badge shrink-0" :class="jobBadgeClass(job.status)">
                    {{ job.status.replace(/_/g, ' ') }}
                  </span>
                </div>
                <div class="mt-1 text-[12px] text-zinc-500">
                  {{ job.attempts }}/{{ job.max_attempts }} attempts
                </div>
                <div v-if="job.last_error" class="mt-1 rounded-md bg-red-50 px-2 py-1.5 text-[12px] text-red-700">
                  {{ job.last_error }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const API_BASE = '/api';

interface ConversationDiagnostics {
  conversation: {
    id: string;
    status: string;
    outcome: string | null;
    needs_human: boolean;
    human_controlled: boolean;
    opened_at: string;
    last_activity_at: string;
    closed_at: string | null;
  };
  latest_ai_decision: {
    id: string;
    created_at: string;
    qualification_state?: string;
    tags_to_emit?: string[];
    reason_summary?: string;
    should_book?: boolean;
    recommended_calendar_id?: string | null;
    escalate_to_human?: boolean;
  } | null;
  conversation_events: Array<{
    id: string;
    event_type: string;
    event_payload_json: Record<string, unknown>;
    created_at: string;
  }>;
  related_jobs: Array<{
    id: string;
    job_type: string;
    queue_name: string;
    status: string;
    attempts: number;
    max_attempts: number;
    run_at: string | null;
    last_error: string | null;
    created_at: string;
  }>;
  crm_events: Array<{
    id: string;
    event_type: string;
    status: string;
    request_payload_json: Record<string, unknown>;
    created_at: string;
  }>;
}

const props = defineProps<{
  conversationId: string | null;
}>();

const loading = ref(false);
const error = ref('');
const diagnostics = ref<ConversationDiagnostics | null>(null);

const bookingEvents = computed(() =>
  diagnostics.value?.conversation_events.filter((event) => event.event_type.startsWith('booking_')) ?? []
);

const latestQualification = computed(() => diagnostics.value?.latest_ai_decision?.qualification_state ?? '');
const latestReasonSummary = computed(() => diagnostics.value?.latest_ai_decision?.reason_summary ?? '');
const latestDecisionTime = computed(() => {
  const createdAt = diagnostics.value?.latest_ai_decision?.created_at;
  return createdAt ? formatDateTime(createdAt) : '';
});
const internalTags = computed(() => diagnostics.value?.latest_ai_decision?.tags_to_emit ?? []);

const latestBookingEvent = computed(() => bookingEvents.value[0] ?? null);
const latestBookingJob = computed(() =>
  diagnostics.value?.related_jobs.find((job) => job.job_type === 'process_booking') ?? null
);

const debugSummary = computed(() => {
  if (!diagnostics.value) return '';
  const { conversation } = diagnostics.value;
  const qualification = latestQualification.value;
  const hasBookingTrace = bookingEvents.value.length > 0 || Boolean(latestBookingJob.value);

  if (latestBookingEvent.value?.event_type === 'booking_failed') {
    return 'Booking reached the booking worker but failed. Review the booking event payload and the latest booking job error.';
  }

  if (latestBookingJob.value?.status === 'failed' || latestBookingJob.value?.status === 'dead_lettered') {
    return 'The booking job failed in the background. The job queue entry below should explain why automation stopped.';
  }

  if (latestBookingJob.value?.status === 'pending' || latestBookingJob.value?.status === 'running') {
    return 'Booking is still in progress in the background. The conversation may appear paused until that job completes.';
  }

  if (latestBookingEvent.value?.event_type === 'booking_needs_human') {
    return 'Booking could not continue automatically. The system explicitly requested human review instead of leaving the thread silent.';
  }

  if (latestBookingEvent.value?.event_type === 'booking_queued') {
    return 'Booking has been explicitly queued and is waiting on the background worker.';
  }

  if (latestBookingEvent.value?.event_type === 'booking_confirmed' && diagnostics.value.conversation.status === 'completed') {
    return 'Booking completed successfully and the conversation was closed. Any follow-up issue is now about confirmation visibility, not booking execution.';
  }

  if (conversation.needs_human) {
    return 'Automation stopped and explicitly asked for human attention.';
  }

  if (conversation.human_controlled) {
    return 'Automation is off for this thread because a human takeover is active.';
  }

  if (conversation.status === 'waiting_for_lead' && qualification === 'exploring') {
    return 'This thread looks healthy. The AI has replied and is waiting for the lead to continue the conversation.';
  }

  if (conversation.status === 'waiting_for_lead' && qualification === 'qualified' && !hasBookingTrace) {
    return 'The lead is marked qualified, but booking has not started yet. If the lead already accepted a time, this thread should be reviewed.';
  }

  if (conversation.status === 'waiting_for_lead') {
    return 'The current turn is complete and the system is waiting for the lead to reply.';
  }

  if (conversation.status === 'active' && qualification === 'exploring') {
    return 'The conversation is active and still in discovery. No booking action is expected yet.';
  }

  if (conversation.status === 'active' && qualification === 'qualified' && !hasBookingTrace) {
    return 'The lead is qualified, but no booking workflow has started yet. This is a useful thread to watch for missed booking intent.';
  }

  if (conversation.status === 'active') {
    return 'The AI is currently handling this thread and another automated step may still be in progress.';
  }

  if (conversation.status === 'completed') {
    return 'This conversation has been closed. Review the outcome and event trace below for the final path.';
  }

  return 'This conversation has no obvious failure in the current trace. Review the latest AI decision and recent jobs if the state looks unexpected.';
});

watch(
  () => props.conversationId,
  async (conversationId) => {
    diagnostics.value = null;
    error.value = '';

    if (!conversationId) return;

    loading.value = true;
    try {
      const params = new URLSearchParams({ conversation_id: conversationId });
      const res = await fetch(`${API_BASE}/api-conversation-diagnostics?${params}`);
      const data = await res.json();

      if (!res.ok) {
        error.value = data.error || 'Failed to load diagnostics';
        return;
      }

      diagnostics.value = data;
    } catch {
      error.value = 'Network error. Please try again.';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function statusClass(status: string): string {
  switch (status) {
    case 'active': return 'bg-emerald-50 text-emerald-700';
    case 'waiting_for_lead': return 'bg-blue-50 text-blue-700';
    case 'needs_human': return 'bg-amber-50 text-amber-700';
    case 'human_controlled': return 'bg-sky-50 text-sky-700';
    case 'completed': return 'bg-slate-100 text-slate-700';
    case 'failed': return 'bg-red-50 text-red-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function eventBadgeClass(eventType: string): string {
  switch (eventType) {
    case 'booking_confirmed': return 'bg-emerald-50 text-emerald-700';
    case 'booking_failed': return 'bg-red-50 text-red-700';
    case 'booking_needs_human': return 'bg-amber-50 text-amber-700';
    case 'booking_initiated': return 'bg-blue-50 text-blue-700';
    case 'booking_queued': return 'bg-sky-50 text-sky-700';
    case 'booking_acceptance_detected': return 'bg-indigo-50 text-indigo-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function jobBadgeClass(status: string): string {
  switch (status) {
    case 'completed': return 'bg-emerald-50 text-emerald-700';
    case 'running': return 'bg-blue-50 text-blue-700';
    case 'failed': return 'bg-red-50 text-red-700';
    case 'dead_lettered': return 'bg-amber-50 text-amber-700';
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

function hasPayload(payload: Record<string, unknown>): boolean {
  return Object.keys(payload ?? {}).length > 0;
}

function formatJson(payload: Record<string, unknown>): string {
  return JSON.stringify(payload ?? {}, null, 2);
}
</script>
