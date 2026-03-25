<template>
  <div class="bg-surface border border-slate-700 rounded-lg overflow-hidden flex flex-col" style="height: calc(100vh - 220px); min-height: 400px;">
    <!-- Filter tabs -->
    <div class="flex border-b border-slate-700 shrink-0">
      <button
        v-for="tab in entityTabs"
        :key="tab.value"
        class="px-4 py-3 text-sm font-medium transition-colors"
        :class="activeEntityType === tab.value ? 'text-blue-400 border-b-2 border-blue-500 bg-surface-hover' : 'text-slate-400 hover:text-slate-200'"
        @click="activeEntityType = tab.value; fetchLogs()"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="loading" class="flex items-center justify-center h-full text-slate-400 text-sm">
        Loading...
      </div>
      <div v-else-if="logs.length === 0" class="flex items-center justify-center h-full text-slate-400 text-sm p-6 text-center">
        No activity logs found.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="sticky top-0 bg-slate-800 z-10">
          <tr class="text-left text-slate-400 text-xs uppercase tracking-wider">
            <th class="px-4 py-3 font-medium">Action</th>
            <th class="px-4 py-3 font-medium">Entity Type</th>
            <th class="px-4 py-3 font-medium">Entity ID</th>
            <th class="px-4 py-3 font-medium">User</th>
            <th class="px-4 py-3 font-medium">Metadata</th>
            <th class="px-4 py-3 font-medium text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="log in logs" :key="log.id">
            <tr
              class="border-t border-slate-700 cursor-pointer transition-colors hover:bg-surface-hover"
              :class="{ 'bg-surface-hover': expandedId === log.id }"
              @click="expandedId = expandedId === log.id ? null : log.id"
            >
              <td class="px-4 py-3 text-slate-100 font-medium">{{ log.action_type }}</td>
              <td class="px-4 py-3">
                <span class="text-[12px] px-2 py-0.5 rounded-full font-medium bg-blue-500/15 text-blue-400">
                  {{ log.entity_type }}
                </span>
              </td>
              <td class="px-4 py-3 text-slate-300 font-mono text-xs">{{ truncateUuid(log.entity_id) }}</td>
              <td class="px-4 py-3 text-slate-300 font-mono text-xs">{{ truncateUuid(log.user_id) }}</td>
              <td class="px-4 py-3 text-slate-400 text-xs">
                {{ hasMetadata(log) ? 'Click to expand' : '-' }}
              </td>
              <td class="px-4 py-3 text-slate-400 text-right text-xs">{{ relativeTime(log.created_at) }}</td>
            </tr>
            <!-- Expanded metadata row -->
            <tr v-if="expandedId === log.id && hasMetadata(log)">
              <td colspan="6" class="px-4 py-3 bg-slate-900/50 border-t border-slate-700/50">
                <div class="text-xs text-slate-400 mb-1 font-medium">Metadata</div>
                <pre class="text-xs text-slate-300 bg-slate-900 border border-slate-700 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto"><code>{{ formatJson(log.metadata_json) }}</code></pre>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Error banner -->
    <div v-if="error" class="bg-red-500/10 border-t border-red-500/30 text-red-400 text-sm px-4 py-3">
      {{ error }}
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

interface ActivityLogRecord {
  id: string;
  workspace_id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  action_type: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

const entityTabs = [
  { label: 'All', value: '' },
  { label: 'Conversation', value: 'conversation' },
  { label: 'Campaign', value: 'campaign' },
  { label: 'Agent', value: 'agent' },
  { label: 'Integration', value: 'integration' },
];

const logs = ref<ActivityLogRecord[]>([]);
const loading = ref(true);
const error = ref('');
const activeEntityType = ref('');
const expandedId = ref<string | null>(null);

let workspaceId: string | null = null;

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

async function fetchLogs() {
  if (!workspaceId) return;
  error.value = '';

  const params = new URLSearchParams({ workspace_id: workspaceId });
  if (activeEntityType.value) {
    params.set('entity_type', activeEntityType.value);
  }

  try {
    const res = await fetch(`${API_BASE}/api-activity-list?${params}`);
    if (!res.ok) {
      const body = await res.json();
      error.value = body.error || 'Failed to load activity logs';
      return;
    }
    logs.value = await res.json();
  } catch {
    error.value = 'Network error. Please try again.';
  }
}

function truncateUuid(uuid: string | null): string {
  if (!uuid) return '-';
  return uuid.length > 8 ? uuid.slice(0, 8) + '...' : uuid;
}

function hasMetadata(log: ActivityLogRecord): boolean {
  return log.metadata_json !== null && Object.keys(log.metadata_json).length > 0;
}

function formatJson(obj: Record<string, unknown> | null): string {
  if (!obj) return '{}';
  return JSON.stringify(obj, null, 2);
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

onMounted(async () => {
  workspaceId = await resolveWorkspace();
  if (!workspaceId) {
    loading.value = false;
    error.value = 'Unable to resolve workspace. Please log in.';
    return;
  }
  await fetchLogs();
  loading.value = false;
});
</script>
