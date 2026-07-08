<template>
  <div class="inbox-layout">
    <!-- Conversation list sidebar -->
    <aside class="inbox-sidebar">
      <div class="inbox-sidebar-header">
        <select
          v-if="campaigns.length"
          v-model="currentCampaign"
          class="mb-2 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[13px] text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-300"
          @change="onCampaignChange"
        >
          <option value="">All campaigns</option>
          <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="f in filters"
            :key="f.value"
            class="pill-tab"
            :class="isPillActive(f.value) ? 'pill-tab-active' : ''"
            @click="setFilter(f.value)"
          >
            {{ f.label }}
          </button>
        </div>

        <!-- Context filters carried in from the dashboard (campaign-scoped
             outcomes, an agent split, or the live "active" group). -->
        <div v-if="hasContextFilters" class="mt-2 flex flex-wrap items-center gap-1">
          <span v-if="agentChipLabel" class="filter-chip">
            Agent: {{ agentChipLabel }}
            <button type="button" aria-label="Clear agent filter" @click="clearAgent">&times;</button>
          </span>
          <span v-if="outcomeChipLabel" class="filter-chip">
            {{ outcomeChipLabel }}
            <button type="button" aria-label="Clear outcome filter" @click="clearOutcome">&times;</button>
          </span>
          <span v-else-if="metricChipLabel" class="filter-chip">
            {{ metricChipLabel }}
            <button type="button" aria-label="Clear filter" @click="clearMetric">&times;</button>
          </span>
        </div>
      </div>

      <div class="inbox-sidebar-list">
        <div v-if="loading" class="space-y-1 p-3">
          <div v-for="i in 6" :key="i" class="skeleton-row"></div>
        </div>
        <div v-else-if="loadError" class="p-4 text-sm text-zinc-400">{{ loadError }}</div>
        <div v-else-if="conversations.length === 0" class="p-4 text-sm text-zinc-400">
          No conversations found{{ currentFilter ? ' for this filter' : '' }}.
        </div>
        <div v-else>
          <button
            v-for="conv in conversations"
            :key="conv.id"
            class="inbox-item"
            :class="selectedId === conv.id ? 'inbox-item-active' : ''"
            @click="select(conv)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-[13px] font-medium text-zinc-900 truncate">{{ leadName(conv) }}</span>
              <span class="badge shrink-0" :class="statusClass(conv.status)">
                {{ conv.status.replace(/_/g, ' ') }}
              </span>
            </div>
            <p class="mt-1 text-[12px] text-zinc-400 truncate">{{ lastPreview(conv) }}</p>
            <div class="mt-1 text-[11px] text-zinc-300">{{ relativeTime(conv.last_activity_at) }}</div>
          </button>
        </div>
      </div>
    </aside>

    <!-- Thread pane -->
    <section class="inbox-thread">
      <div v-if="!selected" class="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Select a conversation from the list.
      </div>

      <template v-else>
        <!-- Thread header -->
        <div class="inbox-thread-header">
          <div class="flex items-center gap-3 min-w-0">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold text-zinc-900 truncate">{{ leadName(selected) }}</h2>
                <span class="badge shrink-0" :class="statusClass(selected.status)">
                  {{ selected.status.replace(/_/g, ' ') }}
                </span>
                <span v-if="selected.outcome" class="badge shrink-0 bg-emerald-50 text-emerald-700">
                  {{ selected.outcome.replace(/_/g, ' ') }}
                </span>
              </div>
              <p class="mt-0.5 text-[12px] text-zinc-400">{{ selected.lead?.phone_e164 ?? '' }}</p>
            </div>
          </div>

          <div class="ml-auto flex flex-wrap items-center justify-end gap-2">
            <span v-if="generateError" class="text-[12px] font-medium text-amber-600 max-w-[16rem] leading-tight">
              {{ generateError }}
            </span>
            <button
              v-if="!isTerminal"
              class="button-secondary"
              :disabled="generatingReply"
              title="Ask the AI to write and send the next reply now"
              @click="generateReply"
            >
              {{ generatingReply ? 'Generating...' : 'Generate AI reply' }}
            </button>
            <button
              v-if="!isTerminal && selected.human_controlled"
              class="button-secondary"
              :disabled="actionLoading"
              @click="release"
            >
              {{ actionLoading ? 'Releasing...' : 'Release to AI' }}
            </button>
            <button
              v-if="!isTerminal && selected.human_controlled && selected.outcome !== 'booked'"
              class="button-secondary !text-emerald-700 hover:!bg-emerald-50"
              :disabled="markingBooked"
              title="Record this lead as booked (reporting only — sends nothing, books no calendar, keeps the thread open)"
              @click="markBooked"
            >
              {{ markingBooked ? 'Saving...' : 'Mark as booked' }}
            </button>
            <button
              v-if="!isTerminal && !selected.human_controlled"
              class="button-primary"
              :disabled="actionLoading"
              @click="takeover"
            >
              {{ actionLoading ? 'Taking over...' : 'Take Over' }}
            </button>
            <template v-if="confirmingDelete">
              <span class="text-[12px] font-medium text-red-600">Delete?</span>
              <button
                class="button-secondary !text-red-600 hover:!bg-red-50"
                :disabled="actionLoading"
                @click="executeDelete"
              >
                {{ actionLoading ? '...' : 'Confirm' }}
              </button>
              <button
                class="button-secondary"
                :disabled="actionLoading"
                @click="confirmingDelete = false"
              >
                Cancel
              </button>
            </template>
            <button
              v-else
              class="button-secondary !text-red-600 hover:!bg-red-50"
              :disabled="actionLoading"
              @click="confirmingDelete = true"
            >
              Delete
            </button>
          </div>
        </div>

        <!-- Status banner -->
        <div class="inbox-banner" :class="bannerClass">
          {{ bannerText }}
        </div>

        <!-- Messages -->
        <div ref="threadRef" class="inbox-messages">
          <div v-if="messagesLoading" class="space-y-3 p-4">
            <div v-for="i in 5" :key="i" class="flex" :class="i % 2 === 0 ? 'justify-end' : 'justify-start'">
              <div class="skeleton-card" :style="{ width: `${45 + (i * 7) % 30}%`, height: '2.5rem' }"></div>
            </div>
          </div>
          <div v-else-if="messagesError" class="p-4 text-sm text-zinc-400">{{ messagesError }}</div>
          <div v-else-if="messages.length === 0" class="p-4 text-sm text-zinc-400">No messages yet.</div>
          <div v-else class="flex flex-col gap-2 p-4">
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="flex"
              :class="msg.direction === 'inbound' ? 'justify-start' : 'justify-end'"
            >
              <div class="msg-bubble" :class="messageClass(msg)">
                <div>{{ msg.body_text }}</div>
                <div class="msg-meta" :class="metaClass(msg)">
                  {{ senderLabel(msg.sender_type) }} · {{ formatTime(msg.sent_at ?? msg.received_at ?? msg.created_at) }}
                  <template v-if="msg.direction === 'outbound' && msg.provider_status">
                    · {{ msg.provider_status }}
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Reply box -->
        <div v-if="!isTerminal" class="inbox-reply">
          <textarea
            ref="replyRef"
            v-model="replyText"
            class="inbox-reply-input"
            placeholder="Type a reply... Enter to send"
            rows="1"
            :disabled="sendLoading"
            @keydown.enter.exact.prevent="send"
            @input="autoResize"
          />
          <div class="flex items-center justify-between gap-3 mt-2">
            <span class="text-[11px] text-zinc-300">Enter sends</span>
            <button
              class="button-primary"
              :disabled="sendLoading || !replyText.trim()"
              @click="send"
            >
              {{ sendLoading ? 'Sending...' : 'Send' }}
            </button>
          </div>
        </div>
      </template>
    </section>

    <!-- Diagnostics panel -->
    <ConversationDiagnosticsPanel :conversation-id="selected?.id ?? null" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';
