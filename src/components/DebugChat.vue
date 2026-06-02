<template>
  <div class="inbox-layout">
    <!-- Sessions sidebar -->
    <aside class="inbox-sidebar">
      <div class="inbox-sidebar-header flex items-center justify-between gap-2">
        <span class="text-[12px] font-medium text-zinc-500 uppercase tracking-wide">Debug sessions</span>
        <button class="button-primary text-xs" @click="openNewSessionModal" :disabled="loadingSessions">
          + New
        </button>
      </div>

      <div class="inbox-sidebar-list">
        <div v-if="loadingSessions" class="space-y-1 p-3">
          <div v-for="i in 4" :key="i" class="skeleton-row"></div>
        </div>
        <div v-else-if="sessionsError" class="p-4 text-sm text-rose-500">{{ sessionsError }}</div>
        <div v-else-if="sessions.length === 0" class="p-4 text-sm text-zinc-400">
          No debug sessions yet. Click "New" to start one.
        </div>
        <div v-else>
          <button
            v-for="s in sessions"
            :key="s.id"
            class="inbox-item"
            :class="selectedId === s.id ? 'inbox-item-active' : ''"
            @click="selectSession(s.id)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-[13px] font-medium text-zinc-900 truncate">{{ sessionLabel(s) }}</span>
              <span class="badge shrink-0" :class="statusClass(s.status)">
                {{ s.status.replace(/_/g, ' ') }}
              </span>
            </div>
            <p class="mt-1 text-[12px] text-zinc-400 truncate">{{ sessionPreview(s) }}</p>
            <div class="mt-1 text-[11px] text-zinc-300">{{ relativeTime(s.last_activity_at) }}</div>
          </button>
        </div>
      </div>
    </aside>

    <!-- Thread pane -->
    <section class="inbox-thread">
      <div v-if="!selected" class="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Select a session, or start a new one.
      </div>

      <template v-else>
        <div class="inbox-thread-header">
          <div class="flex items-center gap-3 min-w-0">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold text-zinc-900 truncate">{{ leadLabel }}</h2>
                <span class="badge bg-violet-50 text-violet-700 shrink-0">DEBUG</span>
                <span class="badge shrink-0" :class="statusClass(selected.status)">
                  {{ selected.status.replace(/_/g, ' ') }}
                </span>
              </div>
              <p class="mt-0.5 text-[12px] text-zinc-400">{{ selectedLeadEmail || 'no email' }}</p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button class="button-secondary" :disabled="deleting" @click="deleteSession">
              {{ deleting ? 'Deleting...' : 'Delete session' }}
            </button>
          </div>
        </div>

        <div ref="threadRef" class="inbox-messages">
          <div v-if="messagesLoading && messages.length === 0" class="space-y-3 p-4">
            <div v-for="i in 4" :key="i" class="flex" :class="i % 2 === 0 ? 'justify-end' : 'justify-start'">
              <div class="skeleton-card" :style="{ width: `${45 + (i * 7) % 30}%`, height: '2.5rem' }"></div>
            </div>
          </div>
          <div v-else-if="messagesError" class="p-4 text-sm text-rose-500">{{ messagesError }}</div>
          <div v-else-if="messages.length === 0" class="p-4 text-sm text-zinc-400">
            Type a message below to start the conversation as the lead.
          </div>
          <div v-else class="flex flex-col gap-2 p-4">
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="flex"
              :class="msg.direction === 'inbound' ? 'justify-start' : 'justify-end'"
            >
              <div class="msg-bubble" :class="messageClass(msg)">
                <div class="whitespace-pre-wrap">{{ msg.body_text }}</div>
                <div class="msg-meta" :class="metaClass(msg)">
                  {{ senderLabel(msg.sender_type) }} · {{ formatTime(msg.sent_at ?? msg.received_at ?? msg.created_at) }}
                  <template v-if="msg.direction === 'outbound' && msg.provider_status">
                    · {{ msg.provider_status }}
                  </template>
                </div>
              </div>
            </div>
            <div v-if="awaitingReply" class="flex justify-end">
              <div class="msg-bubble bg-zinc-900 text-white opacity-60">
                <div class="flex items-center gap-1">
                  <span class="dot-pulse"></span>
                  <span class="dot-pulse" style="animation-delay: 0.15s"></span>
                  <span class="dot-pulse" style="animation-delay: 0.3s"></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="inbox-reply">
          <textarea
            ref="replyRef"
            v-model="leadInput"
            class="inbox-reply-input"
            placeholder="Type as the lead. Enter to send."
            rows="1"
            :disabled="sending"
            @keydown.enter.exact.prevent="sendAsLead"
            @input="autoResize"
          />
          <div class="flex items-center justify-between gap-3 mt-2">
            <span class="text-[11px] text-zinc-300">Sending as the lead · AI replies skip Twilio</span>
            <button
              class="button-primary"
              :disabled="sending || !leadInput.trim()"
              @click="sendAsLead"
            >
              {{ sending ? 'Sending...' : 'Send as lead' }}
            </button>
          </div>
        </div>
      </template>
    </section>

    <!-- Diagnostics rail -->
    <aside class="debug-diagnostics" v-if="selected">
      <h3 class="text-[12px] font-medium text-zinc-500 uppercase tracking-wide mb-2">Diagnostics</h3>
      <div class="text-[12px] text-zinc-500 space-y-1 mb-4">
        <div><span class="text-zinc-400">Conversation:</span> {{ selected.id.slice(0, 8) }}…</div>
        <div><span class="text-zinc-400">Outcome:</span> {{ selected.outcome ?? '—' }}</div>
        <div><span class="text-zinc-400">Status:</span> {{ selected.status }}</div>
      </div>

      <h4 class="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-1">Recent AI decisions</h4>
      <div v-if="recentDecisions.length === 0" class="text-[12px] text-zinc-400 mb-4">None yet.</div>
      <div v-else class="space-y-2 mb-4">
        <div v-for="d in recentDecisions" :key="d.id" class="rounded bg-zinc-50 p-2 text-[11px]">
          <div class="text-zinc-500">{{ d.model_name }} · {{ formatTime(d.created_at) }}</div>
          <div class="mt-1 text-zinc-700">
            <div>qual: {{ d.decision_json?.qualification_state ?? '—' }}</div>
            <div v-if="d.decision_json?.should_book">📅 should_book</div>
            <div v-if="d.decision_json?.should_offer_times">⏱ should_offer_times</div>
            <div v-if="d.decision_json?.escalate_to_human">⚠ escalate</div>
          </div>
        </div>
      </div>

      <h4 class="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mb-1">Events</h4>
      <div v-if="events.length === 0" class="text-[12px] text-zinc-400">No events.</div>
      <div v-else class="space-y-1">
        <div v-for="e in events.slice(-25).reverse()" :key="e.id" class="text-[11px] text-zinc-600">
          <span class="text-zinc-400">{{ formatTime(e.created_at) }}</span> · {{ e.event_type }}
        </div>
      </div>
    </aside>

    <!-- New session modal -->
    <div v-if="showModal" class="modal-backdrop" @click.self="closeModal">
      <div class="modal-card">
        <h3 class="text-base font-semibold text-zinc-900 mb-1">New debug session</h3>
        <p class="text-[12px] text-zinc-500 mb-4">
          Runs the real AI / Calendly / CRM pipeline. Use a throwaway email — debug bookings
          and CRM contacts are real.
        </p>

        <label class="form-label">Campaign</label>
        <select v-model="form.campaign_id" class="form-input mb-3" :disabled="loadingForm">
          <option value="" disabled>Select a campaign…</option>
          <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>

        <label class="form-label">Agent (optional)</label>
        <select v-model="form.agent_id" class="form-input mb-3" :disabled="!form.campaign_id || campaignAgents.length === 0">
          <option value="">Random by weight</option>
          <option v-for="a in campaignAgents" :key="a.id" :value="a.id">
            {{ a.name }} (w={{ a.weight }})
          </option>
        </select>

        <label class="form-label">Lead first name</label>
        <input v-model="form.first_name" class="form-input mb-3" placeholder="e.g. Test Lead" />

        <label class="form-label">Lead last name (optional)</label>
        <input v-model="form.last_name" class="form-input mb-3" />

        <label class="form-label">Lead email (use a throwaway)</label>
        <input v-model="form.email" type="email" class="form-input mb-3" placeholder="debug+1@throwaway.com" />

        <label class="form-label">Lead phone (optional, never dispatched)</label>
        <input v-model="form.phone" class="form-input mb-3" placeholder="auto-generated if blank" />

        <label class="form-label">CRM contact ID (optional)</label>
        <input v-model="form.external_contact_id" class="form-input mb-1" placeholder="paste an existing CRM contact ID to test sync" />
        <p class="text-[11px] text-zinc-400 mb-3">
          Leave blank to skip CRM sync. When set, qualify/book events apply real tags
          and notes to this contact in your connected CRM.
        </p>

        <label class="flex items-start gap-2 cursor-pointer">
          <input v-model="form.ai_starts" type="checkbox" class="mt-0.5" />
          <span class="text-[12px] text-zinc-600">
            <span class="font-medium text-zinc-800">AI sends the first message</span>
            <span class="block text-[11px] text-zinc-400">
              Mirrors production. Uncheck to drive the conversation by typing as the lead first.
            </span>
          </span>
        </label>

        <p v-if="modalError" class="mt-2 text-[12px] text-rose-500">{{ modalError }}</p>

        <div class="flex items-center justify-end gap-2 mt-5">
          <button class="button-secondary" @click="closeModal" :disabled="creating">Cancel</button>
          <button class="button-primary" :disabled="!canCreate || creating" @click="createSession">
            {{ creating ? 'Creating...' : 'Start session' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

const API_BASE = '/api';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

interface Session {
  id: string;
  status: string;
  outcome: string | null;
  last_activity_at: string;
  campaign_id: string;
  agent_id: string;
  opened_at: string;
  last_message_preview: string | null;
  last_message_sender_type: string | null;
  last_message_at: string | null;
  lead: Lead | null;
}

interface Msg {
  id: string;
  direction: string;
  sender_type: string;
  body_text: string;
  provider_status: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
}

interface Event {
  id: string;
  event_type: string;
  event_payload_json: Record<string, unknown>;
  created_at: string;
}

interface Decision {
  id: string;
  model_name: string;
  decision_json: Record<string, unknown>;
  created_at: string;
  message_id: string | null;
}

interface Campaign { id: string; name: string }
interface Agent { id: string; name: string; weight: number; campaign_id: string }

const sessions = ref<Session[]>([]);
const loadingSessions = ref(false);
const sessionsError = ref('');

const selectedId = ref<string | null>(null);
const selected = ref<Session | null>(null);
const messages = ref<Msg[]>([]);
const events = ref<Event[]>([]);
const recentDecisions = ref<Decision[]>([]);
const messagesLoading = ref(false);
const messagesError = ref('');

const leadInput = ref('');
const sending = ref(false);
const deleting = ref(false);
const awaitingReply = ref(false);

const threadRef = ref<HTMLElement | null>(null);
const replyRef = ref<HTMLTextAreaElement | null>(null);

const showModal = ref(false);
const loadingForm = ref(false);
const creating = ref(false);
const modalError = ref('');
const campaigns = ref<Campaign[]>([]);
const agents = ref<Agent[]>([]);

const form = ref({
  campaign_id: '',
  agent_id: '',
  first_name: 'Test Lead',
  last_name: '',
  email: '',
  phone: '',
  external_contact_id: '',
  ai_starts: true,
});

let workspaceId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let listPollTimer: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let popstateHandler: (() => void) | null = null;

/**
 * Mirror `selectedId` into the URL via `?session=<id>` so reloads land back on
 * the same thread and the browser back/forward buttons traverse the session
 * history naturally. Uses replaceState when the URL already has the right
 * param (avoids piling up duplicate history entries from poll-driven calls).
 */
function syncUrlToSession(sessionId: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const current = url.searchParams.get('session');
  if (sessionId) {
    if (current === sessionId) return;
    url.searchParams.set('session', sessionId);
    window.history.pushState({ sessionId }, '', url.toString());
  } else {
    if (!current) return;
    url.searchParams.delete('session');
    window.history.pushState({ sessionId: null }, '', url.toString());
  }
}

function sessionIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URL(window.location.href).searchParams.get('session');
}

const campaignAgents = computed(() =>
  agents.value.filter((a) => a.campaign_id === form.value.campaign_id),
);

const canCreate = computed(() =>
  !!form.value.campaign_id && !!form.value.first_name.trim(),
);

const leadLabel = computed(() => {
  const l = selected.value?.lead;
  if (!l) return 'Debug session';
  return `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Debug lead';
});

const selectedLeadEmail = computed(() => selected.value?.lead?.email ?? '');

function statusClass(status: string): string {
  const map: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700',
    needs_human: 'bg-amber-50 text-amber-700',
    human_controlled: 'bg-sky-50 text-sky-700',
    waiting_for_lead: 'bg-slate-100 text-slate-600',
    paused_business_hours: 'bg-indigo-50 text-indigo-700',
    paused_manual: 'bg-orange-50 text-orange-700',
    completed: 'bg-slate-100 text-slate-600',
    opted_out: 'bg-rose-50 text-rose-700',
    queued: 'bg-slate-100 text-slate-600',
  };
  return map[status] ?? 'bg-slate-100 text-slate-600';
}

function messageClass(msg: Msg): string {
  if (msg.direction === 'inbound') return 'bg-zinc-100 text-zinc-800';
  if (msg.sender_type === 'human') return 'bg-amber-50 text-amber-900';
  return 'bg-zinc-900 text-white';
}

function metaClass(msg: Msg): string {
  if (msg.direction === 'inbound') return 'text-zinc-400';
  if (msg.sender_type === 'human') return 'text-amber-600';
  return 'text-zinc-400';
}

function senderLabel(type: string): string {
  return { ai: 'AI', human: 'Human', lead: 'Lead', system: 'System' }[type] ?? type;
}

function sessionLabel(s: Session): string {
  const l = s.lead;
  if (!l) return 'Debug session';
  const name = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim();
  return name || (l.email ?? 'Debug lead');
}

function sessionPreview(s: Session): string {
  const text = s.last_message_preview ?? 'No messages yet';
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function autoResize() {
  const el = replyRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

function scrollToBottom() {
  nextTick(() => {
    const el = threadRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

async function fetchSessions(silent = false) {
  if (!workspaceId) return;
  if (!silent) loadingSessions.value = true;
  sessionsError.value = '';
  try {
    const params = new URLSearchParams({ workspace_id: workspaceId });
    const res = await fetch(`${API_BASE}/api-debug-conversation-list?${params}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Failed to load sessions' }));
      sessionsError.value = body.error ?? 'Failed to load sessions';
      return;
    }
    const next: Session[] = await res.json();
    // Only replace the array when something actually changed so Vue doesn't
    // thrash the list on every poll tick.
    if (JSON.stringify(next) !== JSON.stringify(sessions.value)) {
      sessions.value = next;
    }
  } finally {
    if (!silent) loadingSessions.value = false;
  }
}

