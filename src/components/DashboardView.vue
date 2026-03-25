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

    <!-- Campaign Performance -->
    <div v-if="campaigns.length > 0" class="mb-8 space-y-4">
      <h2 class="text-lg font-semibold">Campaign Performance</h2>

      <div
        v-for="campaign in campaigns"
        :key="campaign.campaign_id"
        class="bg-surface border border-slate-700 rounded-lg p-5"
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-base">{{ campaign.campaign_name }}</h3>
          <div class="flex gap-4 text-sm text-slate-400">
            <span>{{ campaign.total_conversations }} conversations</span>
            <span>
              Booking rate:
              <span class="text-white font-medium">{{ formatPct(campaignBookingRate(campaign)) }}</span>
            </span>
          </div>
        </div>

        <div v-if="campaign.agent_metrics.length === 0" class="text-sm text-slate-400">
          No agents assigned to this campaign yet.
        </div>

        <table v-else class="w-full">
          <thead>
            <tr class="text-left">
              <th class="text-[11px] uppercase tracking-wider text-slate-400 pb-2 px-3 border-b border-slate-700">Agent Name</th>
              <th class="text-[11px] uppercase tracking-wider text-slate-400 pb-2 px-3 border-b border-slate-700">Conversations</th>
              <th class="text-[11px] uppercase tracking-wider text-slate-400 pb-2 px-3 border-b border-slate-700">Booking Rate</th>
              <th class="text-[11px] uppercase tracking-wider text-slate-400 pb-2 px-3 border-b border-slate-700">Opt-Out Rate</th>
              <th class="text-[11px] uppercase tracking-wider text-slate-400 pb-2 px-3 border-b border-slate-700">Takeover Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="agent in campaign.agent_metrics"
              :key="agent.agent_id"
              class="hover:bg-surface-hover transition-colors"
            >
              <td class="text-sm py-2.5 px-3 border-b border-slate-700/50">{{ agent.agent_name }}</td>
              <td class="text-sm py-2.5 px-3 border-b border-slate-700/50 text-slate-400">{{ agent.total_conversations }}</td>
              <td class="text-sm py-2.5 px-3 border-b border-slate-700/50">
                <span
                  class="text-[11px] px-2 py-0.5 rounded-full font-medium"
                  :class="isBestBooking(campaign, agent) ? 'bg-green-500/15 text-green-400' : 'text-slate-300'"
                >
                  {{ formatPct(agent.booking_rate) }}
                </span>
              </td>
              <td class="text-sm py-2.5 px-3 border-b border-slate-700/50 text-slate-400">{{ formatPct(agent.opt_out_rate) }}</td>
              <td class="text-sm py-2.5 px-3 border-b border-slate-700/50 text-slate-400">{{ formatPct(agent.human_takeover_rate) }}</td>
            </tr>
          </tbody>
        </table>
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

interface AgentMetric {
  agent_id: string;
  agent_name: string;
  total_conversations: number;
  booking_rate: number;
  opt_out_rate: number;
  human_takeover_rate: number;
  avg_messages_per_conversation: number;
}

interface CampaignMetric {
  campaign_id: string;
  campaign_name: string;
  total_conversations: number;
  active_conversations: number;
  booked: number;
  qualified_not_booked: number;
  unqualified: number;
  no_response: number;
  opted_out: number;
  human_takeover: number;
  agent_metrics: AgentMetric[];
}

const loading = ref(true);
const stats = ref<Record<string, number>>({});
const conversations = ref<Conv[]>([]);
const campaigns = ref<CampaignMetric[]>([]);

const statCards = [
  { key: 'total', label: 'Total Conversations', clickable: false },
  { key: 'active', label: 'Active', clickable: false },
  { key: 'booked', label: 'Booked', clickable: false },
  { key: 'qualified', label: 'Qualified', clickable: false },
  { key: 'opted_out', label: 'Opt-Outs', clickable: false },
  { key: 'needs_human', label: 'Needs Human', clickable: true },
];

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function campaignBookingRate(campaign: CampaignMetric): number {
  if (campaign.total_conversations === 0) return 0;
  return campaign.booked / campaign.total_conversations;
}

function isBestBooking(campaign: CampaignMetric, agent: AgentMetric): boolean {
  if (campaign.agent_metrics.length <= 1) return false;
  const maxRate = Math.max(...campaign.agent_metrics.map((a) => a.booking_rate));
  return agent.booking_rate === maxRate && maxRate > 0;
}

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

  const [reportingRes, convRes] = await Promise.all([
    fetch(`${API_BASE}/api-reporting-workspace?workspace_id=${workspaceId}`),
    fetch(`${API_BASE}/api-inbox-list?workspace_id=${workspaceId}&limit=10`),
  ]);

  if (reportingRes.ok) {
    const data = await reportingRes.json();
    const wm = data.workspace_metrics;

    // Map workspace metrics to the stats grid keys
    stats.value = {
      total: wm.total_conversations,
      active: wm.active_conversations,
      booked: wm.booked,
      qualified: wm.qualified_not_booked,
      opted_out: wm.opted_out,
      needs_human: wm.human_takeover,
    };

    campaigns.value = data.campaigns ?? [];
  }

  if (convRes.ok) conversations.value = await convRes.json();

  loading.value = false;
});
</script>