import ConversationDiagnosticsPanel from './ConversationDiagnosticsPanel.vue';

const API_BASE = '/api';

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  phone_e164: string;
  email: string;
}

interface Conv {
  id: string;
  status: string;
  outcome: string | null;
  human_controlled: boolean;
  needs_human: boolean;
  campaign_id?: string;
  has_lead_reply?: boolean;
  last_activity_at: string;
  lead: Lead | null;
  last_message: { body_text: string; sender_type: string; created_at: string }[] | null;
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

// "Active" is the engaged set: threads where the lead has actually replied and
// the conversation is still ongoing (resolved server-side via `engaged=true`),
// not the narrow status='active' it used to mean.
const filters = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'engaged' },
  { label: 'Needs Human', value: 'needs_human' },
  { label: 'Human Controlled', value: 'human_controlled' },
  { label: 'Completed', value: 'completed' },
];

const loading = ref(true);
const conversations = ref<Conv[]>([]);
const loadError = ref('');
const currentFilter = ref('');
const currentOutcome = ref('');
const currentAgent = ref('');
const currentAgentName = ref('');
const campaigns = ref<{ id: string; name: string }[]>([]);
const currentCampaign = ref('');

// Status/engaged values that have a dedicated pill in the tab bar. Filters set
// via dashboard deep-links (outcomes, agent, the "active" group) have no pill
// and are surfaced as removable chips instead.
const PILL_VALUES = new Set(['', 'engaged', 'needs_human', 'human_controlled', 'completed']);

