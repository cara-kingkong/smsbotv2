<template>
  <div class="w-full space-y-4">
    <!-- Status filter tabs -->
    <div class="flex border-b border-slate-700">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="px-4 py-2.5 text-sm font-medium transition-colors"
        :class="activeFilter === tab.key
          ? 'text-blue-400 border-b-2 border-blue-500 bg-surface-hover'
          : 'text-slate-400 hover:text-slate-200'"
        @click="activeFilter = tab.key"
      >
        {{ tab.label }}
        <span
          v-if="tab.key !== 'all'"
          class="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full"
          :class="badgeBgClass(tab.key)"
        >
          {{ statusCounts[tab.key] ?? 0 }}
        </span>
      </button>
    </div>

    <!-- Summary counts -->
    <div class="grid grid-cols-5 gap-3">
      <div
        v-for="s in statusList"
        :key="s"
        class="bg-surface border border-slate-700 rounded-lg p-3 text-center"
      >
        <div class="text-xs text-slate-400 uppercase tracking-wide mb-1">{{ s.replace('_', ' ') }}</div>
        <div class="text-xl font-semibold" :class="badgeTextClass(s)">{{ statusCounts[s] ?? 0 }}</div>
      </div>
    </div>

    <!-- Jobs table -->
    <div class="bg-surface border border-slate-700 rounded-lg overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center py-12 text-slate-400 text-sm">
        Loading jobs...
      </div>
      <div v-else-if="filteredJobs.length === 0" class="flex items-center justify-center py-12 text-slate-400 text-sm">
        No jobs found{{ activeFilter !== 'all' ? ` with status "${activeFilter.replace('_', ' ')}"` : '' }}.
      </div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-700 text-left text-slate-400">
            <th class="px-4 py-3 font-medium">Job Type</th>
            <th class="px-4 py-3 font-medium">Queue</th>
            <th class="px-4 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium">Attempts</th>
            <th class="px-4 py-3 font-medium">Run At</th>
            <th class="px-4 py-3 font-medium">Last Error</th>
            <th class="px-4 py-3 font-medium">Created</th>
            <th class="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="job in filteredJobs"
            :key="job.id"
            class="border-b border-slate-700 hover:bg-surface-hover transition-colors"
          >
            <td class="px-4 py-3 text-slate-100 font-medium">{{ job.job_type }}</td>
            <td class="px-4 py-3 text-slate-300">{{ job.queue_name }}</td>
            <td class="px-4 py-3">
              <span
                class="text-[12px] px-2 py-0.5 rounded-full font-medium"
                :class="statusBadgeClass(job.status)"
              >
                {{ job.status.replace('_', ' ') }}
              </span>
            </td>
            <td class="px-4 py-3 text-slate-300">{{ job.attempts }}/{{ job.max_attempts }}</td>
            <td class="px-4 py-3 text-slate-400">{{ formatDate(job.run_at) }}</td>
            <td class="px-4 py-3 text-slate-400 max-w-[200px] truncate" :title="job.last_error ?? ''">
              {{ job.last_error ? truncate(job.last_error, 40) : '-' }}
            </td>
            <td class="px-4 py-3 text-slate-400">{{ relativeTime(job.created_at) }}</td>
            <td class="px-4 py-3">
              <button
                v-if="isRetryable(job.status)"
                class="text-[12px] px-3 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 font-medium transition-colors disabled:opacity-50"
                :disabled="retryingId === job.id"
                @click="retryJob(job.id)"
              >
                {{ retryingId === job.id ? 'Retrying...' : 'Retry' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Error message -->
    <div v-if="errorMsg" class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
      {{ errorMsg }}
    </div>

    <!-- Auto-refresh indicator -->
    <div class="text-[11px] text-slate-500 text-right">
      Auto-refreshes every 10s
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

const API_BASE = '/api';

interface JobRecord {
  id: string;
  workspace_id: string;
  job_type: string;
  queue_name: string;
  status: string;
  payload_json: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  run_at: string | null;
  last_error: string | null;
  dead_lettered_at: string | null;
  created_at: string;
  updated_at: string;
}

type StatusKey = 'queued' | 'processing' | 'completed' | 'failed' | 'dead_lettered';

const statusList: StatusKey[] = ['queued', 'processing', 'completed', 'failed', 'dead_lettered'];

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'queued', label: 'Queued' },
  { key: 'processing', label: 'Processing' },
  { key: 'failed', label: 'Failed' },
  { key: 'dead_lettered', label: 'Dead Letter' },
] as const;

