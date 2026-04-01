<template>
  <SetupDashboard v-if="!isActivated" />
  <div v-else class="space-y-8">
    <section class="hero-panel">
      <div class="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div>
          <div class="page-kicker">Workspace Pulse</div>
          <h2 class="section-title mt-3 text-[1.75rem] sm:text-[2rem]">
            Daily operating view for conversation load, team handoffs, and booking output.
          </h2>
          <p class="section-copy mt-3 max-w-2xl">
            Use the dashboard to see what is converting, what needs a human, and where campaign volume is building before you drill into the inbox.
          </p>

          <div class="mt-5 rounded-[16px] border border-slate-900/6 bg-slate-50/90 px-4 py-3 text-sm text-slate-500">
            Latest snapshot across campaigns, live inbox activity, and operator follow-up.
          </div>

          <div class="mt-6 grid gap-3 sm:grid-cols-3">
            <div class="stat-card">
              <div class="stat-label">Campaigns Tracked</div>
              <div class="stat-value text-[2rem]">{{ campaigns.length }}</div>
              <div class="stat-meta">Live reporting coverage across this workspace.</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Booking Rate</div>
              <div class="stat-value text-[2rem]">{{ formatPct(bookedRate) }}</div>
              <div class="stat-meta">Calculated from all tracked conversations.</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Needs Human</div>
              <div class="stat-value text-[2rem]">{{ formatPct(attentionRate) }}</div>
              <div class="stat-meta">Share of threads requiring operator follow-up.</div>
            </div>
          </div>
        </div>

        <div class="panel-muted space-y-5">
          <div>
            <div class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Main Info</div>
            <div class="mt-3 text-xl font-semibold tracking-tight text-slate-900">
              {{ topCampaign?.campaign_name ?? 'No campaign data yet' }}
            </div>
            <p class="mt-2 text-sm leading-6 text-slate-600">
              <template v-if="topCampaign">
                Top campaign by current booking rate across the latest workspace metrics.
              </template>
              <template v-else>
                This panel highlights the current top performer once reporting data is available.
              </template>
            </p>
          </div>

          <div class="divide-y divide-slate-200/70 rounded-[16px] border border-slate-200/70 bg-white/88">
            <div class="flex items-center justify-between px-4 py-3 text-sm">
              <span class="text-slate-500">Conversations</span>
              <span class="font-semibold text-slate-900">{{ stats.total ?? 0 }}</span>
            </div>
            <div class="flex items-center justify-between px-4 py-3 text-sm">
              <span class="text-slate-500">Booking rate</span>
              <span class="font-semibold text-slate-900">{{ formatPct(bookedRate) }}</span>
            </div>
            <div class="flex items-center justify-between px-4 py-3 text-sm">
              <span class="text-slate-500">Needs human</span>
              <span class="font-semibold text-slate-900">{{ stats.needs_human ?? 0 }}</span>
            </div>
            <div class="flex items-center justify-between px-4 py-3 text-sm">
              <span class="text-slate-500">Recent threads</span>
              <span class="font-semibold text-slate-900">{{ conversations.length }}</span>
            </div>
          </div>

          <div class="note-box">
            Prioritise the inbox when human handoff climbs above the normal workspace baseline.
          </div>

          <button class="button-secondary w-full" @click="goToConversations">Open conversation inbox</button>
        </div>
      </div>
    </section>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <div
        v-for="stat in statCards"
        :key="stat.key"
        class="stat-card"
        :class="stat.clickable ? 'stat-card-clickable cursor-pointer' : ''"
        @click="stat.clickable ? goToConversations() : undefined"
      >
        <div class="stat-label">{{ stat.label }}</div>
        <div class="stat-value">{{ stats[stat.key] ?? '--' }}</div>
        <div class="stat-meta">{{ stat.description }}</div>
      </div>
    </section>

    <section class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
      <div class="panel">
        <div class="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 class="section-title">Campaign Performance</h2>
            <p class="section-copy">Compare conversation volume and agent outcomes without leaving the main dashboard.</p>
          </div>
          <div class="page-badge">Performance by campaign</div>
        </div>

        <div v-if="campaigns.length === 0" class="empty-state">
          Campaign analytics will appear here once campaigns start receiving conversation volume.
        </div>

        <div v-else class="space-y-5">
          <article
            v-for="campaign in campaigns"
            :key="campaign.campaign_id"
            class="rounded-[24px] border border-slate-200/70 bg-white/78 p-5"
          >
            <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 class="text-lg font-semibold tracking-tight text-slate-900">{{ campaign.campaign_name }}</h3>
                <p class="mt-1 text-sm text-slate-600">
                  {{ campaign.total_conversations }} conversations and
                  <span class="font-semibold text-slate-900">{{ formatPct(campaignBookingRate(campaign)) }}</span> booking rate.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <span class="badge bg-emerald-50 text-emerald-700">Booked {{ campaign.booked }}</span>
                <span class="badge bg-amber-50 text-amber-700">Qualified {{ campaign.qualified_not_booked }}</span>
                <span class="badge bg-slate-100 text-slate-600">Active {{ campaign.active_conversations }}</span>
              </div>
            </div>

            <div v-if="campaign.agent_metrics.length === 0" class="note-box mt-4">
              No agents are assigned to this campaign yet.
            </div>

            <div v-else class="table-shell mt-4 overflow-x-auto">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Conversations</th>
                    <th>Booking Rate</th>
                    <th>Opt-Out Rate</th>
                    <th>Takeover Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="agent in campaign.agent_metrics" :key="agent.agent_id">
                    <td class="font-semibold">{{ agent.agent_name }}</td>
                    <td class="text-slate-600">{{ agent.total_conversations }}</td>
                    <td>
                      <span
                        class="badge"
                        :class="isBestBooking(campaign, agent) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'"
                      >
                        {{ formatPct(agent.booking_rate) }}
                      </span>
                    </td>
                    <td class="text-slate-600">{{ formatPct(agent.opt_out_rate) }}</td>
                    <td class="text-slate-600">{{ formatPct(agent.human_takeover_rate) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>

      <div class="panel">
        <div class="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 class="section-title">Recent Conversations</h2>
            <p class="section-copy">Recent threads with the latest status and message preview.</p>
          </div>
        </div>

        <div v-if="loading" class="empty-state min-h-[320px]">Loading workspace activity...</div>
        <div v-else-if="conversations.length === 0" class="empty-state min-h-[320px]">
          No conversations yet. New inbound leads will start appearing here automatically.
        </div>

        <div v-else class="space-y-3">
          <button
            v-for="conv in conversations"
            :key="conv.id"
            class="list-card"
            @click="goToConversations()"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-slate-900">{{ leadName(conv) }}</div>
                <div class="mt-1 text-sm text-slate-500">{{ conv.lead?.phone_e164 ?? '' }}</div>
              </div>
              <span class="badge" :class="statusClass(conv.status)">
                {{ conv.status.replace(/_/g, ' ') }}
              </span>
            </div>
            <p class="mt-4 text-sm leading-6 text-slate-600">
              {{ lastPreview(conv) }}
            </p>
            <div class="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {{ relativeTime(conv.last_activity_at) }}
            </div>
          </button>
        </div>
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
  { key: 'total', label: 'Total Conversations', clickable: false, description: 'All tracked conversation threads.' },
  { key: 'active', label: 'Active', clickable: false, description: 'Currently open and progressing.' },
  { key: 'booked', label: 'Booked', clickable: false, description: 'Leads that reached a booking outcome.' },
  { key: 'qualified', label: 'Qualified', clickable: false, description: 'Qualified leads not yet booked.' },
  { key: 'opted_out', label: 'Opt-Outs', clickable: false, description: 'Threads that exited after opt-out.' },
  { key: 'needs_human', label: 'Needs Human', clickable: true, description: 'Open these directly from the inbox.' },
];

const bookedRate = computed(() => {
  const total = stats.value.total ?? 0;
  if (!total) return 0;
  return (stats.value.booked ?? 0) / total;
});

const attentionRate = computed(() => {
  const total = stats.value.total ?? 0;
  if (!total) return 0;
  return (stats.value.needs_human ?? 0) / total;
});

const topCampaign = computed(() => {
  if (!campaigns.value.length) return null;
  return [...campaigns.value].sort((a, b) => campaignBookingRate(b) - campaignBookingRate(a))[0];
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
