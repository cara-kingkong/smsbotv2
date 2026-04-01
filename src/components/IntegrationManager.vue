<template>
  <div>
    <div v-if="loading" class="empty-state min-h-[280px]">Loading integrations...</div>

    <div v-else-if="loadError" class="feedback-error">{{ loadError }}</div>

    <div v-else class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="card in providerCards"
        :key="card.provider"
        class="panel flex h-full flex-col"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="page-kicker">{{ card.typeLabel }}</p>
            <h3 class="section-title mt-3 text-lg">{{ card.name }}</h3>
            <p class="section-copy mt-2">{{ card.description }}</p>
          </div>
          <span
            class="badge"
            :class="card.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'"
          >
            {{ card.connected ? 'Connected' : 'Not configured' }}
          </span>
        </div>

        <div class="mt-5">
          <span class="badge bg-teal-50 text-teal-700">{{ card.typeLabel }}</span>
        </div>

        <div v-if="!card.expanded" class="mt-5 flex-1">
          <div class="note-box">
            <template v-if="card.provider === 'twilio' && card.envConfigured">
              Connected via server environment variables. No additional configuration needed.
            </template>
            <template v-else-if="card.provider === 'twilio' && !card.envConfigured && !card.connected">
              Twilio credentials must be set as environment variables on the server (<span class="font-mono text-xs">TWILIO_ACCOUNT_SID</span>, <span class="font-mono text-xs">TWILIO_AUTH_TOKEN</span>, <span class="font-mono text-xs">TWILIO_PHONE_NUMBER</span>).
            </template>
            <template v-else-if="card.connected">
              Saved label: <span class="font-semibold text-slate-900">{{ card.savedName }}</span>
            </template>
            <template v-else>
              Configure this integration to make it available to the workspace.
            </template>
          </div>
        </div>

        <div v-if="card.expanded" class="mt-5 space-y-4">
          <div>
            <label class="form-label">Label</label>
            <input
              v-model="card.form.label"
              type="text"
              :placeholder="`My ${card.name} integration`"
              class="input"
            />
          </div>

          <template v-if="card.provider === 'twilio'">
            <div>
              <label class="form-label">Account SID</label>
              <input v-model="card.form.account_sid" type="text" placeholder="AC..." class="input" />
            </div>
            <div>
              <label class="form-label">Auth Token</label>
              <input v-model="card.form.auth_token" type="password" placeholder="********" class="input" />
            </div>
            <div>
              <label class="form-label">Phone Number</label>
              <input v-model="card.form.phone_number" type="tel" placeholder="+1..." class="input" />
            </div>
          </template>

          <template v-else-if="card.provider === 'openai'">
            <div>
              <label class="form-label">API Key</label>
              <input v-model="card.form.api_key" type="password" placeholder="sk-..." class="input" />
            </div>
            <div>
              <label class="form-label">Model</label>
              <input v-model="card.form.model" type="text" placeholder="gpt-4o" class="input" />
            </div>
          </template>

          <template v-else-if="card.provider === 'anthropic'">
            <div>
              <label class="form-label">API Key</label>
              <input v-model="card.form.api_key" type="password" placeholder="sk-ant-..." class="input" />
            </div>
            <div>
              <label class="form-label">Model</label>
              <input
                v-model="card.form.model"
                type="text"
                placeholder="claude-sonnet-4-20250514"
                class="input"
              />
            </div>
          </template>

          <template v-else-if="card.provider === 'calendly'">
            <div>
              <label class="form-label">Personal Access Token</label>
              <input v-model="card.form.api_key" type="password" placeholder="eyJra..." class="input" />
              <p class="mt-1.5 text-xs text-slate-500">
                Generate a token at
                <a href="https://calendly.com/integrations/api_webhooks" target="_blank" rel="noopener noreferrer" class="font-medium text-teal-600 hover:text-teal-700">calendly.com/integrations/api_webhooks</a>
              </p>
            </div>
          </template>

          <template v-else-if="card.provider === 'keap'">
            <div>
              <label class="form-label">API Key</label>
              <input v-model="card.form.api_key" type="password" placeholder="Your Keap API key" class="input" />
            </div>
          </template>

          <div class="note-box">
            Production secrets should live in environment variables. This screen stores configuration references and workspace-level setup metadata.
          </div>

          <div v-if="card.saveSuccess" class="feedback-success">{{ card.saveSuccess }}</div>
          <div v-if="card.saveError" class="feedback-error">{{ card.saveError }}</div>

          <div class="flex flex-wrap gap-2">
            <button :disabled="card.saving" class="button-primary flex-1" @click="saveIntegration(card)">
              {{ card.saving ? 'Saving...' : 'Save' }}
            </button>
            <button class="button-secondary" @click="card.expanded = false">Cancel</button>
          </div>
        </div>

        <div v-if="!card.expanded && !(card.provider === 'twilio' && card.envConfigured)" class="mt-6 flex flex-wrap gap-2">
          <button class="button-secondary flex-1" @click="openConfig(card)">Configure</button>
          <button class="button-ghost" :class="!card.connected ? 'cursor-not-allowed opacity-50' : ''" :disabled="!card.connected" @click="validateConfig(card)">
            Validate config
          </button>
        </div>

        <div v-if="card.validationMessage && !card.expanded" class="mt-4">
          <div class="note-box">
            {{ card.validationMessage }}
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

