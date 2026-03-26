<template>
  <div class="flex gap-4" style="height: calc(100vh - 220px); min-height: 400px;">
    <!-- Left: Agent list -->
    <div class="w-[360px] shrink-0 bg-surface border border-slate-700 rounded-lg overflow-hidden flex flex-col">
      <!-- Header with Add button -->
      <div class="p-3 border-b border-slate-700 flex items-center justify-between">
        <span class="text-sm font-medium text-slate-300">Agents</span>
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          @click="activeTab = 'add'; selectedAgent = null"
        >
          Add Agent
        </button>
      </div>

      <!-- List -->
      <div class="flex-1 overflow-y-auto">
        <div v-if="listLoading" class="flex items-center justify-center h-full text-slate-400 text-sm">
          Loading...
        </div>
        <div v-else-if="agents.length === 0" class="flex items-center justify-center h-full text-slate-400 text-sm p-6 text-center">
          No agents yet. Add your first agent to begin split testing.
        </div>
        <div
          v-for="agent in agents"
          :key="agent.id"
          class="flex flex-col gap-0.5 px-4 py-3 border-b border-slate-700 cursor-pointer transition-colors hover:bg-surface-hover"
          :class="{ 'bg-surface-hover border-l-[3px] border-l-blue-500': selectedAgent?.id === agent.id }"
          @click="selectAgent(agent)"
        >
          <div class="flex justify-between items-center">
            <span class="font-semibold text-sm text-slate-100">{{ agent.name }}</span>
            <span
              class="text-[11px] px-2 py-0.5 rounded-full font-medium"
              :class="statusClass(agent.status)"
            >{{ agent.status }}</span>
          </div>
          <div class="flex items-center gap-3 mt-1">
            <span class="text-[12px] text-slate-400">Weight: {{ agent.weight }}</span>
            <span v-if="agent.active_version_number" class="text-[12px] text-slate-500">v{{ agent.active_version_number }}</span>
            <span v-else class="text-[12px] text-slate-500 italic">no version</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Tabbed panel -->
    <div class="flex-1 bg-surface border border-slate-700 rounded-lg overflow-hidden flex flex-col">
      <!-- Tab bar -->
      <div class="flex border-b border-slate-700 shrink-0">
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          :class="activeTab === 'add' ? 'text-blue-400 border-b-2 border-blue-500 bg-surface-hover' : 'text-slate-400 hover:text-slate-200'"
          @click="activeTab = 'add'; selectedAgent = null"
        >
          Add Agent
        </button>
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          :class="activeTab === 'detail' ? 'text-blue-400 border-b-2 border-blue-500 bg-surface-hover' : 'text-slate-400 hover:text-slate-200'"
          :disabled="!selectedAgent"
          @click="activeTab = 'detail'"
        >
          Agent Detail
        </button>
        <button
          class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
          :class="activeTab === 'versions' ? 'text-blue-400 border-b-2 border-blue-500 bg-surface-hover' : 'text-slate-400 hover:text-slate-200'"
          :disabled="!selectedAgent"
          @click="activeTab = 'versions'"
        >
          Versions
        </button>
      </div>

      <!-- Add Agent Form -->
      <div v-if="activeTab === 'add'" class="flex-1 overflow-y-auto p-6">
        <form @submit.prevent="createAgent" class="max-w-md space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Agent Name *</label>
            <input
              v-model="addForm.name"
              type="text"
              required
              placeholder="e.g. Friendly Closer"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Weight</label>
            <input
              v-model.number="addForm.weight"
              type="number"
              min="1"
              max="1000"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            <p class="text-[12px] text-slate-500 mt-1">Relative weight for A/B split testing. Higher = more traffic.</p>
          </div>

          <!-- Success/Error messages -->
          <div v-if="addSuccess" class="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-lg">
            {{ addSuccess }}
          </div>
          <div v-if="addError" class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
            {{ addError }}
          </div>

          <button
            type="submit"
            :disabled="addLoading"
            class="w-full py-2.5 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {{ addLoading ? 'Creating...' : 'Add Agent' }}
          </button>
        </form>
      </div>

      <!-- Agent Detail -->
      <div v-else-if="activeTab === 'detail'" class="flex-1 overflow-y-auto p-6">
        <div v-if="!selectedAgent" class="flex items-center justify-center h-full text-slate-400 text-sm">
          Select an agent from the list to view details
        </div>
        <div v-else class="max-w-md space-y-4">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-lg">
              {{ selectedAgent.name[0] }}{{ selectedAgent.name[1] || '' }}
            </div>
            <div>
              <div class="text-lg font-semibold">{{ selectedAgent.name }}</div>
              <div class="text-sm text-slate-400">{{ selectedAgent.status }} - Weight {{ selectedAgent.weight }}</div>
            </div>
          </div>

          <!-- Split test weight visualization -->
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-2">Split Test Weight Distribution</label>
            <div class="w-full h-6 bg-slate-800 rounded-lg overflow-hidden flex">
              <div
                class="h-full bg-blue-500 flex items-center justify-center text-[10px] font-medium text-white"
                :style="{ width: weightPercent + '%', minWidth: weightPercent > 0 ? '40px' : '0' }"
              >
                {{ weightPercent }}%
              </div>
              <div
                v-if="weightPercent < 100"
                class="h-full bg-slate-700 flex items-center justify-center text-[10px] font-medium text-slate-400"
                :style="{ width: (100 - weightPercent) + '%' }"
              >
                Others {{ 100 - weightPercent }}%
              </div>
            </div>
          </div>

          <!-- Editable fields -->
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Name</label>
            <input
              v-model="editForm.name"
              type="text"
              required
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Weight</label>
            <input
              v-model.number="editForm.weight"
              type="number"
              min="1"
              max="1000"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Status</label>
            <select
              v-model="editForm.status"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <!-- Success/Error messages -->
          <div v-if="editSuccess" class="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-lg">
            {{ editSuccess }}
          </div>
          <div v-if="editError" class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
            {{ editError }}
          </div>

          <button
            :disabled="editLoading"
            class="w-full py-2.5 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
            @click="updateAgent"
          >
            {{ editLoading ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>

      <!-- Versions -->
      <div v-else-if="activeTab === 'versions'" class="flex-1 overflow-y-auto p-6">
        <div v-if="!selectedAgent" class="flex items-center justify-center h-full text-slate-400 text-sm">
          Select an agent from the list to manage versions
        </div>
        <div v-else class="space-y-6">
          <!-- Existing versions list -->
          <div>
            <h3 class="text-sm font-medium text-slate-300 mb-3">Existing Versions</h3>
            <div v-if="versionsLoading" class="text-slate-400 text-sm">Loading versions...</div>
            <div v-else-if="versions.length === 0" class="text-slate-500 text-sm">No versions yet. Create the first version below.</div>
            <div v-else class="space-y-2">
              <div
                v-for="ver in versions"
                :key="ver.id"
                class="flex items-center justify-between px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg"
              >
                <div class="flex items-center gap-3">
                  <span class="text-sm font-medium text-slate-100">Version {{ ver.version_number }}</span>
                  <span
                    v-if="ver.is_active"
                    class="text-[11px] px-2 py-0.5 rounded-full font-medium bg-green-500/15 text-green-400"
                  >active</span>
                  <span
                    v-else
                    class="text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-500/15 text-slate-400"
                  >inactive</span>
                </div>
                <span class="text-[12px] text-slate-500">{{ formatDate(ver.created_at) }}</span>
              </div>
            </div>
          </div>

          <!-- Create new version form -->
          <div class="border-t border-slate-700 pt-6">
            <h3 class="text-sm font-medium text-slate-300 mb-3">Create New Version</h3>
            <form @submit.prevent="createVersion" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">Prompt Text *</label>
                <textarea
                  v-model="versionForm.prompt_text"
                  required
                  rows="6"
                  placeholder="You are a helpful sales assistant..."
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                ></textarea>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">System Rules (JSON, optional)</label>
                <textarea
                  v-model="versionForm.system_rules_json"
                  rows="3"
                  placeholder='{"max_response_length": 160, "tone": "friendly"}'
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                ></textarea>
              </div>

              <!-- Reply cadence fields -->
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-2">Reply Cadence</label>
                <div class="grid grid-cols-3 gap-3">
                  <div>
                    <label class="block text-[12px] text-slate-400 mb-1">Initial Delay (s)</label>
                    <input
                      v-model.number="versionForm.initial_delay_seconds"
                      type="number"
                      min="0"
                      class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label class="block text-[12px] text-slate-400 mb-1">Followup Delay (s)</label>
                    <input
                      v-model.number="versionForm.followup_delay_seconds"
                      type="number"
                      min="0"
                      class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label class="block text-[12px] text-slate-400 mb-1">Max Followups</label>
                    <input
                      v-model.number="versionForm.max_followups"
                      type="number"
                      min="0"
                      class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">Config JSON (optional)</label>
                <textarea
                  v-model="versionForm.config_json"
                  rows="3"
                  placeholder='{"model": "gpt-4o-mini", "temperature": 0.7}'
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                ></textarea>
              </div>

              <!-- Success/Error messages -->
              <div v-if="versionSuccess" class="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-lg">
                {{ versionSuccess }}
              </div>
              <div v-if="versionError" class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
                {{ versionError }}
              </div>

              <button
                type="submit"
                :disabled="versionLoading"
                class="w-full py-2.5 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {{ versionLoading ? 'Creating...' : 'Create Version' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { getPublicSupabaseClient } from '@lib/config/public-client';

const props = defineProps<{
  campaignId: string;
  campaignName: string;
}>();

const API_BASE = '/api';
const supabase = getPublicSupabaseClient();

interface AgentRecord {
  id: string;
  campaign_id: string;
  name: string;
  weight: number;
  status: string;
  active_version_number: number | null;
  created_at: string;
  updated_at: string;
}

interface VersionRecord {
  id: string;
  agent_id: string;
  version_number: number;
  prompt_text: string;
  system_rules_json: Record<string, unknown> | null;
  reply_cadence_json: Record<string, unknown> | null;
  config_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

// State
const agents = ref<AgentRecord[]>([]);
const listLoading = ref(true);
const selectedAgent = ref<AgentRecord | null>(null);
const activeTab = ref<'add' | 'detail' | 'versions'>('add');

// Versions state
const versions = ref<VersionRecord[]>([]);
const versionsLoading = ref(false);

// Add agent form
const addForm = ref({ name: '', weight: 100 });
const addLoading = ref(false);
const addError = ref('');
const addSuccess = ref('');

// Edit agent form
const editForm = ref({ name: '', weight: 100, status: 'active' });
const editLoading = ref(false);
const editError = ref('');
const editSuccess = ref('');

// Version form
const versionForm = ref({
  prompt_text: '',
  system_rules_json: '',
  initial_delay_seconds: 30,
  followup_delay_seconds: 3600,
  max_followups: 5,
  config_json: '',
});
const versionLoading = ref(false);
const versionError = ref('');
const versionSuccess = ref('');

// Computed
const totalWeight = computed(() => agents.value.reduce((sum, a) => sum + a.weight, 0));
const weightPercent = computed(() => {
  if (!selectedAgent.value || totalWeight.value === 0) return 0;
  return Math.round((selectedAgent.value.weight / totalWeight.value) * 100);
});

// Watchers
watch(selectedAgent, (agent) => {
  if (agent) {
    editForm.value = { name: agent.name, weight: agent.weight, status: agent.status };
    fetchVersions(agent.id);
  } else {
    versions.value = [];
  }
});

// Methods
function statusClass(status: string): string {
  switch (status) {
    case 'active': return 'bg-green-500/15 text-green-400';
    case 'paused': return 'bg-yellow-500/15 text-yellow-400';
    case 'archived': return 'bg-slate-500/15 text-slate-400';
    default: return 'bg-slate-500/15 text-slate-400';
  }
}

async function fetchAgents() {
  const params = new URLSearchParams({ campaign_id: props.campaignId });
  const res = await fetch(`${API_BASE}/api-agents-list?${params}`);
  if (res.ok) agents.value = await res.json();
}

async function fetchVersions(agentId: string) {
  versionsLoading.value = true;
  try {
    const params = new URLSearchParams({ agent_id: agentId });
    const res = await fetch(`${API_BASE}/api-agent-versions-list?${params}`);
    if (res.ok) versions.value = await res.json();
  } finally {
    versionsLoading.value = false;
  }
}

function selectAgent(agent: AgentRecord) {
  selectedAgent.value = agent;
  activeTab.value = 'detail';
}

async function createAgent() {
  addError.value = '';
  addSuccess.value = '';
  addLoading.value = true;

  try {
    const res = await fetch(`${API_BASE}/api-agents-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: props.campaignId,
        name: addForm.value.name,
        weight: addForm.value.weight,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      addError.value = data.error || 'Failed to create agent';
      return;
    }

    addSuccess.value = `Agent "${data.name}" created. Select it to add a prompt version.`;
    addForm.value = { name: '', weight: 100 };
    await fetchAgents();

    // Auto-select the new agent and switch to versions tab
    const newAgent = agents.value.find((a: AgentRecord) => a.id === data.id);
    if (newAgent) {
      selectedAgent.value = newAgent;
      activeTab.value = 'versions';
    }
  } catch {
    addError.value = 'Network error. Please try again.';
  } finally {
    addLoading.value = false;
  }
}

async function updateAgent() {
  if (!selectedAgent.value) return;
  editError.value = '';
  editSuccess.value = '';
  editLoading.value = true;

  try {
    const res = await fetch(`${API_BASE}/api-agents-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: selectedAgent.value.id,
        name: editForm.value.name,
        weight: editForm.value.weight,
        status: editForm.value.status,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      editError.value = data.error || 'Failed to update agent';
      return;
    }

    editSuccess.value = 'Agent updated successfully.';
    await fetchAgents();

    // Re-select the updated agent to refresh local state
    const updated = agents.value.find((a: AgentRecord) => a.id === selectedAgent.value!.id);
    if (updated) selectedAgent.value = updated;
  } catch {
    editError.value = 'Network error. Please try again.';
  } finally {
    editLoading.value = false;
  }
}

async function createVersion() {
  if (!selectedAgent.value) return;
  versionError.value = '';
  versionSuccess.value = '';
  versionLoading.value = true;

  try {
    let systemRules: Record<string, unknown> | undefined;
    if (versionForm.value.system_rules_json.trim()) {
      try {
        systemRules = JSON.parse(versionForm.value.system_rules_json);
      } catch {
        versionError.value = 'System rules must be valid JSON.';
        versionLoading.value = false;
        return;
      }
    }

    let configJson: Record<string, unknown> | undefined;
    if (versionForm.value.config_json.trim()) {
      try {
        configJson = JSON.parse(versionForm.value.config_json);
      } catch {
        versionError.value = 'Config must be valid JSON.';
        versionLoading.value = false;
        return;
      }
    }

    const replyCadence = {
      initial_delay_seconds: versionForm.value.initial_delay_seconds,
      followup_delay_seconds: versionForm.value.followup_delay_seconds,
      max_followups: versionForm.value.max_followups,
    };

    const res = await fetch(`${API_BASE}/api-agent-versions-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: selectedAgent.value.id,
        prompt_text: versionForm.value.prompt_text,
        system_rules_json: systemRules,
        reply_cadence_json: replyCadence,
        config_json: configJson,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      versionError.value = data.error || 'Failed to create version';
      return;
    }

    versionSuccess.value = `Version ${data.version_number} created and set as active.`;
    versionForm.value = {
      prompt_text: '',
      system_rules_json: '',
      initial_delay_seconds: 30,
      followup_delay_seconds: 3600,
      max_followups: 5,
      config_json: '',
    };

    // Refresh versions list and agent list (active version may have changed)
    await Promise.all([fetchVersions(selectedAgent.value.id), fetchAgents()]);

    // Re-select to update active_version_number display
    const updated = agents.value.find((a: AgentRecord) => a.id === selectedAgent.value!.id);
    if (updated) selectedAgent.value = updated;
  } catch {
    versionError.value = 'Network error. Please try again.';
  } finally {
    versionLoading.value = false;
  }
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

onMounted(async () => {
  if (!props.campaignId) {
    listLoading.value = false;
    return;
  }
  await fetchAgents();
  listLoading.value = false;
});
</script>
