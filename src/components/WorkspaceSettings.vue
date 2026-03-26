<template>
  <div class="space-y-6">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12 text-slate-400 text-sm">
      Loading workspace settings...
    </div>

    <div v-else class="max-w-lg space-y-6">
      <!-- Business Hours -->
      <fieldset class="bg-surface border border-slate-700 rounded-lg p-5 space-y-4">
        <legend class="text-sm font-semibold text-slate-200 px-1">Default Business Hours</legend>
        <p class="text-xs text-slate-400 -mt-2">
          These hours apply to all campaigns in this workspace by default. Individual campaigns can override them.
        </p>

        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1">Timezone</label>
          <select
            v-model="form.timezone"
            class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          >
            <option v-for="tz in timezoneOptions" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1">Active Days</label>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="(dayLabel, dayIndex) in dayLabels"
              :key="dayIndex"
              class="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer"
            >
              <input
                type="checkbox"
                :value="dayIndex"
                v-model="form.activeDays"
                class="rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
              />
              {{ dayLabel }}
            </label>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Start Time</label>
            <select
              v-model="form.startTime"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">End Time</label>
            <select
              v-model="form.endTime"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
        </div>
      </fieldset>

      <!-- Stop Conditions -->
      <fieldset class="bg-surface border border-slate-700 rounded-lg p-5 space-y-4">
        <legend class="text-sm font-semibold text-slate-200 px-1">Default Stop Conditions</legend>
        <p class="text-xs text-slate-400 -mt-2">
          Default limits for all campaigns. Individual campaigns can override these.
        </p>

        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1">Max Messages</label>
          <input
            v-model.number="form.maxMessages"
            type="number"
            min="1"
            class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1">Max Days</label>
          <input
            v-model.number="form.maxDays"
            type="number"
            min="1"
            class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1">Max No-Reply Hours</label>
          <input
            v-model.number="form.maxNoReplyHours"
            type="number"
            min="1"
            class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </fieldset>

      <!-- Messages -->
      <div v-if="successMsg" class="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-lg">
        {{ successMsg }}
      </div>
      <div v-if="errorMsg" class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
        {{ errorMsg }}
      </div>

      <button
        type="button"
        :disabled="saving"
        class="w-full py-2.5 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
        @click="saveSettings"
      >
        {{ saving ? 'Saving...' : 'Save Workspace Defaults' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getSessionContext } from '@lib/config/public-client';
import { timezoneOptions } from '@lib/utils/timezones';

const API_BASE = '/.netlify/functions';

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const timeOptions = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return opts;
})();

const loading = ref(true);
const saving = ref(false);
const successMsg = ref('');
const errorMsg = ref('');

let workspaceId: string | null = null;

const form = ref({
  timezone: 'America/New_York',
  activeDays: [1, 2, 3, 4, 5] as number[],
  startTime: '09:00',
  endTime: '17:00',
  maxMessages: 50,
  maxDays: 14,
  maxNoReplyHours: 72,
});

function resolveWorkspace(): string | null {
  const { workspaceId } = getSessionContext();
  return workspaceId || null;
}

function buildBusinessHoursJson() {
  return {
    timezone: form.value.timezone,
    schedule: form.value.activeDays.map((day) => ({
      day,
      start: form.value.startTime,
      end: form.value.endTime,
    })),
  };
}

function buildStopConditionsJson() {
  return {
    max_messages: form.value.maxMessages,
    max_days: form.value.maxDays,
    max_no_reply_hours: form.value.maxNoReplyHours,
  };
}

async function loadSettings() {
  if (!workspaceId) return;

  try {
    const params = new URLSearchParams({ workspace_id: workspaceId });
    const res = await fetch(`${API_BASE}/api-workspace-settings-get?${params}`);

    if (!res.ok) return;

    const data = await res.json();
    const bh = data.business_hours_json;
    const sc = data.stop_conditions_json;

    if (bh?.schedule?.length) {
      form.value.timezone = bh.timezone ?? 'America/New_York';
      form.value.activeDays = bh.schedule.map((s: { day: number }) => s.day);
      form.value.startTime = bh.schedule[0]?.start ?? '09:00';
      form.value.endTime = bh.schedule[0]?.end ?? '17:00';
    }

    if (sc?.max_messages) {
      form.value.maxMessages = sc.max_messages;
      form.value.maxDays = sc.max_days ?? 14;
      form.value.maxNoReplyHours = sc.max_no_reply_hours ?? 72;
    }
  } catch {
    errorMsg.value = 'Failed to load workspace settings.';
  }
}

async function saveSettings() {
  if (!workspaceId) return;
  errorMsg.value = '';
  successMsg.value = '';
  saving.value = true;

  try {
    const res = await fetch(`${API_BASE}/api-workspace-settings-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        business_hours_json: buildBusinessHoursJson(),
        stop_conditions_json: buildStopConditionsJson(),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      errorMsg.value = data.error || 'Failed to save settings';
      return;
    }

    successMsg.value = 'Workspace defaults saved successfully.';
  } catch {
    errorMsg.value = 'Network error. Please try again.';
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  workspaceId = resolveWorkspace();
  if (workspaceId) await loadSettings();
  loading.value = false;
});
</script>