const API_BASE = '/api';

interface ProviderCard {
  provider: string;
  name: string;
  description: string;
  type: string;
  typeLabel: string;
  connected: boolean;
  savedName: string;
  existingId: string | null;
  expanded: boolean;
  saving: boolean;
  saveSuccess: string;
  saveError: string;
  validationMessage: string;
  form: Record<string, string>;
  envConfigured?: boolean;
}

interface TwilioEnvStatus {
  account_sid: boolean;
  auth_token: boolean;
  phone_number: boolean;
  configured: boolean;
}

const loading = ref(true);
const loadError = ref('');
let workspaceId: string | null = null;

const providerCards = reactive<ProviderCard[]>([
  {
    provider: 'twilio',
    name: 'Twilio',
    description: 'Send and receive SMS messages',
    type: 'sms',
    typeLabel: 'SMS',
    connected: false,
    savedName: '',
    existingId: null,
    expanded: false,
    saving: false,
    saveSuccess: '',
    saveError: '',
    validationMessage: '',
    form: { label: '', account_sid: '', auth_token: '', phone_number: '' },
  },
  {
    provider: 'openai',
    name: 'OpenAI',
    description: 'AI-powered conversation replies',
    type: 'ai_provider',
    typeLabel: 'AI Provider',
    connected: false,
    savedName: '',
    existingId: null,
    expanded: false,
    saving: false,
    saveSuccess: '',
    saveError: '',
    validationMessage: '',
    form: { label: '', api_key: '', model: 'gpt-4o' },
  },
  {
    provider: 'anthropic',
    name: 'Anthropic',
    description: 'Alternative AI provider (Claude)',
    type: 'ai_provider',
    typeLabel: 'AI Provider',
    connected: false,
    savedName: '',
    existingId: null,
    expanded: false,
    saving: false,
    saveSuccess: '',
    saveError: '',
    validationMessage: '',
    form: { label: '', api_key: '', model: 'claude-sonnet-4-20250514' },
  },
  {
    provider: 'calendly',
    name: 'Calendly',
    description: 'Calendar booking for qualified leads',
    type: 'calendar',
    typeLabel: 'Calendar',
    connected: false,
    savedName: '',
    existingId: null,
    expanded: false,
    saving: false,
    saveSuccess: '',
    saveError: '',
    validationMessage: '',
    form: { label: '', api_key: '' },
  },
  {
    provider: 'keap',
    name: 'Keap / Infusionsoft',
    description: 'CRM outcome sync (tags, notes)',
    type: 'crm',
    typeLabel: 'CRM',
    connected: false,
    savedName: '',
    existingId: null,
    expanded: false,
    saving: false,
    saveSuccess: '',
    saveError: '',
    validationMessage: '',
    form: { label: '', api_key: '' },
  },
]);

function resolveWorkspace(): string | null {
  const { workspaceId } = getSessionContext();
  return workspaceId || null;
}