const OUTCOME_LABELS: Record<string, string> = {
  booked: 'Booked',
  qualified_not_booked: 'Qualified',
  unqualified: 'Unqualified',
  no_response: 'No response',
  opted_out: 'Opted out',
  human_takeover: 'Needs human',
  other: 'Other',
};
const selectedId = ref<string | null>(null);
const selected = ref<Conv | null>(null);
const messages = ref<Msg[]>([]);
const messagesLoading = ref(false);
const messagesError = ref('');
const replyText = ref('');
const sendLoading = ref(false);
const actionLoading = ref(false);
const generatingReply = ref(false);
const generateError = ref('');
const markingBooked = ref(false);
const confirmingDelete = ref(false);
const threadRef = ref<HTMLElement | null>(null);
const replyRef = ref<HTMLTextAreaElement | null>(null);
let workspaceId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;

const isTerminal = computed(() =>
  selected.value ? ['completed', 'opted_out', 'failed'].includes(selected.value.status) : false
);

const bannerClass = computed(() => {
  if (!selected.value) return '';
  if (isTerminal.value) return 'bg-zinc-100 text-zinc-500';
  if (selected.value.human_controlled) return 'bg-sky-50 text-sky-700';
  return 'bg-emerald-50 text-emerald-700';
});

const bannerText = computed(() => {
  if (!selected.value) return '';
  if (isTerminal.value) return `Conversation ${selected.value.status.replace(/_/g, ' ')}`;
  if (selected.value.human_controlled) return 'You are currently controlling this conversation manually.';
  return 'AI is currently managing this conversation.';
});

// A pill is only highlighted when it owns the active metric — i.e. no outcome
// chip is in play and the filter value maps to a real pill.
function isPillActive(value: string): boolean {
  return currentFilter.value === value && !currentOutcome.value;
}

// Label for the metric chip shown when the active filter has no pill (the
// "active" status group). Outcome and agent chips are handled separately.
const metricChipLabel = computed(() => {
  if (currentFilter.value === 'active') return 'Active (live)';
  if (currentFilter.value && !PILL_VALUES.has(currentFilter.value)) {
    return currentFilter.value.replace(/_/g, ' ');
  }
  return '';
});

const outcomeChipLabel = computed(() =>
  currentOutcome.value ? OUTCOME_LABELS[currentOutcome.value] ?? currentOutcome.value.replace(/_/g, ' ') : '',
);

const agentChipLabel = computed(() => (currentAgent.value ? currentAgentName.value || 'Selected agent' : ''));

const hasContextFilters = computed(
  () => Boolean(metricChipLabel.value || outcomeChipLabel.value || agentChipLabel.value),
);

function leadName(conv: Conv): string {
  const l = conv.lead;
  if (!l) return 'Unknown';
  const name = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim();
  return name || l.phone_e164;
}

