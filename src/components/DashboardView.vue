<template>
  <SetupDashboard v-if="!isActivated" />
  <div v-else class="space-y-6">
    <!-- Metrics row -->
    <section class="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
      <div
        v-for="stat in statCards"
        :key="stat.key"
        class="stat-card"
        :class="stat.clickable ? 'stat-card-clickable' : ''"
        @click="stat.clickable ? goToConversations() : undefined"
      >
        <div class="stat-label">{{ stat.label }}</div>
        <div class="stat-value">
          <template v-if="loading"><span class="skeleton-value">&nbsp;</span></template>
          <template v-else>{{ stats[stat.key] ?? '--' }}</template>
        </div>
      </div>
    </section>

    <!-- Campaign performance -->
    <section>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="section-title">Campaign performance</h2>
      </div>

      <div v-if="loading" class="space-y-3">
        <div v-for="i in 2" :key="i" class="skeleton-row"></div>
      </div>
      <div v-else-if="campaigns.length === 0" class="empty-state">
        Campaign analytics will appear here once campaigns start receiving conversations.
      </div>

      <div v-else class="table-shell overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Conversations</th>
              <th>Booked</th>
              <th>Booking Rate</th>
              <th>Qualified</th>
              <th>Needs Human</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="campaign in campaigns" :key="campaign.campaign_id">
              <td class="font-medium">{{ campaign.campaign_name }}</td>
              <td>{{ campaign.total_conversations }}</td>
              <td>{{ campaign.booked }}</td>
              <td>
                <span
                  class="badge"
                  :class="campaignBookingRate(campaign) > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'"
                >
                  {{ formatPct(campaignBookingRate(campaign)) }}
                </span>
              </td>
              <td>{{ campaign.qualified_not_booked }}</td>
              <td>{{ campaign.human_takeover }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Agent breakdown per campaign (collapsed under campaign table) -->
      <template v-if="!loading">
        <div v-for="campaign in campaignsWithAgents" :key="'agents-' + campaign.campaign_id" class="mt-4">
          <div class="mb-2 text-[12px] font-medium text-zinc-400">
            {{ campaign.campaign_name }} &mdash; Agent split
          </div>
          <div class="table-shell overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Conversations</th>
                  <th>Booking Rate</th>
                  <th>Opt-Out</th>
                  <th>Takeover</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="agent in campaign.agent_metrics" :key="agent.agent_id">
                  <td class="font-medium">{{ agent.agent_name }}</td>
                  <td>{{ agent.total_conversations }}</td>
                  <td>
                    <span
                      class="badge"
                      :class="isBestBooking(campaign, agent) ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'"
                    >
                      {{ formatPct(agent.booking_rate) }}
                    </span>
                  </td>
                  <td>{{ formatPct(agent.opt_out_rate) }}</td>
                  <td>{{ formatPct(agent.human_takeover_rate) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </section>

    <!-- Recent conversations -->
    <section>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="section-title">Recent conversations</h2>
        <button class="text-[13px] font-medium text-zinc-400 hover:text-zinc-700 transition" @click="goToConversations">
          View all
        </button>
      </div>

      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="skeleton-row"></div>
      </div>
      <div v-else-if="conversations.length === 0" class="empty-state">
        No conversations yet. New inbound leads will appear here automatically.
      </div>

      <div v-else class="table-shell overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Last Message</th>
              <th>Activity</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="conv in conversations"
              :key="conv.id"
              class="cursor-pointer"
              @click="goToConversations()"
            >
              <td class="font-medium">{{ leadName(conv) }}</td>
              <td class="text-zinc-500">{{ conv.lead?.phone_e164 ?? '' }}</td>
              <td>
                <span class="badge" :class="statusClass(conv.status)">
                  {{ conv.status.replace(/_/g, ' ') }}
                </span>
              </td>
              <td class="text-zinc-500 max-w-[240px] truncate">{{ lastPreview(conv) }}</td>
              <td class="text-zinc-400 text-[13px]">{{ relativeTime(conv.last_activity_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';
import SetupDashboard from './SetupDashboard.vue';

const API_BASE = '/api';

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

const isActivated = ref(true); // default to true so normal dashboard shows during SSR
const loading = ref(true);
const stats = ref<Record<string, number>>({});
const conversations = ref<Conv[]>([]);
const campaigns = ref<CampaignMetric[]>([]);

const statCards = [
  { key: 'total', label: 'Conversations', clickable: false },
  { key: 'active', label: 'Active', clickable: false },
  { key: 'booked', label: 'Booked', clickable: false },
  { key: 'qualified', label: 'Qualified', clickable: false },
  { key: 'opted_out', label: 'Opt-outs', clickable: false },
  { key: 'needs_human', label: 'Needs human', clickable: true },
];

const campaignsWithAgents = computed(() => {
  return campaigns.value.filter(c => c.agent_metrics.length > 0);
});

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
  return msg.length > 88 ? `${msg.substring(0, 88)}...` : msg;
}

function statusClass(status: string): string {
  const map: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700',
    needs_human: 'bg-amber-50 text-amber-700',
    human_controlled: 'bg-sky-50 text-sky-700',
    waiting_for_lead: 'bg-slate-100 text-slate-600',
    completed: 'bg-slate-100 text-slate-600',
    opted_out: 'bg-rose-50 text-rose-700',
    queued: 'bg-slate-100 text-slate-600',
  };
  return map[status] ?? 'bg-slate-100 text-slate-600';
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

function goToConversations() {
  window.location.href = '/conversations';
}

function resolveWorkspace(): string | null {
  const { workspaceId } = getSessionContext();
  return workspaceId || null;
}

onMounted(async () => {
  const onboarding = (window as any).__KONG_ONBOARDING__;
  if (onboarding && !onboarding.isActivated) {
    isActivated.value = false;
    loading.value = false;
    return; // Don't fetch dashboard data during setup
  }

  const workspaceId = resolveWorkspace();
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

  if (convRes.ok) {
    conversations.value = await convRes.json();
  }

  loading.value = false;
});
</script>