const jobs = ref<JobRecord[]>([]);
const loading = ref(true);
const errorMsg = ref('');
const activeFilter = ref<string>('all');
const retryingId = ref<string | null>(null);

let workspaceId: string | null = null;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

const filteredJobs = computed(() => {
  if (activeFilter.value === 'all') return jobs.value;
  return jobs.value.filter((j) => j.status === activeFilter.value);
});

const statusCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const s of statusList) counts[s] = 0;
  for (const job of jobs.value) {
    if (counts[job.status] !== undefined) {
      counts[job.status]++;
    }
  }
  return counts;
});

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'queued': return 'bg-slate-500/15 text-slate-400';
    case 'processing': return 'bg-blue-500/15 text-blue-400';
    case 'completed': return 'bg-green-500/15 text-green-400';
    case 'failed': return 'bg-red-500/15 text-red-400';
    case 'dead_lettered': return 'bg-amber-500/15 text-amber-400';
    default: return 'bg-slate-500/15 text-slate-400';
  }
}

function badgeBgClass(status: string): string {
  switch (status) {
    case 'queued': return 'bg-slate-500/20 text-slate-400';
    case 'processing': return 'bg-blue-500/20 text-blue-400';
    case 'failed': return 'bg-red-500/20 text-red-400';
    case 'dead_lettered': return 'bg-amber-500/20 text-amber-400';
    default: return 'bg-slate-500/20 text-slate-400';
  }
}

function badgeTextClass(status: string): string {
  switch (status) {
    case 'queued': return 'text-slate-300';
    case 'processing': return 'text-blue-400';
    case 'completed': return 'text-green-400';
    case 'failed': return 'text-red-400';
    case 'dead_lettered': return 'text-amber-400';
    default: return 'text-slate-300';
  }
}

function isRetryable(status: string): boolean {
  return status === 'failed' || status === 'dead_lettered';
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
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

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function resolveWorkspace(): string | null {
  const { workspaceId } = getSessionContext();
  return workspaceId || null;
}

async function fetchJobs() {
  if (!workspaceId) return;
  errorMsg.value = '';

  try {
    const params = new URLSearchParams({ workspace_id: workspaceId });
    const res = await fetch(`${API_BASE}/api-jobs-list?${params}`);

    if (!res.ok) {
      const data = await res.json();
      errorMsg.value = data.error || 'Failed to load jobs';
      return;
    }

    jobs.value = await res.json();
  } catch {
    errorMsg.value = 'Network error loading jobs.';
  }
}

async function retryJob(jobId: string) {
  retryingId.value = jobId;
  errorMsg.value = '';

  try {
    const res = await fetch(`${API_BASE}/api-jobs-retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    });

    if (!res.ok) {
      const data = await res.json();
      errorMsg.value = data.error || 'Failed to retry job';
      return;
    }

    await fetchJobs();
  } catch {
    errorMsg.value = 'Network error retrying job.';
  } finally {
    retryingId.value = null;
  }
}

onMounted(async () => {
  workspaceId = resolveWorkspace();
  if (!workspaceId) {
    loading.value = false;
    return;
  }
  await fetchJobs();
  loading.value = false;

  refreshInterval = setInterval(fetchJobs, 10000);
});

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});
</script>
