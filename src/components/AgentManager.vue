<template>
  <div
    class="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]"
    style="min-height: calc(100vh - 280px);"
  >
    <!-- Left: Agent list -->
    <aside class="panel flex min-h-[560px] flex-col overflow-hidden p-0">
      <div class="border-b border-slate-200/80 px-5 py-5">
        <div class="page-kicker">Agent Builder</div>
        <h2 class="section-title mt-3">Campaign agents</h2>
        <p class="section-copy mt-2">
          Add, configure, and A/B split test AI agents within this campaign.
        </p>
      </div>

      <div class="flex-1 overflow-y-auto px-3 py-3">
        <div v-if="listLoading" class="empty-state min-h-full">Loading agents...</div>
        <div v-else-if="agents.length === 0" class="empty-state min-h-full">
          No agents yet. Create your first agent to begin split testing.
        </div>
        <div v-else class="space-y-2">
          <button
            v-for="agent in agents"
            :key="agent.id"
            class="list-card"
            :class="selectedAgent?.id === agent.id ? 'list-card-active' : ''"
            @click="selectAgent(agent)"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-slate-900">{{ agent.name }}</div>
                <div class="mt-1 text-xs text-slate-500">
                  Weight {{ agent.weight }}
                  <template v-if="agent.active_version_number"> &middot; v{{ agent.active_version_number }}</template>
                </div>
              </div>
              <span class="badge" :class="statusClass(agent.status)">{{ agent.status }}</span>
            </div>
            <div v-if="agent.description" class="mt-2 text-xs text-slate-500 line-clamp-2">
              {{ agent.description }}
            </div>
          </button>
        </div>
      </div>

      <div class="border-t px-4 py-4" style="border-color: rgba(17,17,17,0.06);">
        <button
          class="button-primary w-full"
          @click="startNewAgent"
        >
          Add Agent
        </button>
      </div>
    </aside>

    <!-- Right: Tabbed panel -->
    <section class="panel min-h-[560px] overflow-hidden p-0">
      <div class="border-b border-slate-200/80 px-5 py-4">
        <div class="flex flex-wrap gap-2">
          <button
            class="pill-tab"
            :class="activeTab === 'add' ? 'pill-tab-active' : ''"
            @click="startNewAgent"
          >
            Create agent
          </button>
          <button
            class="pill-tab"
            :class="activeTab === 'detail' ? 'pill-tab-active' : ''"
            :disabled="!selectedAgent"
            @click="activeTab = 'detail'"
          >
            Agent settings
          </button>
          <button
            class="pill-tab"
            :class="activeTab === 'history' ? 'pill-tab-active' : ''"
            :disabled="!selectedAgent"
            @click="activeTab = 'history'"
          >
            History
          </button>
        </div>
      </div>

      <!-- ═══ Create Agent (full form) ═══ -->
      <div v-if="activeTab === 'add'" class="px-5 py-5 sm:px-6 sm:py-6 overflow-y-auto" style="max-height: calc(100vh - 360px);">
        <div class="mx-auto max-w-2xl space-y-6">
          <div>
            <div class="page-kicker">New Agent</div>
            <h2 class="section-title mt-3">Create a new agent</h2>
            <p class="section-copy mt-2">
              Configure everything about this agent &mdash; its identity, prompt, behaviour rules, and AI settings.
            </p>
          </div>

          <form class="space-y-6" @submit.prevent="createAgent">
            <!-- Identity -->
            <fieldset class="panel-muted space-y-4">
              <legend class="form-label">Identity</legend>

              <div>
                <label class="form-label">Agent Name *</label>
                <input
                  v-model="addForm.name"
                  type="text"
                  required
                  placeholder="e.g. Friendly Closer"
                  class="input"
                />
              </div>

              <div>
                <label class="form-label">Description</label>
                <textarea
                  v-model="addForm.description"
                  rows="2"
                  placeholder="Brief description of this agent's personality or approach"
                  class="input"
                ></textarea>
                <p class="form-help">Helps distinguish agents at a glance.</p>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="form-label">Weight</label>
                  <input
                    v-model.number="addForm.weight"
                    type="number"
                    min="1"
                    max="1000"
                    class="input"
                  />
                  <p class="form-help">Higher = more traffic in A/B split testing.</p>
                </div>
                <div>
                  <label class="form-label">AI Provider</label>
                  <select v-model="addForm.ai_provider_integration_id" class="select">
                    <option value="">Default (workspace setting)</option>
                    <option v-for="intg in aiProviders" :key="intg.id" :value="intg.id">
                      {{ intg.provider }} {{ intg.label ? '- ' + intg.label : '' }}
                    </option>
                  </select>
                </div>
              </div>
            </fieldset>

            <!-- Prompt -->
            <fieldset class="panel-muted">
              <legend class="form-label">Prompt *</legend>
              <textarea
                v-model="addForm.prompt_text"
                required
                rows="6"
                placeholder="You are a helpful sales assistant who qualifies leads for home improvement services..."
                class="input font-mono text-sm"
              ></textarea>
              <p class="form-help">The main guidance prompt sent to the AI for each conversation turn.</p>
            </fieldset>

            <!-- System Rules -->
            <fieldset class="panel-muted space-y-4">
              <legend class="form-label">System Rules</legend>

              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="form-label">Tone</label>
                  <select v-model="addForm.tone" class="select">
                    <option value="friendly">Friendly</option>
                    <option value="professional">Professional</option>
                    <option value="casual">Casual</option>
                    <option value="formal">Formal</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Max Message Length</label>
                  <input
                    v-model.number="addForm.max_message_length"
                    type="number"
                    min="50"
                    max="1600"
                    class="input"
                  />
                  <p class="form-help">Characters. SMS limit is 160 (or 1600 for long SMS).</p>
                </div>
              </div>
            </fieldset>

            <!-- Reply Cadence -->
            <fieldset class="panel-muted space-y-4">
              <legend class="form-label">Reply Cadence</legend>

              <div class="grid gap-4 sm:grid-cols-3">
                <div>
                  <label class="form-label">Initial Delay (s)</label>
                  <input
                    v-model.number="addForm.initial_delay_seconds"
                    type="number"
                    min="0"
                    class="input"
                  />
                </div>
                <div>
                  <label class="form-label">Followup Delay (s)</label>
                  <input
                    v-model.number="addForm.followup_delay_seconds"
                    type="number"
                    min="0"
                    class="input"
                  />
                </div>
                <div>
                  <label class="form-label">Max Followups</label>
                  <input
                    v-model.number="addForm.max_followups"
                    type="number"
                    min="0"
                    class="input"
                  />
                </div>
              </div>
            </fieldset>

            <!-- Allowed Actions -->
            <fieldset class="panel-muted space-y-4">
              <legend class="form-label">Allowed Actions</legend>
              <p class="text-sm text-slate-500 -mt-2">Control what this agent is permitted to do during a conversation.</p>

              <label class="flex items-center gap-3 text-sm text-slate-700">
                <input
                  v-model="addForm.can_book"
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Can book appointments
              </label>

              <label class="flex items-center gap-3 text-sm text-slate-700">
                <input
                  v-model="addForm.can_escalate_to_human"
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Can escalate to a human
              </label>

              <label class="flex items-center gap-3 text-sm text-slate-700">
                <input
                  v-model="addForm.can_close_unqualified"
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                Can close unqualified leads
              </label>
            </fieldset>

            <!-- Qualification Rules -->
            <fieldset class="panel-muted space-y-4">
              <legend class="form-label">Qualification Rules</legend>
              <p class="text-sm text-slate-500 -mt-2">Fields the agent must collect before qualifying a lead.</p>

              <div class="flex flex-wrap gap-2">
                <span
                  v-for="(field, i) in addForm.required_fields"
                  :key="i"
                  class="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium text-slate-700"
                  style="border-color: rgba(17,17,17,0.08); background: rgba(255,255,255,0.92);"
                >
                  {{ field }}
                  <button type="button" class="ml-1 text-slate-400 hover:text-red-500" @click="addForm.required_fields.splice(i, 1)">&times;</button>
                </span>
              </div>

              <div class="flex gap-2">
                <input
                  v-model="newAddField"
                  type="text"
                  placeholder="e.g. budget, timeline, service_interest"
                  class="input flex-1"
                  @keydown.enter.prevent="addFieldTo('add')"
                />
                <button type="button" class="button-secondary" @click="addFieldTo('add')">Add</button>
              </div>
            </fieldset>

            <!-- AI Config -->
            <fieldset class="panel-muted space-y-4">
              <legend class="form-label">AI Configuration</legend>

              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label class="form-label">Model</label>
                  <select v-model="addForm.model" class="select">
                    <option value="">Default</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="claude-sonnet-4-20250514">Claude Sonnet</option>
                    <option value="claude-haiku-4-5-20251001">Claude Haiku</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Temperature</label>
                  <input
                    v-model.number="addForm.temperature"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    class="input"
                  />
                  <p class="form-help">0 = deterministic, 1 = creative, 2 = very random.</p>
                </div>
              </div>
            </fieldset>

            <div v-if="addSuccess" class="feedback-success">{{ addSuccess }}</div>
            <div v-if="addError" class="feedback-error">{{ addError }}</div>

            <button type="submit" :disabled="addLoading" class="button-primary w-full sm:w-auto">
              {{ addLoading ? 'Creating...' : 'Create Agent' }}
            </button>
          </form>
        </div>
      </div>

      <!-- ═══ Agent Settings (edit all, auto-versions on save) ═══ -->
      <div v-else-if="activeTab === 'detail'" class="px-5 py-5 sm:px-6 sm:py-6 overflow-y-auto" style="max-height: calc(100vh - 360px);">
        <div v-if="!selectedAgent" class="empty-state min-h-[420px]">
          Select an agent from the list to view settings.
        </div>
        <div v-else class="mx-auto max-w-2xl space-y-6">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-4">
              <div class="flex h-14 w-14 items-center justify-center rounded-[20px] bg-teal-100 text-lg font-bold text-teal-700">
                {{ selectedAgent.name.charAt(0).toUpperCase() }}{{ selectedAgent.name.charAt(1)?.toUpperCase() || '' }}
              </div>
              <div>
                <div class="page-kicker">Agent Settings</div>
                <h2 class="section-title mt-2">{{ selectedAgent.name }}</h2>
                <p class="section-copy mt-1">
                  {{ selectedAgent.status }}
                  <template v-if="selectedAgent.active_version_number"> &middot; v{{ selectedAgent.active_version_number }}</template>
                </p>
              </div>
            </div>
            <span class="badge self-start sm:self-auto" :class="statusClass(selectedAgent.status)">{{ selectedAgent.status }}</span>
          </div>

          <!-- Split test weight visualization -->
          <div class="panel-muted">
            <label class="form-label">Split Test Weight Distribution</label>
            <div class="mt-2 flex h-7 w-full overflow-hidden rounded-full" style="background: rgba(17,17,17,0.06);">
              <div
                class="flex h-full items-center justify-center rounded-full text-[11px] font-semibold text-white"
                :style="{ width: Math.max(weightPercent, 8) + '%', background: '#111' }"
              >
                {{ weightPercent }}%
              </div>
              <div
                v-if="weightPercent < 100"
                class="flex h-full items-center justify-center text-[11px] font-medium text-slate-500"
                :style="{ width: (100 - weightPercent) + '%' }"
              >
                Others {{ 100 - weightPercent }}%
              </div>
            </div>
          </div>

          <!-- Identity -->
          <fieldset class="panel-muted space-y-4">
            <legend class="form-label">Identity</legend>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="form-label">Name</label>
                <input v-model="editForm.name" type="text" required class="input" />
              </div>
              <div>
                <label class="form-label">Status</label>
                <select v-model="editForm.status" class="select">
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div>
              <label class="form-label">Description</label>
              <textarea
                v-model="editForm.description"
                rows="2"
                placeholder="Brief description"
                class="input"
              ></textarea>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="form-label">Weight</label>
                <input
                  v-model.number="editForm.weight"
                  type="number"
                  min="1"
                  max="1000"
                  class="input"
                />
              </div>
              <div>
                <label class="form-label">AI Provider</label>
                <select v-model="editForm.ai_provider_integration_id" class="select">
                  <option value="">Default (workspace setting)</option>
                  <option v-for="intg in aiProviders" :key="intg.id" :value="intg.id">
                    {{ intg.provider }} {{ intg.label ? '- ' + intg.label : '' }}
                  </option>
                </select>
              </div>
            </div>
          </fieldset>

          <!-- Prompt -->
          <fieldset class="panel-muted">
            <legend class="form-label">Prompt</legend>
            <textarea
              v-model="editForm.prompt_text"
              rows="6"
              placeholder="You are a helpful sales assistant who qualifies leads..."
              class="input font-mono text-sm"
            ></textarea>
            <p class="form-help">The main guidance prompt sent to the AI for each conversation turn.</p>
          </fieldset>

          <!-- System Rules -->
          <fieldset class="panel-muted space-y-4">
            <legend class="form-label">System Rules</legend>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="form-label">Tone</label>
                <select v-model="editForm.tone" class="select">
                  <option value="friendly">Friendly</option>
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                </select>
              </div>
              <div>
                <label class="form-label">Max Message Length</label>
                <input
                  v-model.number="editForm.max_message_length"
                  type="number"
                  min="50"
                  max="1600"
                  class="input"
                />
                <p class="form-help">Characters. SMS limit is 160 (or 1600 for long SMS).</p>
              </div>
            </div>
          </fieldset>

          <!-- Reply Cadence -->
          <fieldset class="panel-muted space-y-4">
            <legend class="form-label">Reply Cadence</legend>

            <div class="grid gap-4 sm:grid-cols-3">
              <div>
                <label class="form-label">Initial Delay (s)</label>
                <input
                  v-model.number="editForm.initial_delay_seconds"
                  type="number"
                  min="0"
                  class="input"
                />
              </div>
              <div>
                <label class="form-label">Followup Delay (s)</label>
                <input
                  v-model.number="editForm.followup_delay_seconds"
                  type="number"
                  min="0"
                  class="input"
                />
              </div>
              <div>
                <label class="form-label">Max Followups</label>
                <input
                  v-model.number="editForm.max_followups"
                  type="number"
                  min="0"
                  class="input"
                />
              </div>
            </div>
          </fieldset>

          <!-- Allowed Actions -->
          <fieldset class="panel-muted space-y-4">
            <legend class="form-label">Allowed Actions</legend>
            <p class="text-sm text-slate-500 -mt-2">Control what this agent is permitted to do during a conversation.</p>

            <label class="flex items-center gap-3 text-sm text-slate-700">
              <input
                v-model="editForm.can_book"
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Can book appointments
            </label>

            <label class="flex items-center gap-3 text-sm text-slate-700">
              <input
                v-model="editForm.can_escalate_to_human"
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Can escalate to a human
            </label>

            <label class="flex items-center gap-3 text-sm text-slate-700">
              <input
                v-model="editForm.can_close_unqualified"
                type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Can close unqualified leads
            </label>
          </fieldset>

          <!-- Qualification Rules -->
          <fieldset class="panel-muted space-y-4">
            <legend class="form-label">Qualification Rules</legend>
            <p class="text-sm text-slate-500 -mt-2">Fields the agent must collect before qualifying a lead.</p>

            <div class="flex flex-wrap gap-2">
              <span
                v-for="(field, i) in editForm.required_fields"
                :key="i"
                class="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium text-slate-700"
                style="border-color: rgba(17,17,17,0.08); background: rgba(255,255,255,0.92);"
              >
                {{ field }}
                <button type="button" class="ml-1 text-slate-400 hover:text-red-500" @click="editForm.required_fields.splice(i, 1)">&times;</button>
              </span>
            </div>

            <div class="flex gap-2">
              <input
                v-model="newEditField"
                type="text"
                placeholder="e.g. budget, timeline, service_interest"
                class="input flex-1"
                @keydown.enter.prevent="addFieldTo('edit')"
              />
              <button type="button" class="button-secondary" @click="addFieldTo('edit')">Add</button>
            </div>
          </fieldset>

          <!-- AI Config -->
          <fieldset class="panel-muted space-y-4">
            <legend class="form-label">AI Configuration</legend>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="form-label">Model</label>
                <select v-model="editForm.model" class="select">
                  <option value="">Default</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="claude-sonnet-4-20250514">Claude Sonnet</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku</option>
                </select>
              </div>
              <div>
                <label class="form-label">Temperature</label>
                <input
                  v-model.number="editForm.temperature"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  class="input"
                />
                <p class="form-help">0 = deterministic, 1 = creative, 2 = very random.</p>
              </div>
            </div>
          </fieldset>

          <div v-if="editSuccess" class="feedback-success">{{ editSuccess }}</div>
          <div v-if="editError" class="feedback-error">{{ editError }}</div>

          <p class="text-xs text-slate-400">Saving prompt or behaviour changes automatically creates a new version.</p>

          <div class="flex gap-3">
            <button
              type="button"
              :disabled="editLoading"
              class="button-primary w-full sm:w-auto"
              @click="updateAgent"
            >
              {{ editLoading ? 'Saving...' : 'Save Changes' }}
            </button>
            <button
              v-if="selectedAgent.status !== 'archived'"
              type="button"
              class="button-ghost w-full sm:w-auto text-red-600"
              @click="archiveAgent"
            >
              Archive Agent
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ History (read-only version log) ═══ -->
      <div v-else-if="activeTab === 'history'" class="px-5 py-5 sm:px-6 sm:py-6 overflow-y-auto" style="max-height: calc(100vh - 360px);">
        <div v-if="!selectedAgent" class="empty-state min-h-[420px]">
          Select an agent from the list to view history.
        </div>
        <div v-else class="mx-auto max-w-2xl space-y-6">
          <div>
            <div class="page-kicker">Version History</div>
            <h2 class="section-title mt-3">{{ selectedAgent.name }}</h2>
            <p class="section-copy mt-2">
              Each time you save prompt or behaviour changes, a new version is recorded here. You can revert to any previous version.
            </p>
          </div>

          <div v-if="versionsLoading" class="note-box">Loading history...</div>
          <div v-else-if="versions.length === 0" class="note-box">No versions yet. Save the agent settings to create the first version.</div>
          <div v-else class="space-y-3">
            <div
              v-for="ver in versions"
              :key="ver.id"
              class="rounded-[16px] border px-4 py-4"
              :style="ver.is_active
                ? 'border-color: rgba(22,163,74,0.2); background: rgba(22,163,74,0.04);'
                : 'border-color: rgba(17,17,17,0.06); background: rgba(251,251,249,0.94);'"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="text-sm font-semibold text-slate-900">v{{ ver.version_number }}</span>
                  <span
                    v-if="ver.is_active"
                    class="badge bg-emerald-50 text-emerald-700"
                  >current</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-slate-500">{{ formatDate(ver.created_at) }}</span>
                  <button
                    v-if="!ver.is_active"
                    class="button-secondary px-3 py-1.5 text-xs"
                    @click="revertToVersion(ver)"
                  >
                    Revert
                  </button>
                </div>
              </div>
              <!-- Collapsed summary -->
              <div
                v-if="expandedVersion === ver.id"
                class="mt-3 space-y-2 border-t pt-3"
                style="border-color: rgba(17,17,17,0.06);"
              >
                <div>
                  <span class="text-xs font-medium text-slate-500">Prompt</span>
                  <pre class="mt-1 whitespace-pre-wrap rounded-lg bg-white/60 p-3 text-xs text-slate-700 font-mono">{{ ver.prompt_text }}</pre>
                </div>
                <div v-if="ver.system_rules_json" class="text-xs text-slate-600">
                  <span class="font-medium text-slate-500">Tone:</span> {{ (ver.system_rules_json as Record<string, unknown>).tone ?? 'friendly' }}
                  &middot;
                  <span class="font-medium text-slate-500">Max length:</span> {{ (ver.system_rules_json as Record<string, unknown>).max_message_length ?? 160 }}
                </div>
                <div v-if="ver.config_json" class="text-xs text-slate-600">
                  <span class="font-medium text-slate-500">Model:</span> {{ (ver.config_json as Record<string, unknown>).model || 'Default' }}
                  &middot;
                  <span class="font-medium text-slate-500">Temperature:</span> {{ (ver.config_json as Record<string, unknown>).temperature ?? 0.7 }}
                </div>
              </div>
              <button
                type="button"
                class="mt-2 text-xs font-medium text-teal-700 hover:text-teal-900"
                @click="expandedVersion = expandedVersion === ver.id ? null : ver.id"
              >
                {{ expandedVersion === ver.id ? 'Hide details' : 'Show details' }}
              </button>
            </div>
          </div>

          <div v-if="historySuccess" class="feedback-success">{{ historySuccess }}</div>
          <div v-if="historyError" class="feedback-error">{{ historyError }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';

const props = defineProps<{
  campaignId: string;
  campaignName: string;
}>();

const API_BASE = '/api';

interface AgentRecord {
  id: string;
  campaign_id: string;
  name: string;
  description: string | null;
  weight: number;
  status: string;
  ai_provider_integration_id: string | null;
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
  allowed_actions_json: Record<string, unknown> | null;
  qualification_rules_json: Record<string, unknown> | null;
  config_json: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
}

interface IntegrationRecord {
  id: string;
  provider: string;
  label?: string;
}

interface PromptFields {
  prompt_text: string;
  tone: string;
  max_message_length: number;
  initial_delay_seconds: number;
  followup_delay_seconds: number;
  max_followups: number;
  can_book: boolean;
  can_escalate_to_human: boolean;
  can_close_unqualified: boolean;
  required_fields: string[];
  model: string;
  temperature: number;
}

const DEFAULT_PROMPT_FIELDS: PromptFields = {
  prompt_text: '',
  tone: 'friendly',
  max_message_length: 160,
  initial_delay_seconds: 30,
  followup_delay_seconds: 3600,
  max_followups: 5,
  can_book: true,
  can_escalate_to_human: true,
  can_close_unqualified: false,
  required_fields: [],
  model: '',
  temperature: 0.7,
};

// State
const agents = ref<AgentRecord[]>([]);
const listLoading = ref(true);
const selectedAgent = ref<AgentRecord | null>(null);
const activeTab = ref<'add' | 'detail' | 'history'>('add');

// Versions state
const versions = ref<VersionRecord[]>([]);
const versionsLoading = ref(false);
const expandedVersion = ref<string | null>(null);

// AI providers
const aiProviders = ref<IntegrationRecord[]>([]);

// Add agent form (identity + prompt fields combined)
const addForm = ref({
  name: '',
  description: '',
  weight: 100,
  ai_provider_integration_id: '',
  ...structuredClone(DEFAULT_PROMPT_FIELDS),
});
const addLoading = ref(false);
const addError = ref('');
const addSuccess = ref('');
const newAddField = ref('');

// Edit agent form (identity + prompt fields combined)
const editForm = ref({
  name: '',
  description: '',
  weight: 100,
  status: 'active',
  ai_provider_integration_id: '',
  ...structuredClone(DEFAULT_PROMPT_FIELDS),
});
const editLoading = ref(false);
const editError = ref('');
const editSuccess = ref('');
const newEditField = ref('');

// Snapshot of version fields at load time, used to detect prompt changes on save
let editPromptSnapshot = '';

// History tab feedback
const historySuccess = ref('');
const historyError = ref('');

// Computed
const totalWeight = computed(() => agents.value.reduce((sum, a) => sum + a.weight, 0));
const weightPercent = computed(() => {
  if (!selectedAgent.value || totalWeight.value === 0) return 0;
  return Math.round((selectedAgent.value.weight / totalWeight.value) * 100);
});

// Watchers
watch(selectedAgent, (agent) => {
  if (agent) {
    loadEditForm(agent);
    fetchVersions(agent.id);
  } else {
    versions.value = [];
  }
});

function loadEditForm(agent: AgentRecord) {
  // Load identity fields
  editForm.value.name = agent.name;
  editForm.value.description = agent.description ?? '';
  editForm.value.weight = agent.weight;
  editForm.value.status = agent.status;
  editForm.value.ai_provider_integration_id = agent.ai_provider_integration_id ?? '';

  // Load prompt fields from active version (if any)
  const active = versions.value.find((v) => v.is_active);
  populatePromptFromVersion(active);
}

function populatePromptFromVersion(ver: VersionRecord | undefined) {
  if (ver) {
    const sys = (ver.system_rules_json ?? {}) as Record<string, unknown>;
    const cadence = (ver.reply_cadence_json ?? {}) as Record<string, unknown>;
    const actions = (ver.allowed_actions_json ?? {}) as Record<string, unknown>;
    const quals = (ver.qualification_rules_json ?? {}) as Record<string, unknown>;
    const cfg = (ver.config_json ?? {}) as Record<string, unknown>;

    editForm.value.prompt_text = ver.prompt_text ?? '';
    editForm.value.tone = (sys.tone as string) ?? 'friendly';
    editForm.value.max_message_length = (sys.max_message_length as number) ?? 160;
    editForm.value.initial_delay_seconds = (cadence.initial_delay_seconds as number) ?? 30;
    editForm.value.followup_delay_seconds = (cadence.followup_delay_seconds as number) ?? 3600;
    editForm.value.max_followups = (cadence.max_followups as number) ?? 5;
    editForm.value.can_book = (actions.can_book as boolean) ?? true;
    editForm.value.can_escalate_to_human = (actions.can_escalate_to_human as boolean) ?? true;
    editForm.value.can_close_unqualified = (actions.can_close_unqualified as boolean) ?? false;
    editForm.value.required_fields = ((quals.required_fields as string[]) ?? []).slice();
    editForm.value.model = (cfg.model as string) ?? '';
    editForm.value.temperature = (cfg.temperature as number) ?? 0.7;
  } else {
    Object.assign(editForm.value, structuredClone(DEFAULT_PROMPT_FIELDS));
  }
  editPromptSnapshot = promptFingerprint(editForm.value);
}

function promptFingerprint(f: PromptFields): string {
  return JSON.stringify({
    prompt_text: f.prompt_text,
    tone: f.tone,
    max_message_length: f.max_message_length,
    initial_delay_seconds: f.initial_delay_seconds,
    followup_delay_seconds: f.followup_delay_seconds,
    max_followups: f.max_followups,
    can_book: f.can_book,
    can_escalate_to_human: f.can_escalate_to_human,
    can_close_unqualified: f.can_close_unqualified,
    required_fields: f.required_fields,
    model: f.model,
    temperature: f.temperature,
  });
}

function buildVersionPayload(f: PromptFields) {
  const configJson: Record<string, unknown> = {};
  if (f.model) configJson.model = f.model;
  if (f.temperature !== undefined) configJson.temperature = f.temperature;

  return {
    prompt_text: f.prompt_text,
    system_rules_json: { tone: f.tone, max_message_length: f.max_message_length },
    reply_cadence_json: {
      initial_delay_seconds: f.initial_delay_seconds,
      followup_delay_seconds: f.followup_delay_seconds,
      max_followups: f.max_followups,
    },
    allowed_actions_json: {
      can_book: f.can_book,
      can_escalate_to_human: f.can_escalate_to_human,
      can_close_unqualified: f.can_close_unqualified,
    },
    qualification_rules_json: { required_fields: f.required_fields },
    config_json: configJson,
  };
}

// Methods
function statusClass(status: string): string {
  switch (status) {
    case 'active': return 'bg-emerald-50 text-emerald-700';
    case 'paused': return 'bg-amber-50 text-amber-700';
    case 'archived': return 'bg-slate-100 text-slate-600';
    case 'draft': return 'bg-blue-50 text-blue-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function startNewAgent() {
  selectedAgent.value = null;
  activeTab.value = 'add';
  addForm.value = {
    name: '',
    description: '',
    weight: 100,
    ai_provider_integration_id: '',
    ...structuredClone(DEFAULT_PROMPT_FIELDS),
  };
  addError.value = '';
  addSuccess.value = '';
  newAddField.value = '';
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
    // Re-populate prompt fields from active version now that versions are loaded
    if (selectedAgent.value) {
      const active = versions.value.find((v) => v.is_active);
      populatePromptFromVersion(active);
    }
  }
}

async function fetchAiProviders() {
  try {
    const res = await fetch(`${API_BASE}/api-integrations-list?type=ai_provider`);
    if (res.ok) {
      const data = await res.json();
      aiProviders.value = data;
    }
  } catch {
    // Non-critical
  }
}

function selectAgent(agent: AgentRecord) {
  selectedAgent.value = agent;
  activeTab.value = 'detail';
}

function addFieldTo(target: 'add' | 'edit') {
  const ref_val = target === 'add' ? newAddField : newEditField;
  const form = target === 'add' ? addForm : editForm;
  const field = ref_val.value.trim().toLowerCase().replace(/\s+/g, '_');
  if (field && !form.value.required_fields.includes(field)) {
    form.value.required_fields.push(field);
  }
  ref_val.value = '';
}

async function createAgent() {
  addError.value = '';
  addSuccess.value = '';
  addLoading.value = true;

  try {
    // Step 1: Create the agent
    const res = await fetch(`${API_BASE}/api-agents-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_id: props.campaignId,
        name: addForm.value.name,
        description: addForm.value.description || undefined,
        weight: addForm.value.weight,
        ai_provider_integration_id: addForm.value.ai_provider_integration_id || undefined,
      }),
    });

    const agentData = await res.json();

    if (!res.ok) {
      addError.value = agentData.error || 'Failed to create agent';
      return;
    }

    // Step 2: Create the initial version with all prompt settings
    if (addForm.value.prompt_text.trim()) {
      const versionPayload = buildVersionPayload(addForm.value);
      const vRes = await fetch(`${API_BASE}/api-agent-versions-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentData.id, ...versionPayload }),
      });

      if (!vRes.ok) {
        const vData = await vRes.json();
        addError.value = `Agent created but version failed: ${vData.error || 'Unknown error'}`;
        await fetchAgents();
        return;
      }
    }

    addSuccess.value = `Agent "${agentData.name}" created successfully.`;
    await fetchAgents();

    // Auto-select the new agent and switch to settings
    const newAgent = agents.value.find((a: AgentRecord) => a.id === agentData.id);
    if (newAgent) {
      selectedAgent.value = newAgent;
      activeTab.value = 'detail';
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
    // Step 1: Update agent identity fields
    const res = await fetch(`${API_BASE}/api-agents-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: selectedAgent.value.id,
        name: editForm.value.name,
        description: editForm.value.description || null,
        weight: editForm.value.weight,
        status: editForm.value.status,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      editError.value = data.error || 'Failed to update agent';
      return;
    }

    // Step 2: If prompt/behaviour fields changed, create a new version
    const currentFingerprint = promptFingerprint(editForm.value);
    let versionCreated = false;

    if (currentFingerprint !== editPromptSnapshot && editForm.value.prompt_text.trim()) {
      const versionPayload = buildVersionPayload(editForm.value);
      const vRes = await fetch(`${API_BASE}/api-agent-versions-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: selectedAgent.value.id, ...versionPayload }),
      });

      if (!vRes.ok) {
        const vData = await vRes.json();
        editError.value = `Agent updated but new version failed: ${vData.error || 'Unknown error'}`;
      } else {
        versionCreated = true;
      }
    }

    editSuccess.value = versionCreated
      ? 'Agent updated. New version created.'
      : 'Agent updated.';

    await Promise.all([fetchAgents(), fetchVersions(selectedAgent.value.id)]);

    const updated = agents.value.find((a: AgentRecord) => a.id === selectedAgent.value!.id);
    if (updated) selectedAgent.value = updated;
  } catch {
    editError.value = 'Network error. Please try again.';
  } finally {
    editLoading.value = false;
  }
}