function lastPreview(conv: Conv): string {
  const text = conv.last_message?.[0]?.body_text ?? 'No messages yet';
  return text.length > 96 ? `${text.slice(0, 96)}...` : text;
}

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
  if (msg.direction === 'inbound') {
    return 'bg-zinc-100 text-zinc-800';
  }
  if (msg.sender_type === 'human') {
    return 'bg-amber-50 text-amber-900';
  }
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

function resolveWorkspace(): string | null {
  const { workspaceId } = getSessionContext();
  return workspaceId || null;
}

async function fetchCampaigns() {
  if (!workspaceId) return;
  const res = await fetch(`${API_BASE}/api-campaigns-list?workspace_id=${workspaceId}`);
  if (res.ok) campaigns.value = await res.json();
}

async function fetchConversations() {
  if (!workspaceId) return;
  loadError.value = '';
  const params = new URLSearchParams({ workspace_id: workspaceId });
  if (currentFilter.value === 'engaged') {
    params.set('engaged', 'true');
  } else if (currentFilter.value === 'active') {
    params.set('active', 'true');
  } else if (currentFilter.value) {
    params.set('status', currentFilter.value);
  }
  if (currentOutcome.value) params.set('outcome', currentOutcome.value);
  if (currentCampaign.value) params.set('campaign_id', currentCampaign.value);
  if (currentAgent.value) params.set('agent_id', currentAgent.value);
  const res = await fetch(`${API_BASE}/api-inbox-list?${params}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to load conversations' }));
    conversations.value = [];
    loadError.value = body.error ?? 'Failed to load conversations';
    return;
  }

  conversations.value = await res.json();
}

async function fetchMessages(convId: string) {
  messagesError.value = '';
  const res = await fetch(`${API_BASE}/api-inbox-messages?conversation_id=${convId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Failed to load messages' }));
    messages.value = [];
    messagesError.value = body.error ?? 'Failed to load messages';
    return;
  }

  messages.value = await res.json();
}

function scrollToBottom() {
  nextTick(() => {
    if (threadRef.value) threadRef.value.scrollTop = threadRef.value.scrollHeight;
  });
}

function setFilter(val: string) {
  currentFilter.value = val;
  // Pills own the status/engaged axis; selecting one clears any deep-linked
  // outcome filter so the two never silently stack.
  currentOutcome.value = '';
  selectedId.value = null;
  selected.value = null;
  messages.value = [];
  fetchConversations();
}

function clearOutcome() {
  currentOutcome.value = '';
  if (currentFilter.value === 'active') currentFilter.value = '';
  fetchConversations();
}

function clearMetric() {
  currentFilter.value = '';
  fetchConversations();
}

function clearAgent() {
  currentAgent.value = '';
  currentAgentName.value = '';
  fetchConversations();
}

async function openById(id: string) {
  let conv = conversations.value.find((c) => c.id === id);
  if (!conv) {
    const res = await fetch(
      `${API_BASE}/api-inbox-list?workspace_id=${workspaceId}&conversation_id=${id}&include_test=true`,
    );
    if (res.ok) {
      const arr = (await res.json()) as Conv[];
      conv = arr[0];
    }
  }
  if (conv) await select(conv);
}

function onCampaignChange() {
  // currentCampaign is already updated via v-model; clear the open thread
  // since it may not belong to the newly selected campaign.
  selectedId.value = null;
  selected.value = null;
  messages.value = [];
  fetchConversations();
}

async function select(conv: Conv) {
  confirmingDelete.value = false;
  selectedId.value = conv.id;
  selected.value = conv;
  messagesLoading.value = true;
  messagesError.value = '';
  await fetchMessages(conv.id);
  messagesLoading.value = false;
  scrollToBottom();
}

async function takeover() {
  if (!selected.value) return;
  actionLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}/api-inbox-takeover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: selected.value.id }),
    });
    if (res.ok) {
      await fetchConversations();
      const updated = conversations.value.find((c) => c.id === selectedId.value);
      if (updated) selected.value = updated;
    }
  } finally {
    actionLoading.value = false;
  }
}

async function release() {
  if (!selected.value) return;
  actionLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}/api-inbox-release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: selected.value.id }),
    });
    if (res.ok) {
      await fetchConversations();
      const updated = conversations.value.find((c) => c.id === selectedId.value);
      if (updated) selected.value = updated;
    }
  } finally {
    actionLoading.value = false;
  }
}

