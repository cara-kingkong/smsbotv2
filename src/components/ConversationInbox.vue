<template>
  <div
    class="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]"
    style="min-height: calc(100vh - 280px);"
  >
    <aside class="panel flex min-h-[520px] flex-col overflow-hidden p-0">
      <div class="border-b border-slate-200/80 px-5 py-5">
        <div class="page-kicker">Conversation Triage</div>
        <h2 class="section-title mt-3">Shared inbox</h2>
        <p class="section-copy mt-2">
          Scan live conversation state, filter by control mode, and jump into the right thread quickly.
        </p>
      </div>

      <div class="border-b border-slate-200/70 px-4 py-4">
        <div class="pill-tabs">
          <button
            v-for="f in filters"
            :key="f.value"
            class="pill-tab"
            :class="currentFilter === f.value ? 'pill-tab-active' : ''"
            @click="setFilter(f.value)"
          >
            {{ f.label }}
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-3 py-3">
        <div v-if="loading" class="empty-state min-h-full">Loading conversations...</div>
        <div v-else-if="loadError" class="empty-state min-h-full">{{ loadError }}</div>
        <div v-else-if="conversations.length === 0" class="empty-state min-h-full">
          No conversations found{{ currentFilter ? ' for this filter' : '' }}.
        </div>
        <div v-else class="space-y-2">
          <button
            v-for="conv in conversations"
            :key="conv.id"
            class="list-card"
            :class="
              selectedId === conv.id
                ? 'list-card-active'
                : ''
            "
            @click="select(conv)"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-slate-900">{{ leadName(conv) }}</div>
                <div class="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {{ relativeTime(conv.last_activity_at) }}
                </div>
              </div>
              <span class="badge" :class="statusClass(conv.status)">
                {{ conv.status.replace(/_/g, ' ') }}
              </span>
            </div>
            <p class="mt-3 text-sm leading-6 text-slate-600">{{ lastPreview(conv) }}</p>
          </button>
        </div>
      </div>
    </aside>

    <section class="panel flex min-h-[520px] flex-col overflow-hidden p-0">
      <div v-if="!selected" class="empty-state m-5 flex-1">
        Select a conversation to review messages, take control, or reply manually.
      </div>

      <template v-else>
        <div class="border-b border-slate-200/80 px-5 py-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="section-title">{{ leadName(selected) }}</h2>
                <span class="badge" :class="statusClass(selected.status)">
                  {{ selected.status.replace(/_/g, ' ') }}
                </span>
              </div>
              <p class="mt-2 text-sm text-slate-500">{{ selected.lead?.phone_e164 ?? '' }}</p>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                v-if="!isTerminal && selected.human_controlled"
                class="button-secondary"
                :disabled="actionLoading"
                @click="release"
              >
                {{ actionLoading ? 'Releasing...' : 'Release to AI' }}
              </button>
              <button
                v-if="!isTerminal && !selected.human_controlled"
                class="button-primary"
                :disabled="actionLoading"
                @click="takeover"
              >
                {{ actionLoading ? 'Taking over...' : 'Take Over' }}
              </button>
              <button
                class="button-secondary !text-red-600 hover:!bg-red-50"
                :disabled="actionLoading"
                @click="confirmDelete"
              >
                {{ actionLoading ? 'Deleting...' : 'Delete' }}
              </button>
            </div>
          </div>
        </div>

        <div class="border-b border-slate-200/70 px-5 py-3">
          <div class="rounded-[16px] px-4 py-3 text-sm font-medium" :class="bannerClass">
            {{ bannerText }}
          </div>
        </div>

        <div
          ref="threadRef"
          class="flex-1 overflow-y-auto px-5 py-5"
          style="background: linear-gradient(180deg, rgba(255,255,255,0.42), rgba(245,247,244,0.78));"
        >
          <div v-if="messagesLoading" class="empty-state min-h-full">Loading messages...</div>
          <div v-else-if="messagesError" class="empty-state min-h-full">{{ messagesError }}</div>
          <div v-else-if="messages.length === 0" class="empty-state min-h-full">No messages yet.</div>
          <div v-else class="flex flex-col gap-3">
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="flex"
              :class="msg.direction === 'inbound' ? 'justify-start' : 'justify-end'"
            >
              <div
                class="max-w-[86%] rounded-[24px] px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[72%]"
                :class="messageClass(msg)"
              >
                <div>{{ msg.body_text }}</div>
                <div class="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em]" :class="metaClass(msg)">
                  {{ senderLabel(msg.sender_type) }} · {{ formatTime(msg.sent_at ?? msg.received_at ?? msg.created_at) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!isTerminal" class="border-t border-slate-200/80 px-5 py-5">
          <div class="rounded-[18px] border border-slate-200/80 bg-white/92 p-3">
            <textarea
              ref="replyRef"
              v-model="replyText"
              class="textarea min-h-[72px] border-0 bg-transparent px-2 py-2 shadow-none focus:shadow-none"
              placeholder="Type an SMS reply and press Enter to send..."
              rows="1"
              :disabled="sendLoading"
              @keydown.enter.exact.prevent="send"
              @input="autoResize"
            />
            <div class="mt-3 flex items-center justify-between gap-3">
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Enter sends immediately
              </p>
              <button
                class="button-primary"
                :disabled="sendLoading || !replyText.trim()"
                @click="send"
              >
                {{ sendLoading ? 'Sending...' : 'Send reply' }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

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
  human_controlled: boolean;
  needs_human: boolean;
  last_activity_at: string;
  lead: Lead | null;
  last_message: { body_text: string; sender_type: string; created_at: string }[] | null;
}

interface Msg {
  id: string;
  direction: string;
  sender_type: string;
  body_text: string;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
}

const filters = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Needs Human', value: 'needs_human' },
  { label: 'Human Controlled', value: 'human_controlled' },
];

const loading = ref(true);
const conversations = ref<Conv[]>([]);
const loadError = ref('');
const currentFilter = ref('');
const selectedId = ref<string | null>(null);
const selected = ref<Conv | null>(null);
const messages = ref<Msg[]>([]);
const messagesLoading = ref(false);
const messagesError = ref('');
const replyText = ref('');
const sendLoading = ref(false);
const actionLoading = ref(false);
const threadRef = ref<HTMLElement | null>(null);
const replyRef = ref<HTMLTextAreaElement | null>(null);

let workspaceId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const isTerminal = computed(() =>
  selected.value ? ['completed', 'opted_out', 'failed'].includes(selected.value.status) : false
);

const bannerClass = computed(() => {
  if (!selected.value) return '';
  if (isTerminal.value) return 'bg-slate-100 text-slate-600';
  if (selected.value.human_controlled) return 'bg-sky-50 text-sky-700';
  return 'bg-emerald-50 text-emerald-700';
});

const bannerText = computed(() => {
  if (!selected.value) return '';
  if (isTerminal.value) return `Conversation ${selected.value.status.replace(/_/g, ' ')}`;
  if (selected.value.human_controlled) return 'You are currently controlling this conversation manually.';
  return 'AI is currently managing this conversation.';
});

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
    return 'border border-slate-200/80 bg-white text-slate-800';
  }
  if (msg.sender_type === 'human') {
    return 'bg-amber-50 text-amber-950';
  }
  return 'bg-teal-600 text-white';
}

