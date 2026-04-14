<template>
  <aside class="panel flex min-h-[520px] flex-col overflow-hidden p-0">
    <div class="border-b border-slate-200/80 px-5 py-5">
      <div class="page-kicker">Diagnostics</div>
      <h2 class="section-title mt-3">Conversation state</h2>
      <p class="section-copy mt-2">
        Internal state, booking progress, and job outcomes for this thread.
      </p>
    </div>

    <div v-if="!conversationId" class="empty-state m-5 flex-1">
      Select a conversation to inspect automation state.
    </div>

    <template v-else>
      <div class="flex-1 overflow-y-auto px-5 py-5">
        <div v-if="loading" class="space-y-2">
          <div v-for="i in 5" :key="i" class="skeleton-row"></div>
        </div>
        <div v-else-if="error" class="feedback-error">{{ error }}</div>
        <div v-else-if="!diagnostics" class="empty-state">No diagnostics available.</div>
        <div v-else class="space-y-5">
          <section class="rounded-[18px] border border-slate-200/80 bg-white/92 p-4">
            <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Current State</div>
            <div class="mt-3 flex flex-wrap gap-2">
              <span class="badge" :class="statusClass(diagnostics.conversation.status)">
                {{ diagnostics.conversation.status.replace(/_/g, ' ') }}
              </span>
              <span v-if="diagnostics.conversation.outcome" class="badge bg-emerald-50 text-emerald-700">
                outcome: {{ diagnostics.conversation.outcome.replace(/_/g, ' ') }}
              </span>
              <span v-if="diagnostics.conversation.human_controlled" class="badge bg-sky-50 text-sky-700">
                human controlled
              </span>
              <span v-if="diagnostics.conversation.needs_human" class="badge bg-amber-50 text-amber-700">
                needs human
              </span>
              <span v-if="latestQualification" class="badge bg-slate-100 text-slate-700">
                {{ latestQualification.replace(/_/g, ' ') }}
              </span>
            </div>
            <div class="mt-4 text-sm leading-6 text-slate-600">
              {{ debugSummary }}
            </div>
          </section>

          <section class="rounded-[18px] border border-slate-200/80 bg-white/92 p-4">
            <div class="flex items-center justify-between gap-3">
              <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Internal Markers</div>
              <div v-if="latestDecisionTime" class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {{ latestDecisionTime }}
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <span
                v-for="tag in internalTags"
                :key="tag"
                class="badge bg-slate-100 text-slate-700"
              >
                {{ tag }}
              </span>
              <span v-if="internalTags.length === 0" class="text-sm text-slate-500">
                No internal tags were emitted on the latest AI decision.
              </span>
            </div>
            <p v-if="latestReasonSummary" class="mt-4 text-sm leading-6 text-slate-600">
              {{ latestReasonSummary }}
            </p>
          </section>

          <section class="rounded-[18px] border border-slate-200/80 bg-white/92 p-4">
            <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Booking Trace</div>
            <div v-if="bookingEvents.length === 0" class="mt-3 text-sm text-slate-500">
              No booking events have been logged for this conversation yet.
            </div>
            <div v-else class="mt-3 space-y-3">
              <div
                v-for="event in bookingEvents"
                :key="event.id"
                class="rounded-[14px] border border-slate-200/70 bg-slate-50/80 px-3 py-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <span class="badge" :class="eventBadgeClass(event.event_type)">
                    {{ event.event_type.replace(/_/g, ' ') }}
                  </span>
                  <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {{ formatDateTime(event.created_at) }}
                  </span>
                </div>
                <pre
                  v-if="hasPayload(event.event_payload_json)"
                  class="mt-3 overflow-x-auto rounded-[12px] bg-slate-950 px-3 py-3 text-[11px] leading-5 text-slate-200"
                ><code>{{ formatJson(event.event_payload_json) }}</code></pre>
              </div>
            </div>
          </section>

          <section class="rounded-[18px] border border-slate-200/80 bg-white/92 p-4">
            <div class="flex items-center justify-between gap-3">
              <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Related Jobs</div>
              <a href="/admin/jobs" class="text-xs font-semibold text-teal-700 hover:text-teal-800">Open job queue</a>
            </div>
            <div v-if="diagnostics.related_jobs.length === 0" class="mt-3 text-sm text-slate-500">
              No related background jobs found for this conversation.
            </div>
            <div v-else class="mt-3 space-y-3">
              <div
                v-for="job in diagnostics.related_jobs.slice(0, 6)"
                :key="job.id"
                class="rounded-[14px] border border-slate-200/70 bg-slate-50/80 px-3 py-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-sm font-semibold text-slate-900">{{ job.job_type }}</div>
                    <div class="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {{ job.queue_name }} · {{ formatDateTime(job.created_at) }}
                    </div>
                  </div>
                  <span class="badge" :class="jobBadgeClass(job.status)">
                    {{ job.status.replace(/_/g, ' ') }}
                  </span>
                </div>
                <div class="mt-3 text-sm text-slate-600">
                  Attempts {{ job.attempts }}/{{ job.max_attempts }}
                </div>
                <div v-if="job.last_error" class="mt-2 rounded-[12px] bg-red-50 px-3 py-2 text-sm text-red-700">
                  {{ job.last_error }}
                </div>
              </div>
            </div>
          </section>
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
