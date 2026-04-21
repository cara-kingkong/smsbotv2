<template>
  <div class="space-y-6">
    <div v-if="loading" class="empty-state min-h-[180px]">Loading phone numbers...</div>

    <template v-else>
      <div class="panel space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h3 class="form-label">Phone Numbers</h3>
            <p class="section-copy">
              Outbound SMS picks a number whose country matches the lead. Falls back to the default when no country matches.
            </p>
          </div>
          <button type="button" class="button-primary" :disabled="showForm" @click="openNewForm">
            + Add Number
          </button>
        </div>

        <div v-if="errorMsg" class="feedback-error">{{ errorMsg }}</div>
        <div v-if="successMsg" class="feedback-success">{{ successMsg }}</div>

        <div v-if="numbers.length === 0" class="empty-state text-sm">
          No numbers yet. Add your Twilio numbers here so outbound SMS can route correctly.
        </div>

        <ul v-else class="divide-y divide-slate-200">
          <li
            v-for="n in numbers"
            :key="n.id"
            class="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div class="flex-1 min-w-[240px]">
              <div class="flex items-center gap-2">
                <span class="font-mono text-sm">{{ n.e164 }}</span>
                <span class="badge">{{ n.country_code }}</span>
                <span v-if="n.is_default" class="badge badge-primary">Default</span>
              </div>
              <div v-if="n.label" class="section-copy mt-1">{{ n.label }}</div>
            </div>

            <div class="flex items-center gap-2">
              <button
                v-if="!n.is_default"
                type="button"
                class="button-secondary"
                :disabled="saving"
                @click="setDefault(n)"
              >
                Set default
              </button>
              <button
                type="button"
                class="button-danger"
                :disabled="saving"
                @click="remove(n)"
              >
                Remove
              </button>
            </div>
          </li>
        </ul>
      </div>

      <form v-if="showForm" class="panel space-y-4" @submit.prevent="submitNew">
        <h3 class="form-label">Add Phone Number</h3>

        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="form-label">Country</label>
            <select v-model="form.country_code" class="select">
              <option value="AU">Australia (AU)</option>
              <option value="US">United States (US)</option>
            </select>
          </div>

          <div>
            <label class="form-label">Phone (E.164)</label>
            <input
              v-model="form.e164"
              type="tel"
              class="input"
              :placeholder="form.country_code === 'AU' ? '+61 4XX XXX XXX' : '+1 555 123 4567'"
            />
          </div>

          <div class="sm:col-span-2">
            <label class="form-label">Label (optional)</label>
            <input v-model="form.label" type="text" class="input" placeholder="e.g. Sydney sales line" />
          </div>

          <div class="sm:col-span-2 flex items-center gap-2">
            <input
              id="phone-is-default"
              v-model="form.is_default"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <label for="phone-is-default" class="text-sm text-slate-700">
              Make this the workspace default (used when no country matches)
            </label>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <button type="submit" :disabled="saving" class="button-primary">
            {{ saving ? 'Adding...' : 'Add Number' }}
          </button>
          <button type="button" class="button-secondary" :disabled="saving" @click="closeForm">
            Cancel
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

interface PhoneNumber {
  id: string;
  workspace_id: string;
  e164: string;
  country_code: string;
  label: string;
  is_default: boolean;
  provider: string;
}

const API_BASE = '/api';
const loading = ref(true);
const saving = ref(false);
const numbers = ref<PhoneNumber[]>([]);
const showForm = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

const form = ref({
  country_code: 'AU',
  e164: '',
  label: '',
  is_default: false,
});

let workspaceId: string | null = null;

function resolveWorkspace(): string | null {
  const { workspaceId } = getSessionContext();
  return workspaceId || null;
}

async function load() {
  if (!workspaceId) return;
  errorMsg.value = '';
  try {
    const res = await fetch(`${API_BASE}/api-workspace-phone-numbers-list?workspace_id=${workspaceId}`);
    if (!res.ok) {
      errorMsg.value = 'Failed to load phone numbers.';
      return;
    }
    numbers.value = await res.json();
  } catch {
    errorMsg.value = 'Network error while loading phone numbers.';
  }
}

function openNewForm() {
  form.value = { country_code: 'AU', e164: '', label: '', is_default: numbers.value.length === 0 };
  successMsg.value = '';
  errorMsg.value = '';
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
}

async function submitNew() {
  if (!workspaceId) return;
  errorMsg.value = '';
  successMsg.value = '';
  saving.value = true;
  try {
    const res = await fetch(`${API_BASE}/api-workspace-phone-numbers-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: workspaceId, ...form.value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errorMsg.value = data.error || 'Failed to add phone number.';
      return;
    }
    successMsg.value = 'Phone number added.';
    showForm.value = false;
    await load();
  } catch {
    errorMsg.value = 'Network error. Please try again.';
  } finally {
    saving.value = false;
  }
}

async function setDefault(n: PhoneNumber) {
  if (!workspaceId) return;
  saving.value = true;
  errorMsg.value = '';
  successMsg.value = '';
  try {
    const res = await fetch(`${API_BASE}/api-workspace-phone-numbers-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: n.id, workspace_id: workspaceId, is_default: true }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errorMsg.value = data.error || 'Failed to update default.';
      return;
    }
    successMsg.value = `${n.e164} is now the default.`;
    await load();
  } catch {
    errorMsg.value = 'Network error. Please try again.';
  } finally {
    saving.value = false;
  }
}

async function remove(n: PhoneNumber) {
  if (!workspaceId) return;
  if (!confirm(`Remove ${n.e164} from this workspace?`)) return;
  saving.value = true;
  errorMsg.value = '';
  successMsg.value = '';
  try {
    const res = await fetch(
      `${API_BASE}/api-workspace-phone-numbers-delete?id=${n.id}&workspace_id=${workspaceId}`,
      { method: 'DELETE' },
    );
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      errorMsg.value = data.error || 'Failed to remove phone number.';
      return;
    }
    successMsg.value = 'Phone number removed.';
    await load();
  } catch {
    errorMsg.value = 'Network error. Please try again.';
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  workspaceId = resolveWorkspace();
  if (workspaceId) await load();
  loading.value = false;
});
</script>
