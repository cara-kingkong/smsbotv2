<template>
  <div v-if="workspaces.length > 1" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      class="topbar-link flex items-center gap-2"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <span class="truncate max-w-[160px]">{{ activeName || 'Select workspace' }}</span>
      <span aria-hidden="true" class="text-xs opacity-70">▾</span>
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute right-0 top-full mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-lg z-50"
    >
      <ul class="py-1">
        <li v-for="ws in workspaces" :key="ws.id">
          <button
            type="button"
            role="menuitem"
            class="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
            :class="{ 'bg-slate-50 font-medium': ws.id === activeId }"
            :disabled="switching"
            @click="switchTo(ws.id)"
          >
            <span class="truncate">{{ ws.name }}</span>
            <span class="text-xs uppercase tracking-wide text-slate-500">{{ ws.role }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
  <div v-else-if="activeName" class="topbar-link pointer-events-none opacity-80">
    {{ activeName }}
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

const open = ref(false);
const switching = ref(false);

const ctx = ref(getSessionContext());
const workspaces = computed(() => ctx.value.availableWorkspaces);
const activeId = computed(() => ctx.value.workspaceId);
const activeName = computed(() => workspaces.value.find((w) => w.id === activeId.value)?.name ?? '');

async function switchTo(workspaceId: string) {
  if (workspaceId === activeId.value || switching.value) {
    open.value = false;
    return;
  }
  switching.value = true;
  try {
    const res = await fetch('/api/api-workspace-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('Workspace switch failed:', body.error ?? res.statusText);
      switching.value = false;
      return;
    }
    // Reload so the new workspace context is applied everywhere.
    window.location.reload();
  } catch (err) {
    console.error('Workspace switch error:', err);
    switching.value = false;
  }
}

function handleClickAway(event: MouseEvent) {
  if (!open.value) return;
  const target = event.target as HTMLElement | null;
  if (!target?.closest('[role="menu"]') && !target?.closest('[aria-haspopup="menu"]')) {
    open.value = false;
  }
}

onMounted(() => document.addEventListener('click', handleClickAway));
onUnmounted(() => document.removeEventListener('click', handleClickAway));
</script>
