<template>
  <div>
    <!-- Stats grid -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
      <div
        v-for="stat in statCards"
        :key="stat.key"
        class="bg-surface border border-slate-700 rounded-lg p-4"
        :class="stat.clickable ? 'cursor-pointer hover:border-blue-500 transition-colors' : ''"
        @click="stat.clickable ? goToConversations() : undefined"
      >
        <div class="text-[11px] uppercase tracking-wider text-slate-400">{{ stat.label }}</div>
        <div class="text-2xl font-bold mt-1">{{ stats[stat.key] ?? '--' }}</div>
      </div>
    </div>

    <!-- Recent conversations -->
    <div class="bg-surface border border-slate-700 rounded-lg p-5">
      <h2 class="text-lg font-semibold mb-4">Recent Conversations</h2>

      <div v-if="loading" class="text-sm text-slate-400">Loading...</div>
      <div v-else-if="conversations.length === 0" class="text-sm text-slate-400">
        No conversations yet. Conversations appear when leads are posted via webhook.
      </div>

      <table v-else class="w-full">
        <thead>
          <tr class="text-left">
            <th class="text-[11px] uppercase tracking-wider text-slate-400 pb-2 px-3 border-b border-slate-700">Lead</th>
            <th class="text-[11px] uppercase tracking-wider text-slate-400 pb-2 px-3 border-b border-slate-700">Phone</th>
            <th class="text-[11px] uppercase tracking-wider text-slate-400 pb-2 px-3 border-b border-slate-700">Status</th>
            <th class="text-[11px] uppercase tracking-wider text-slate-400 pb-2 px-3 border-b border-slate-700">Last Message</th>
            <th class="text-[11px] uppercase tracking-wider text-slate-400 pb-2 px-3 border-b border-slate-700">Activity</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="conv in conversations"
            :key="conv.id"
            class="cursor-pointer hover:bg-surface-hover transition-colors"
            @click="goToConversations()"
          >
            <td class="text-sm py-2.5 px-3 border-b border-slate-700/50">{{ leadName(conv) }}</td>
            <td class="text-sm py-2.5 px-3 border-b border-slate-700/50 text-slate-400">{{ conv.lead?.phone_e164 ?? '' }}</td>
            <td class="text-sm py-2.5 px-3 border-b border-slate-700/50">
              <span class="text-[11px] px-2 py-0.5 rounded-full font-medium" :class="statusClass(conv.status)">
                {{ conv.status.replace(/_/g, ' ') }}
              </span>
            </td>
            <td class="text-sm py-2.5 px-3 border-b border-slate-700/50 text-slate-400 max-w-[200px] truncate">
              {{ lastPreview(conv) }}
            </td>
            <td class="text-sm py-2.5 px-3 border-b border-slate-700/50 text-slate-400">{{ relativeTime(conv.last_activity_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { createClient } from '@supabase/supabase-js';

const API_BASE = '/.netlify/functions';
const supabase = createClient(
  (import.meta as any).env.PUBLIC_SUPABASE_URL ?? '',
  (import.meta as any).env.PUBLIC_SUPABASE_ANON_KEY ?? '',
);

interface Conv {
  id: string;
  status: string;
  last_activity_at: string;
  lead: { first_name: string; last_name: string; phone_e164: string } | null;
  last_message: { body_text: string; sender_type: string }[] | null;
}

const loading = ref(true);
const stats = ref<Record<string, number>>({});
const conversations = ref<Conv[]>([]);

const statCards = [
  { key: 'total', label: 'Total Conversations', clickable: false },
  { key: 'active', label: 'Active', clickable: false },
  { key: 'booked', label: 'Booked', clickable: false },
  { key: 'qualified', label: 'Qualified', clickable: false },
  { key: 'opted_out', label: 'Opt-Outs', clickable: false },
  { key: 'needs_human', label: 'Needs Human', clickable: true },
];

function leadName(conv: Conv): string {
  const l = conv.lead;
  if (!l) return 'Unknown';
  const name = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim();
  return name || l.phone_e164;
}

function lastPreview(conv: Conv): string {
  const msg = conv.last_message?.[0]?.body_text ?? '--';
  return msg.length > 60 ? msg.substring(0, 60) + '...' : msg;
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

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function goToConversations() {
  window.location.href = '/conversations';
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

onMounted(async () => {
  const workspaceId = await resolveWorkspace();
  if (!workspaceId) {
    loading.value = false;
    return;
  }

  const [statsRes, convRes] = await Promise.all([
    fetch(`${API_BASE}/api-dashboard-stats?workspace_id=${workspaceId}`),
    fetch(`${API_BASE}/api-inbox-list?workspace_id=${workspaceId}&limit=10`),
  ]);

  if (statsRes.ok) stats.value = await statsRes.json();
  if (convRes.ok) conversations.value = await convRes.json();

  loading.value = false;
});
</script>