async function archiveAgent() {
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
        status: 'archived',
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      editError.value = data.error || 'Failed to archive agent';
      return;
    }

    editSuccess.value = 'Agent archived.';
    await fetchAgents();

    const updated = agents.value.find((a: AgentRecord) => a.id === selectedAgent.value!.id);
    if (updated) selectedAgent.value = updated;
  } catch {
    editError.value = 'Network error. Please try again.';
  } finally {
    editLoading.value = false;
  }
}

async function revertToVersion(ver: VersionRecord) {
  if (!selectedAgent.value) return;
  historyError.value = '';
  historySuccess.value = '';

  try {
    const res = await fetch(`${API_BASE}/api-agent-versions-activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: selectedAgent.value.id,
        version_id: ver.id,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      historyError.value = data.error || 'Failed to revert version';
      return;
    }

    historySuccess.value = `Reverted to v${ver.version_number}. Settings updated.`;
    await Promise.all([fetchVersions(selectedAgent.value.id), fetchAgents()]);

    const updated = agents.value.find((a: AgentRecord) => a.id === selectedAgent.value!.id);
    if (updated) selectedAgent.value = updated;
  } catch {
    historyError.value = 'Network error. Please try again.';
  }
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

onMounted(async () => {
  if (!props.campaignId) {
    listLoading.value = false;
    return;
  }
  await Promise.all([fetchAgents(), fetchAiProviders()]);
  listLoading.value = false;
});
</script>
