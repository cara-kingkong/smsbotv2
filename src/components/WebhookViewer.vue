<template>
  <div class="bg-surface border border-slate-700 rounded-lg overflow-hidden flex flex-col" style="height: calc(100vh - 220px); min-height: 400px;">
    <!-- Filter tabs -->
    <div class="flex border-b border-slate-700 shrink-0">
      <button
        v-for="tab in statusTabs"
        :key="tab.value"
        class="px-4 py-3 text-sm font-medium transition-colors"
        :class="activeStatus === tab.value ? 'text-blue-400 border-b-2 border-blue-500 bg-surface-hover' : 'text-slate-400 hover:text-slate-200'"
        @click="activeStatus = tab.value; fetchWebhooks()"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="loading" class="flex items-center justify-center h-full text-slate-400 text-sm">
        Loading...
      </div>
      <div v-else-if="webhooks.length === 0" class="flex items-center justify-center h-full text-slate-400 text-sm p-6 text-center">
        No webhook receipts found.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="sticky top-0 bg-slate-800 z-10">
          <tr class="text-left text-slate-400 text-xs uppercase tracking-wider">
            <th class="px-4 py-3 font-medium">Source Type</th>
            <th class="px-4 py-3 font-medium">Source ID</th>
            <th class="px-4 py-3 font-medium">Idempotency Key</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="wh in webhooks" :key="wh.id">
            <tr
              class="border-t border-slate-700 cursor-pointer transition-colors hover:bg-surface-hover"
              :class="{ 'bg-surface-hover': expandedId === wh.id }"
              @click="expandedId = expandedId === wh.id ? null : wh.id"
            >
              <td class="px-4 py-3 text-slate-100 font-medium">{{ wh.source_type }}</td>
              <td class="px-4 py-3 text-slate-300 text-xs">{{ wh.source_identifier || '-' }}</td>
              <td class="px-4 py-3 text-slate-300 font-mono text-xs">{{ truncate(wh.idempotency_key) }}</td>
              <td class="px-4 py-3">
                <span
                  class="text-[12px] px-2 py-0.5 rounded-full font-medium"
                  :class="statusBadgeClass(wh.processed_status)"
                >
                  {{ wh.processed_status }}
                </span>
              </td>
              <td class="px-4 py-3 text-slate-400 text-right text-xs">{{ relativeTime(wh.created_at) }}</td>
            </tr>
            <!-- Expanded payload row -->
            <tr v-if="expandedId === wh.id">
              <td colspan="5" class="px-4 py-3 bg-slate-900/50 border-t border-slate-700/50">
                <div class="text-xs text-slate-400 mb-1 font-medium">Payload</div>
                <pre class="text-xs text-slate-300 bg-slate-900 border border-slate-700 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto"><code>{{ formatJson(wh.payload_json) }}</code></pre>
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
import { getPublicSupabaseClient } from '@lib/config/public-client';

const API_BASE = '/.netlify/functions';
const supabase = getPublicSupabaseClient();

interface WebhookReceiptRecord {
  id: string;
  workspace_id: string;
  source_type: string;
  source_identifier: string | null;
  idempotency_key: string | null;
  payload_json: Record<string, unknown> | null;
  processed_status: string;
  created_at: string;
}

const statusTabs = [
  { label: 'All', value: '' },
  { label: 'Received', value: 'received' },
  { label: 'Validated', value: 'validated' },
  { label: 'Processed', value: 'processed' },
  { label: 'Duplicate', value: 'duplicate' },
  { label: 'Failed', value: 'failed' },
];

const statusBadgeColors: Record<string, string> = {
  received: 'bg-slate-500/15 text-slate-400',
  validated: 'bg-blue-500/15 text-blue-400',
  processed: 'bg-green-500/15 text-green-400',
  duplicate: 'bg-amber-500/15 text-amber-400',
  failed: 'bg-red-500/15 text-red-400',
};

const webhooks = ref<WebhookReceiptRecord[]>([]);
const loading = ref(true);
const error = ref('');
const activeStatus = ref('');
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

async function fetchWebhooks() {
  if (!workspaceId) return;
  error.value = '';

  const params = new URLSearchParams({ workspace_id: workspaceId });
  if (activeStatus.value) {
    params.set('processed_status', activeStatus.value);
  }

  try {
    const res = await fetch(`${API_BASE}/api-webhooks-list?${params}`);
    if (!res.ok) {
      const body = await res.json();
      error.value = body.error || 'Failed to load webhook receipts';
      return;
    }
    webhooks.value = await res.json();
  } catch {
    error.value = 'Network error. Please try again.';
  }
}

function truncate(value: string | null): string {
  if (!value) return '-';
  return value.length > 12 ? value.slice(0, 12) + '...' : value;
}

function statusBadgeClass(status: string): string {
  return statusBadgeColors[status] || 'bg-slate-500/15 text-slate-400';
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
  await fetchWebhooks();
  loading.value = false;
});
</script>
