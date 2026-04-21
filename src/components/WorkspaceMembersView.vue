<template>
  <div class="panel space-y-4">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="section-copy">
          Members of this workspace. Only platform administrators can add or remove members.
        </p>
      </div>
      <a v-if="isPlatformAdmin" href="/admin/workspaces" class="button-secondary text-xs">Manage in Platform</a>
    </div>

    <div v-if="loading" class="space-y-2">
      <div v-for="i in 3" :key="i" class="skeleton-row"></div>
    </div>

    <div v-else-if="error" class="feedback-error">{{ error }}</div>

    <table v-else-if="members.length > 0" class="data-table w-full">
      <thead>
        <tr>
          <th>User</th>
          <th>Role</th>
          <th>Added</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in members" :key="m.user_id">
          <td>
            <div class="font-medium">{{ m.full_name || m.email }}</div>
            <div class="text-xs text-slate-500">{{ m.email }}</div>
          </td>
          <td class="capitalize">{{ m.role.replace('_', ' ') }}</td>
          <td class="text-xs text-slate-500">{{ formatDate(m.created_at) }}</td>
        </tr>
      </tbody>
    </table>

    <div v-else class="empty-state min-h-[120px]">No members yet.</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

interface MemberRow {
  membership_id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

const members = ref<MemberRow[]>([]);
const loading = ref(true);
const error = ref('');
const isPlatformAdmin = ref(false);

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

onMounted(async () => {
  const ctx = getSessionContext();
  isPlatformAdmin.value = ctx.isPlatformAdmin;
  if (!ctx.workspaceId) {
    loading.value = false;
    return;
  }
  try {
    const res = await fetch(`/api/api-workspace-members-list?workspace_id=${encodeURIComponent(ctx.workspaceId)}`);
    const data = await res.json();
    if (!res.ok) {
      error.value = data.error ?? 'Failed to load members';
      return;
    }
    members.value = data.members ?? [];
  } catch {
    error.value = 'Network error loading members.';
  } finally {
    loading.value = false;
  }
});
</script>