function metaClass(msg: Msg): string {
  if (msg.direction === 'inbound') return 'text-slate-400';
  if (msg.sender_type === 'human') return 'text-amber-700';
  return 'text-teal-100';
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

async function fetchConversations() {
  if (!workspaceId) return;
  loadError.value = '';
  const params = new URLSearchParams({ workspace_id: workspaceId });
  if (currentFilter.value) params.set('status', currentFilter.value);
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
  selectedId.value = null;
  selected.value = null;
  messages.value = [];
  fetchConversations();
}

async function select(conv: Conv) {
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
  actionLoading.value = false;
}

async function release() {
  if (!selected.value) return;
  actionLoading.value = true;
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
  actionLoading.value = false;
}

async function confirmDelete() {
  if (!selected.value) return;
  const name = leadName(selected.value);
  if (!window.confirm(`Delete conversation with ${name}? This cannot be undone.`)) return;
  actionLoading.value = true;
  const res = await fetch(`${API_BASE}/api-inbox-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: selected.value.id }),
  });
  if (res.ok) {
    selectedId.value = null;
    selected.value = null;
    messages.value = [];
    await fetchConversations();
  }
  actionLoading.value = false;
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

onMounted(async () => {
  workspaceId = resolveWorkspace();
  if (!workspaceId) {
    loading.value = false;
    return;
  }
  await fetchConversations();
  loading.value = false;

  pollTimer = setInterval(async () => {
    await fetchConversations();
    if (selectedId.value) {
      await fetchMessages(selectedId.value);
      const updated = conversations.value.find((c) => c.id === selectedId.value);
      if (updated) selected.value = updated;
    }
  }, 15000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>