async function fetchMessages(initial = false) {
  if (!selectedId.value) return;
  if (initial) messagesLoading.value = true;
  messagesError.value = '';
  try {
    const params = new URLSearchParams({ conversation_id: selectedId.value });
    const res = await fetch(`${API_BASE}/api-debug-conversation-messages?${params}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Failed to load messages' }));
      messagesError.value = body.error ?? 'Failed to load messages';
      return;
    }
    const data = await res.json();

    // Update selected conversation status from the latest snapshot.
    if (selected.value && data.conversation) {
      selected.value = {
        ...selected.value,
        status: data.conversation.status,
        outcome: data.conversation.outcome,
        last_activity_at: data.conversation.last_activity_at,
      };
    }

    const previousLen = messages.value.length;
    messages.value = data.messages ?? [];
    events.value = data.events ?? [];
    recentDecisions.value = data.recent_decisions ?? [];

    // If the latest message is from the AI, drop the "awaiting" indicator.
    const last = messages.value[messages.value.length - 1];
    if (last && last.direction === 'outbound') {
      awaitingReply.value = false;
    }

    if (messages.value.length !== previousLen) scrollToBottom();
  } finally {
    if (initial) messagesLoading.value = false;
  }
}

async function selectSession(id: string, options: { updateUrl?: boolean } = {}) {
  selectedId.value = id;
  selected.value = sessions.value.find((s) => s.id === id) ?? null;
  messages.value = [];
  events.value = [];
  recentDecisions.value = [];
  awaitingReply.value = false;
  if (options.updateUrl !== false) syncUrlToSession(id);
  await fetchMessages(true);
  scrollToBottom();
  setTimeout(() => replyRef.value?.focus(), 50);
}

function clearSelection(options: { updateUrl?: boolean } = {}) {
  selectedId.value = null;
  selected.value = null;
  messages.value = [];
  events.value = [];
  recentDecisions.value = [];
  awaitingReply.value = false;
  if (options.updateUrl !== false) syncUrlToSession(null);
}

async function sendAsLead() {
  if (!selectedId.value || !leadInput.value.trim()) return;
  sending.value = true;
  awaitingReply.value = true;
  try {
    const res = await fetch(`${API_BASE}/api-debug-conversation-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: selectedId.value,
        body_text: leadInput.value.trim(),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Failed to send' }));
      messagesError.value = body.error ?? 'Failed to send';
      awaitingReply.value = false;
      return;
    }
    leadInput.value = '';
    autoResize();
    await fetchMessages();
  } finally {
    sending.value = false;
  }
}

