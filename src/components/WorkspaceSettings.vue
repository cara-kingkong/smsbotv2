<template>
  <div class="space-y-6">
    <div v-if="loading" class="empty-state min-h-[280px]">Loading workspace settings...</div>

    <div v-else class="grid gap-6 xl:grid-cols-2">
      <fieldset class="panel space-y-5">
        <legend class="form-label">Default Business Hours</legend>
        <p class="section-copy">
          These hours apply to campaigns by default. Override them only when a campaign needs a different operating window.
        </p>

        <div>
          <label class="form-label">Timezone</label>
          <select v-model="form.timezone" class="select">
            <option v-for="tz in timezoneOptions" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
          </select>
        </div>

        <div>
          <label class="form-label">Active Days</label>
          <div class="flex flex-wrap gap-3">
            <label
              v-for="(dayLabel, dayIndex) in dayLabels"
              :key="dayIndex"
              class="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700"
            >
              <input
                v-model="form.activeDays"
                type="checkbox"
                :value="dayIndex"
                class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              {{ dayLabel }}
            </label>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="form-label">Start Time</label>
            <select v-model="form.startTime" class="select">
              <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">End Time</label>
            <select v-model="form.endTime" class="select">
              <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset class="panel space-y-5">
        <legend class="form-label">Default Stop Conditions</legend>
        <p class="section-copy">
          Set reasonable guardrails for conversations across the workspace. Campaigns can override these if needed.
        </p>

        <div class="grid gap-4">
          <div>
            <label class="form-label">Max Messages</label>
            <input v-model.number="form.maxMessages" type="number" min="1" class="input" />
          </div>
          <div>
            <label class="form-label">Max Days</label>
            <input v-model.number="form.maxDays" type="number" min="1" class="input" />
          </div>
          <div>
            <label class="form-label">Max No-Reply Hours</label>
            <input v-model.number="form.maxNoReplyHours" type="number" min="1" class="input" />
          </div>
        </div>
      </fieldset>

      <div class="xl:col-span-2 space-y-4">
        <div v-if="successMsg" class="feedback-success">{{ successMsg }}</div>
        <div v-if="errorMsg" class="feedback-error">{{ errorMsg }}</div>

        <button type="button" :disabled="saving" class="button-primary w-full sm:w-auto" @click="saveSettings">
          {{ saving ? 'Saving...' : 'Save Workspace Defaults' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';
import { timezoneOptions } from '@lib/utils/timezones';

const API_BASE = '/api';

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