// Record a manual `booked` outcome for reporting. Fires no booking automation
// and leaves the status untouched (see api-inbox-mark-booked) — the thread stays
// open and human-controlled; only the outcome badge changes.
async function markBooked() {
  if (!selected.value) return;
  markingBooked.value = true;
  try {
    const res = await fetch(`${API_BASE}/api-inbox-mark-booked`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: selected.value.id }),
    });
    if (res.ok) {
      await fetchConversations();
      const updated = conversations.value.find((c) => c.id === selectedId.value);
      if (updated) selected.value = updated;
    }
  } finally {
    markingBooked.value = false;
  }
}

async function generateReply() {
  if (!selected.value) return;
  generatingReply.value = true;
  generateError.value = '';
  try {
    const res = await fetch(`${API_BASE}/api-inbox-generate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: selected.value.id }),
    });
    if (res.ok) {
      // The AI reply is generated asynchronously by the queue; refresh shortly
      // so the operator sees it land without manually reloading.
      await Promise.all([fetchConversations(), fetchMessages(selected.value.id)]);
      const updated = conversations.value.find((c) => c.id === selectedId.value);
      if (updated) selected.value = updated;
      scrollToBottom();
    } else {
      // Surface backend conflicts (e.g. a reply is already mid-flight) instead of
      // a silent no-op. Auto-clears so it doesn't linger.
      const body = await res.json().catch(() => ({}));
      generateError.value = body?.error ?? 'Could not generate a reply. Try again.';
      setTimeout(() => { generateError.value = ''; }, 6000);
    }
  } finally {
    generatingReply.value = false;
  }
}

async function executeDelete() {
  if (!selected.value) return;
  actionLoading.value = true;
  try {
    const res = await fetch(`${API_BASE}/api-inbox-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: selected.value.id }),
    });
    if (res.ok) {
      selectedId.value = null;
      selected.value = null;
      messages.value = [];
      confirmingDelete.value = false;
      await fetchConversations();
    }
  } finally {
    actionLoading.value = false;
  }
}

async function send() {
  if (!selected.value || !replyText.value.trim()) return;
  sendLoading.value = true;
  const res = await fetch(`${API_BASE}/api-inbox-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: selected.value.id, body_text: replyText.value.trim() }),
  });
  if (res.ok) {
    replyText.value = '';
    await Promise.all([fetchConversations(), fetchMessages(selected.value.id)]);
    const updated = conversations.value.find((c) => c.id === selectedId.value);
    if (updated) selected.value = updated;
    scrollToBottom();
  }
  sendLoading.value = false;
  replyRef.value?.focus();
}

function applyDeepLink(): string | null {
  const sp = new URLSearchParams(window.location.search);
  currentCampaign.value = sp.get('campaign_id') ?? '';
  currentAgent.value = sp.get('agent_id') ?? '';
  currentAgentName.value = sp.get('agent_name') ?? '';
  currentOutcome.value = sp.get('outcome') ?? '';

  if (sp.get('engaged') === 'true') {
    currentFilter.value = 'engaged';
  } else if (sp.get('active') === 'true') {
    currentFilter.value = 'active';
  } else {
    currentFilter.value = sp.get('status') ?? '';
  }

  return sp.get('id');
}

onMounted(async () => {
  workspaceId = resolveWorkspace();
  if (!workspaceId) {
    loading.value = false;
    return;
  }
  const openId = applyDeepLink();
  await Promise.all([fetchConversations(), fetchCampaigns()]);
  loading.value = false;
  if (openId) await openById(openId);

  const poll = async () => {
    if (document.hidden) return; // Skip polling when tab is not visible
    await fetchConversations();
    if (selectedId.value) {
      await fetchMessages(selectedId.value);
      const updated = conversations.value.find((c) => c.id === selectedId.value);
      if (updated) selected.value = updated;
    }
  };

  pollTimer = setInterval(poll, 20000);

  // Immediately poll when tab becomes visible after being hidden
  visibilityHandler = () => {
    if (!document.hidden) poll();
  };
  document.addEventListener('visibilitychange', visibilityHandler);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
});
</script>