async function deleteSession() {
  if (!selectedId.value) return;
  if (!confirm('Delete this debug session? Messages stay in the database but it disappears from the list.')) {
    return;
  }
  deleting.value = true;
  try {
    const res = await fetch(`${API_BASE}/api-debug-conversation-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: selectedId.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Failed to delete' }));
      messagesError.value = body.error ?? 'Failed to delete';
      return;
    }
    clearSelection();
    await fetchSessions();
  } finally {
    deleting.value = false;
  }
}

async function openNewSessionModal() {
  showModal.value = true;
  modalError.value = '';
  if (!workspaceId) return;
  loadingForm.value = true;
  try {
    const params = new URLSearchParams({ workspace_id: workspaceId });
    const [campaignRes, agentRes] = await Promise.all([
      fetch(`${API_BASE}/api-campaigns-list?${params}`),
      fetch(`${API_BASE}/api-agents-workspace-list?${params}`),
    ]);
    if (campaignRes.ok) campaigns.value = await campaignRes.json();
    if (agentRes.ok) agents.value = await agentRes.json();

    // Default to the first campaign for convenience.
    if (!form.value.campaign_id && campaigns.value.length > 0) {
      form.value.campaign_id = campaigns.value[0].id;
    }
  } finally {
    loadingForm.value = false;
  }
}

function closeModal() {
  showModal.value = false;
  modalError.value = '';
}

async function createSession() {
  if (!workspaceId || !canCreate.value) return;
  creating.value = true;
  modalError.value = '';
  try {
    const res = await fetch(`${API_BASE}/api-debug-conversation-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        campaign_id: form.value.campaign_id,
        agent_id: form.value.agent_id || undefined,
        ai_starts: form.value.ai_starts,
        lead: {
          first_name: form.value.first_name.trim(),
          last_name: form.value.last_name.trim() || undefined,
          email: form.value.email.trim() || undefined,
          phone: form.value.phone.trim() || undefined,
          external_contact_id: form.value.external_contact_id.trim() || undefined,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Failed to create session' }));
      modalError.value = body.error ?? 'Failed to create session';
      return;
    }
    const data = await res.json();
    closeModal();
    await fetchSessions();
    await selectSession(data.conversation_id);
  } finally {
    creating.value = false;
  }
}

function startPolling() {
  if (pollTimer) return;
  // Fast loop: only pulls the open thread's messages (responsive AI replies).
  pollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (selectedId.value) fetchMessages();
  }, 1500);

  // Slow loop: refreshes the session list (status badges, previews) without
  // hammering the API every couple of seconds.
  listPollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    fetchSessions(true);
  }, 8000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (listPollTimer) {
    clearInterval(listPollTimer);
    listPollTimer = null;
  }
}

