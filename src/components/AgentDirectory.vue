<template>
  <div class="w-full" style="min-height: calc(100vh - 280px);">
    <!-- Action bar -->
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search agents..."
          class="input sm:max-w-xs"
        />
        <div class="flex gap-2">
          <button
            v-for="f in statusFilters"
            :key="f.value"
            class="pill-tab"
            :class="activeFilter === f.value ? 'pill-tab-active' : ''"
            @click="activeFilter = f.value"
          >
            {{ f.label }}
          </button>
        </div>
      </div>
      <button class="button-primary" @click="showCreateModal = true">
        New Agent
      </button>
    </div>

    <!-- Agent list -->
    <div v-if="listLoading" class="empty-state">Loading agents...</div>
    <div v-else-if="filteredAgents.length === 0" class="empty-state">
      <template v-if="agents.length === 0">
        No agents yet. Click "New Agent" to create your first agent.
      </template>
      <template v-else>
        No agents match your search or filter.
      </template>
    </div>
    <div v-else class="space-y-3">
      <a
        v-for="agent in filteredAgents"
        :key="agent.id"
        :href="`/agents/${agent.id}`"
        class="list-card block"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-sm font-bold text-teal-700">
                {{ agent.name.charAt(0).toUpperCase() }}{{ agent.name.charAt(1)?.toUpperCase() || '' }}
              </div>
              <div class="min-w-0">
                <div class="text-sm font-semibold text-slate-900 truncate">{{ agent.name }}</div>
                <div class="mt-0.5 flex items-center gap-2 flex-wrap">
                  <span
                    class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                    style="border-color: rgba(17,17,17,0.08); background: rgba(17,17,17,0.03); color: var(--text-muted);"
                  >
                    {{ agent.campaign_name }}
                  </span>
                  <span class="text-[11px] text-slate-400">
                    wt {{ agent.weight }}
                    <template v-if="agent.active_version_number"> &middot; v{{ agent.active_version_number }}</template>
                  </span>
                </div>
              </div>
            </div>
            <div v-if="agent.description" class="mt-2 ml-[52px] text-xs text-slate-500 line-clamp-1">
              {{ agent.description }}
            </div>
          </div>
          <span class="badge shrink-0" :class="statusClass(agent.status)">{{ agent.status }}</span>
        </div>
      </a>
    </div>

    <!-- Create Agent Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal-panel">
        <div class="flex items-center justify-between border-b px-5 py-4" style="border-color: rgba(17,17,17,0.06);">
          <h2 class="section-title">Create Agent</h2>
          <button class="text-slate-400 hover:text-slate-600 text-lg" @click="showCreateModal = false">&times;</button>
        </div>

        <form class="space-y-5 px-5 py-5" @submit.prevent="createAgent">
          <div class="panel-muted space-y-4">
            <div>
              <label class="form-label">Campaign *</label>
              <select v-model="createForm.campaign_id" required class="select">
                <option value="" disabled>Select a campaign</option>
                <option v-for="c in campaigns" :key="c.id" :value="c.id">
                  {{ c.name }}
                  <template v-if="c.status !== 'active'"> ({{ c.status }})</template>
                </option>
              </select>
              <p class="form-help">The campaign this agent will be assigned to for conversation routing.</p>
            </div>

            <div>
              <label class="form-label">Agent Name *</label>
              <input
                v-model="createForm.name"
                type="text"
                required
                placeholder="e.g. Friendly Closer"
                class="input"
              />
            </div>

            <div>
              <label class="form-label">Description</label>
              <textarea
                v-model="createForm.description"
                rows="2"
                placeholder="Brief description of this agent's personality or approach"
                class="input"
              ></textarea>
            </div>

            <div>
              <label class="form-label">Weight</label>
              <input
                v-model.number="createForm.weight"
                type="number"
                min="1"
                max="1000"
                class="input"
              />
              <p class="form-help">Relative traffic weight for A/B split testing. Higher = more traffic.</p>
            </div>
          </div>

          <div v-if="createSuccess" class="feedback-success">{{ createSuccess }}</div>
          <div v-if="createError" class="feedback-error">{{ createError }}</div>

          <div class="flex gap-3">
            <button type="submit" :disabled="createLoading" class="button-primary">
              {{ createLoading ? 'Creating...' : 'Create Agent' }}
            </button>
            <button type="button" class="button-secondary" @click="showCreateModal = false">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

const API_BASE = '/api';

interface AgentRecord {
  id: string;
  campaign_id: string;
  campaign_name: string;
  name: string;
  description: string | null;
  weight: number;
  status: string;
  active_version_number: number | null;
  created_at: string;
  updated_at: string;
}

interface CampaignOption {
  id: string;
  name: string;
  status: string;
}

const statusFilters = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Archived', value: 'archived' },
];

const agents = ref<AgentRecord[]>([]);
const campaigns = ref<CampaignOption[]>([]);
const listLoading = ref(true);
const searchQuery = ref('');
const activeFilter = ref('all');
const showCreateModal = ref(false);

const createForm = ref({ campaign_id: '', name: '', description: '', weight: 100 });
const createLoading = ref(false);
const createError = ref('');
const createSuccess = ref('');

let workspaceId: string | null = null;

const filteredAgents = computed(() => {
  let result = agents.value;
  if (activeFilter.value !== 'all') {
    result = result.filter((a) => a.status === activeFilter.value);
  }
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.campaign_name ?? '').toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q)
    );
  }
  return result;
});

function statusClass(status: string): string {
  switch (status) {
    case 'active': return 'bg-emerald-50 text-emerald-700';
    case 'paused': return 'bg-amber-50 text-amber-700';
    case 'archived': return 'bg-slate-100 text-slate-600';
    case 'draft': return 'bg-blue-50 text-blue-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

async function fetchAgents() {
  if (!workspaceId) return;
  const params = new URLSearchParams({ workspace_id: workspaceId });
  const res = await fetch(`${API_BASE}/api-agents-workspace-list?${params}`);
  if (res.ok) agents.value = await res.json();
}

async function fetchCampaigns() {
  if (!workspaceId) return;
  const params = new URLSearchParams({ workspace_id: workspaceId });
  const res = await fetch(`${API_BASE}/api-campaigns-list?${params}`);
  if (res.ok) campaigns.value = await res.json();
}

async function createAgent() {
  createError.value = '';
  createSuccess.value = '';
  createLoading.value = true;

  try {
    const res = await fetch(`${API_BASE}/api-agents-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: createForm.value.campaign_id,
        name: createForm.value.name,
        description: createForm.value.description || undefined,
        weight: createForm.value.weight,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      createError.value = data.error || 'Failed to create agent';
      return;
    }

    // Navigate to the new agent detail page
    window.location.href = `/agents/${data.id}`;
  } catch {
    createError.value = 'Network error. Please try again.';
  } finally {
    createLoading.value = false;
  }
}

onMounted(async () => {
  const ctx = getSessionContext();
  workspaceId = ctx.workspaceId || null;
  if (!workspaceId) {
    listLoading.value = false;
    return;
  }
  await Promise.all([fetchAgents(), fetchCampaigns()]);
  listLoading.value = false;
});
</script>