async function fetchEnvStatus() {
  if (!workspaceId) return;
  const params = new URLSearchParams({ workspace_id: workspaceId });
  try {
    const res = await fetch(`${API_BASE}/api-integrations-env-status?${params}`);
    if (!res.ok) return;
    const status: { twilio: TwilioEnvStatus } = await res.json();

    const twilioCard = providerCards.find((c) => c.provider === 'twilio');
    if (twilioCard && status.twilio?.configured) {
      twilioCard.envConfigured = true;
      twilioCard.connected = true;
    }
  } catch {
    // Non-critical — fall back to DB-only state
  }
}

async function fetchIntegrations() {
  if (!workspaceId) return;
  const params = new URLSearchParams({ workspace_id: workspaceId });
  const res = await fetch(`${API_BASE}/api-integrations-list?${params}`);
  if (!res.ok) return;

  const integrations = await res.json();

  for (const integration of integrations) {
    const card = providerCards.find((c) => c.provider === integration.provider);
    if (card) {
      card.connected = true;
      card.savedName = integration.name;
      card.existingId = integration.id;

      const config = integration.config_json ?? {};
      card.form.label = integration.name;
      for (const key of Object.keys(config)) {
        if (key in card.form) {
          card.form[key] = config[key] as string;
        }
      }
    }
  }
}

function openConfig(card: ProviderCard) {
  card.expanded = true;
  card.saveSuccess = '';
  card.saveError = '';
  card.validationMessage = '';
}

function buildConfigJson(card: ProviderCard): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  if (card.provider === 'twilio') {
    config.account_sid_ref = card.form.account_sid ? 'TWILIO_ACCOUNT_SID' : '';
    config.auth_token_ref = card.form.auth_token ? 'TWILIO_AUTH_TOKEN' : '';
    config.phone_number = card.form.phone_number;
    config.configured = !!(card.form.account_sid && card.form.auth_token && card.form.phone_number);
  } else if (card.provider === 'openai') {
    config.api_key_ref = card.form.api_key ? 'OPENAI_API_KEY' : '';
    config.model = card.form.model || 'gpt-4o';
    config.configured = !!card.form.api_key;
  } else if (card.provider === 'anthropic') {
    config.api_key_ref = card.form.api_key ? 'ANTHROPIC_API_KEY' : '';
    config.model = card.form.model || 'claude-sonnet-4-20250514';
    config.configured = !!card.form.api_key;
  } else if (card.provider === 'calendly') {
    config.personal_access_token_ref = card.form.api_key ? 'CALENDLY_PERSONAL_ACCESS_TOKEN' : '';
    config.configured = !!card.form.api_key;
  } else if (card.provider === 'keap') {
    config.api_key_ref = card.form.api_key ? 'KEAP_API_KEY' : '';
    config.configured = !!card.form.api_key;
  }

  return config;
}

async function saveIntegration(card: ProviderCard) {
  if (!workspaceId) return;
  card.saving = true;
  card.saveSuccess = '';
  card.saveError = '';

  const name = card.form.label?.trim() || card.name;
  const configJson = buildConfigJson(card);

  try {
    const res = await fetch(`${API_BASE}/api-integrations-upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        type: card.type,
        provider: card.provider,
        name,
        config_json: configJson,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      card.saveError = data.error || 'Failed to save integration';
      return;
    }

    card.connected = true;
    card.savedName = name;
    card.existingId = data.id;
    card.saveSuccess = 'Integration saved successfully';
    card.expanded = false;
  } catch {
    card.saveError = 'Network error. Please try again.';
  } finally {
    card.saving = false;
  }
}

function validateConfig(card: ProviderCard) {
  if (!card.connected) return;

  const requiredFields: Record<string, string[]> = {
    twilio: ['account_sid', 'auth_token', 'phone_number'],
    openai: ['api_key', 'model'],
    anthropic: ['api_key', 'model'],
    calendly: ['api_key'],
    keap: ['api_key'],
  };

  const missing = (requiredFields[card.provider] ?? []).filter((field) => !card.form[field]?.trim());
  card.validationMessage = missing.length > 0
    ? `Missing required fields: ${missing.join(', ')}`
    : 'Configuration fields are present. Live provider checks run in the backend after deployment.';
}

onMounted(async () => {
  workspaceId = resolveWorkspace();
  if (!workspaceId) {
    loadError.value = 'Unable to resolve workspace. Please log in.';
    loading.value = false;
    return;
  }
  await Promise.all([fetchIntegrations(), fetchEnvStatus()]);
  loading.value = false;
});
</script>
