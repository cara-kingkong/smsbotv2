<template>
  <div class="flex gap-3" style="height: calc(100vh - 220px); min-height: 400px;">
    <!-- Left: Conversation list -->
    <div class="w-[360px] shrink-0 bg-surface border border-slate-700 rounded-lg overflow-hidden flex flex-col">
      <!-- Filters -->
      <div class="flex gap-1.5 p-3 border-b border-slate-700 flex-wrap">
        <button
          v-for="f in filters"
          :key="f.value"
          class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
          :class="currentFilter === f.value ? 'bg-blue-500 text-white' : 'bg-surface-hover text-slate-400 hover:text-slate-200'"
          @click="setFilter(f.value)"
        >
          {{ f.label }}
        </button>
      </div>

      <!-- List -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="loading" class="flex items-center justify-center h-full text-slate-400 text-sm">
          Loading...
        </div>
        <div v-else-if="conversations.length === 0" class="flex items-center justify-center h-full text-slate-400 text-sm p-6 text-center">
          No conversations found{{ currentFilter ? ' for this filter' : '' }}.
        </div>
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="flex flex-col gap-1 px-4 py-3 border-b border-slate-700 cursor-pointer transition-colors hover:bg-surface-hover"
          :class="{ 'bg-surface-hover border-l-[3px] border-l-blue-500': selectedId === conv.id }"
          @click="select(conv)"
        >
          <div class="flex justify-between items-center">
            <span class="font-semibold text-sm text-slate-100">{{ leadName(conv) }}</span>
            <span class="text-[11px] text-slate-400">{{ relativeTime(conv.last_activity_at) }}</span>
          </div>
          <div class="text-[13px] text-slate-400 truncate">{{ lastPreview(conv) }}</div>
          <span class="self-start text-[11px] px-2 py-0.5 rounded-full font-medium mt-0.5" :class="statusClass(conv.status)">
            {{ conv.status.replace(/_/g, ' ') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Right: Detail -->
    <div class="flex-1 bg-surface border border-slate-700 rounded-lg overflow-hidden flex flex-col">
      <div v-if="!selected" class="flex items-center justify-center h-full text-slate-400 text-sm">
        Select a conversation to view messages
      </div>

      <template v-else>
        <!-- Header -->
        <div class="flex justify-between items-center px-5 py-3 border-b border-slate-700 shrink-0">
          <div>
            <div class="font-semibold text-base">{{ leadName(selected) }}</div>
            <div class="text-[13px] text-slate-400">{{ selected.lead?.phone_e164 ?? '' }}</div>
          </div>
          <div class="flex gap-2">
            <button
              v-if="!isTerminal && selected.human_controlled"
              class="px-3 py-1.5 rounded-md text-[13px] font-medium bg-green-500 text-slate-900 hover:bg-green-400 disabled:opacity-50"
              :disabled="actionLoading"
              @click="release"
            >
              {{ actionLoading ? 'Releasing...' : 'Release to AI' }}
            </button>
            <button
              v-if="!isTerminal && !selected.human_controlled"
              class="px-3 py-1.5 rounded-md text-[13px] font-medium bg-amber-500 text-slate-900 hover:bg-amber-400 disabled:opacity-50"
              :disabled="actionLoading"
              @click="takeover"
            >
              {{ actionLoading ? 'Taking over...' : 'Take Over' }}
            </button>
          </div>
        </div>

        <!-- Status banner -->
        <div
          class="px-5 py-2 text-[13px] text-center shrink-0"
          :class="bannerClass"
        >
          {{ bannerText }}
        </div>

        <!-- Messages -->
        <div ref="threadRef" class="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <div v-if="messagesLoading" class="flex items-center justify-center h-full text-slate-400 text-sm">
            Loading messages...
          </div>
          <div v-else-if="messages.length === 0" class="flex items-center justify-center h-full text-slate-400 text-sm">
            No messages yet
          </div>
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="max-w-[75%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed break-words"
            :class="messageClass(msg)"
          >
            <div>{{ msg.body_text }}</div>
            <div class="text-[11px] mt-1" :class="metaClass(msg)">
              {{ senderLabel(msg.sender_type) }} &middot; {{ formatTime(msg.sent_at ?? msg.received_at ?? msg.created_at) }}
            </div>
          </div>
        </div>

        <!-- Reply box -->
        <div v-if="!isTerminal" class="flex gap-2 px-5 py-3 border-t border-slate-700 shrink-0">
          <textarea
            ref="replyRef"
            v-model="replyText"
            class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 resize-none placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            placeholder="Type a message..."
            rows="1"
            :disabled="sendLoading"
            @keydown.enter.exact.prevent="send"
            @input="autoResize"
          />
          <button
            class="self-end px-4 py-2 rounded-lg text-[13px] font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            :disabled="sendLoading || !replyText.trim()"
            @click="send"
          >
            {{ sendLoading ? '...' : 'Send' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { createClient } from '@supabase/supabase-js';

const API_BASE = '/.netlify/functions';
const supabase = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL ?? '',
  (import.meta as any).env.PUBLIC_SUPABASE_ANON_KEY ?? '',
);

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
const currentFilter = ref('');
const selectedId = ref<string | null>(null);
const selected = ref<Conv | null>(null);
const messages = ref<Msg[]>([]);
const messagesLoading = ref(false);
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
  if (isTerminal.value) return 'bg-slate-800/50 text-slate-400';
  if (selected.value.human_controlled) return 'bg-blue-500/10 text-blue-400';
  return 'bg-green-500/10 text-green-400';
});

const bannerText = computed(() => {
  if (!selected.value) return '';
  if (isTerminal.value) return `Conversation ${selected.value.status.replace(/_/g, ' ')}`;
  if (selected.value.human_controlled) return 'You are controlling this conversation';
  return 'AI is managing this conversation';
});

function leadName(conv: Conv): string {
  const l = conv.lead;
  if (!l) return 'Unknown';
  const name = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim();
  return name || l.phone_e164;
}

function lastPreview(conv: Conv): string {
  return conv.last_message?.[0]?.body_text ?? 'No messages yet';
}

function statusClass(status: string): string {
  const map: Record<string, string> = {
    active: 'bg-green-500/15 text-green-400',
    needs_human: 'bg-amber-500/15 text-amber-400',
    human_controlled: 'bg-blue-500/15 text-blue-400',
    waiting_for_lead: 'bg-slate-500/15 text-slate-400',
    completed: 'bg-slate-500/10 text-slate-500',
    opted_out: 'bg-red-500/15 text-red-400',
    queued: 'bg-slate-500/15 text-slate-400',
  };
  return map[status] ?? 'bg-slate-500/15 text-slate-400';
}

function messageClass(msg: Msg): string {
  if (msg.direction === 'inbound') return 'self-start bg-surface-hover rounded-bl-sm';
  if (msg.sender_type === 'human') return 'self-end bg-green-500 text-slate-900 rounded-br-sm';
  return 'self-end bg-blue-500 text-white rounded-br-sm';
}

function metaClass(msg: Msg): string {
  if (msg.direction === 'inbound') return 'text-slate-500';
  if (msg.sender_type === 'human') return 'text-green-900/60';
  return 'text-white/60';
}

function senderLabel(type: string): string {
  return { ai: 'AI', human: 'Human', lead: 'Lead', system: 'System' }[type] ?? type;
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function autoResize() {
  const el = replyRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

async function resolveWorkspace(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from('workspace_users')
    .select('workspace_id')
    .eq('user_id', session.user.id)
    .limit(1)
    .single();
  return data?.workspace_id ?? null;
}

async function fetchConversations() {
  if (!workspaceId) return;
  const params = new URLSearchParams({ workspace_id: workspaceId });
  if (currentFilter.value) params.set('status', currentFilter.value);
  const res = await fetch(`${API_BASE}/api-inbox-list?${params}`);
  if (res.ok) conversations.value = await res.json();
}

async function fetchMessages(convId: string) {
  const res = await fetch(`${API_BASE}/api-inbox-messages?conversation_id=${convId}`);
  if (res.ok) messages.value = await res.json();
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
    const updated = conversations.value.find(c => c.id === selectedId.value);
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
    const updated = conversations.value.find(c => c.id === selectedId.value);
    if (updated) selected.value = updated;
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
    const updated = conversations.value.find(c => c.id === selectedId.value);
    if (updated) selected.value = updated;
    scrollToBottom();
  }
  sendLoading.value = false;
  replyRef.value?.focus();
}

onMounted(async () => {
  workspaceId = await resolveWorkspace();
  if (!workspaceId) {
    loading.value = false;
    return;
  }
  await fetchConversations();
  loading.value = false;

  // Poll every 15s
  pollTimer = setInterval(async () => {
    await fetchConversations();
    if (selectedId.value) {
      await fetchMessages(selectedId.value);
      const updated = conversations.value.find(c => c.id === selectedId.value);
      if (updated) selected.value = updated;
    }
  }, 15000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>