watch(() => form.value.campaign_id, () => {
  // Reset selected agent when campaign changes.
  form.value.agent_id = '';
});

onMounted(async () => {
  const ctx = getSessionContext();
  workspaceId = ctx.workspaceId || null;
  if (!workspaceId) {
    sessionsError.value = 'No active workspace.';
    return;
  }
  await fetchSessions();

  // Restore the session pinned in the URL, if any. If it's missing from the
  // workspace's list (stale link, deleted session, wrong workspace), silently
  // drop the param so the user lands on the empty state instead of seeing an
  // error.
  const pinned = sessionIdFromUrl();
  if (pinned) {
    if (sessions.value.some((s) => s.id === pinned)) {
      await selectSession(pinned, { updateUrl: false });
    } else {
      syncUrlToSession(null);
    }
  }

  startPolling();
  visibilityHandler = () => { if (document.visibilityState === 'visible') {
    fetchSessions(true);
    if (selectedId.value) fetchMessages();
  } };
  document.addEventListener('visibilitychange', visibilityHandler);

  // Back/forward navigation: re-sync to whichever session the URL now points
  // at. We don't push state again from inside the handler (that would create
  // duplicate history entries).
  popstateHandler = () => {
    const next = sessionIdFromUrl();
    if (next && next !== selectedId.value) {
      if (sessions.value.some((s) => s.id === next)) {
        selectSession(next, { updateUrl: false });
      } else {
        clearSelection({ updateUrl: false });
      }
    } else if (!next && selectedId.value) {
      clearSelection({ updateUrl: false });
    }
  };
  window.addEventListener('popstate', popstateHandler);
});

onUnmounted(() => {
  stopPolling();
  if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
  if (popstateHandler) window.removeEventListener('popstate', popstateHandler);
});
</script>

<style scoped>
.debug-diagnostics {
  width: 18rem;
  border-left: 1px solid #e4e4e7;
  padding: 1rem;
  background: #fafafa;
  overflow-y: auto;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 15, 18, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal-card {
  background: white;
  border-radius: 0.75rem;
  padding: 1.5rem;
  width: 100%;
  max-width: 30rem;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: #52525b;
  margin-bottom: 0.25rem;
}

.form-input {
  width: 100%;
  border: 1px solid #e4e4e7;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 13px;
  color: #18181b;
}

.form-input:focus {
  outline: none;
  border-color: #18181b;
  box-shadow: 0 0 0 1px #18181b;
}

.dot-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: dotPulse 1s infinite ease-in-out;
  margin: 0 1px;
}

@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
  40% { opacity: 1; transform: scale(1); }
}
</style>
