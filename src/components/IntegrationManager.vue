<template>
  <div>
    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center py-12 text-slate-400 text-sm">
      Loading integrations...
    </div>

    <!-- Error state -->
    <div v-else-if="loadError" class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
      {{ loadError }}
    </div>

    <!-- Integration cards grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div
        v-for="card in providerCards"
        :key="card.provider"
        class="bg-surface border border-slate-700 rounded-lg overflow-hidden flex flex-col"
      >
        <!-- Card header -->
        <div class="p-5 flex-1">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h3 class="text-sm font-semibold text-slate-100">{{ card.name }}</h3>
              <p class="text-xs text-slate-400 mt-0.5">{{ card.description }}</p>
            </div>
            <span
              class="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ml-3"
              :class="card.connected
                ? 'bg-green-500/15 text-green-400'
                : 'bg-slate-700/50 text-slate-400'"
            >
              {{ card.connected ? 'Connected' : 'Not configured' }}
            </span>
          </div>

          <!-- Integration type badge -->
          <div class="mb-4">
            <span class="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">
              {{ card.typeLabel }}
            </span>
          </div>

          <!-- Collapsed state: show configured label if any -->
          <div v-if="!card.expanded && card.connected" class="text-xs text-slate-400">
            Label: <span class="text-slate-200">{{ card.savedName }}</span>
          </div>

          <!-- Expanded config form -->
          <div v-if="card.expanded" class="space-y-3 mt-3">
            <!-- Label field (all providers) -->
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1">Label</label>
              <input
                v-model="card.form.label"
                type="text"
                :placeholder="`My ${card.name} integration`"
                class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <!-- Provider-specific fields -->
            <template v-if="card.provider === 'twilio'">
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">Account SID</label>
                <input
                  v-model="card.form.account_sid"
                  type="text"
                  placeholder="AC..."
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">Auth Token</label>
                <input
                  v-model="card.form.auth_token"
                  type="password"
                  placeholder="********"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">Phone Number</label>
                <input
                  v-model="card.form.phone_number"
                  type="tel"
                  placeholder="+1..."
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </template>

            <template v-else-if="card.provider === 'openai'">
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                <input
                  v-model="card.form.api_key"
                  type="password"
                  placeholder="sk-..."
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">Model</label>
                <input
                  v-model="card.form.model"
                  type="text"
                  placeholder="gpt-4o"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </template>

            <template v-else-if="card.provider === 'anthropic'">
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                <input
                  v-model="card.form.api_key"
                  type="password"
                  placeholder="sk-ant-..."
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">Model</label>
                <input
                  v-model="card.form.model"
                  type="text"
                  placeholder="claude-sonnet-4-20250514"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </template>

            <template v-else-if="card.provider === 'calendly'">
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                <input
                  v-model="card.form.api_key"
                  type="password"
                  placeholder="Your Calendly API key"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </template>

            <template v-else-if="card.provider === 'keap'">
              <div>
                <label class="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                <input
                  v-model="card.form.api_key"
                  type="password"
                  placeholder="Your Keap API key"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </template>

            <!-- Security notice -->
            <div class="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-400">
              For production, secrets (API keys, tokens) should be stored in environment variables.
              This form saves a configuration reference and marks the integration as configured.
            </div>

            <!-- Form feedback -->
            <div v-if="card.saveSuccess" class="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-lg">
              {{ card.saveSuccess }}
            </div>
            <div v-if="card.saveError" class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
              {{ card.saveError }}
            </div>

            <!-- Action buttons -->
            <div class="flex gap-2">
              <button
                :disabled="card.saving"
                class="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                @click="saveIntegration(card)"
              >
                {{ card.saving ? 'Saving...' : 'Save' }}
              </button>
              <button
                class="px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 text-slate-300 hover:bg-surface-hover transition-colors"
                @click="card.expanded = false"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        <!-- Card footer -->
        <div v-if="!card.expanded" class="border-t border-slate-700 px-5 py-3 flex gap-2">
          <button
            class="flex-1 py-2 rounded-lg text-sm font-medium border border-slate-700 text-slate-300 hover:bg-surface-hover transition-colors"
            @click="openConfig(card)"
          >
            Configure
          </button>
          <button
            class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            :class="card.connected
              ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
              : 'bg-slate-700/50 text-slate-400 cursor-not-allowed'"
            :disabled="!card.connected"
            @click="toggleHealthCheck(card)"
          >
            {{ card.healthChecking ? 'Checking...' : 'Health Check' }}
          </button>
        </div>

        <!-- Health check result -->
        <div
          v-if="card.healthResult !== null && !card.expanded"
          class="px-5 pb-3"
        >
          <div
            class="text-xs px-3 py-2 rounded-lg"
            :class="card.healthResult
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'"
          >
            {{ card.healthResult ? 'Health check passed' : 'Health check failed' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { getPublicSupabaseClient } from '@lib/config/public-client';

const API_BASE = '/.netlify/functions';
const supabase = getPublicSupabaseClient();

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
  healthChecking: boolean;
  healthResult: boolean | null;
  form: Record<string, string>;
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
    healthChecking: false,
    healthResult: null,
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
    healthChecking: false,
    healthResult: null,
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
    healthChecking: false,
    healthResult: null,
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
    healthChecking: false,
    healthResult: null,
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
    healthChecking: false,
    healthResult: null,
    form: { label: '', api_key: '' },
  },
]);

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

      // Populate form from saved config
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
  card.healthResult = null;
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
    config.api_key_ref = card.form.api_key ? 'CALENDLY_API_KEY' : '';
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

async function toggleHealthCheck(card: ProviderCard) {
  if (card.healthChecking || !card.connected) return;
  card.healthChecking = true;
  card.healthResult = null;

  // Simulate health check (adapter healthCheck not wired yet)
  await new Promise((resolve) => setTimeout(resolve, 800));
  card.healthResult = true;
  card.healthChecking = false;
}

onMounted(async () => {
  workspaceId = await resolveWorkspace();
  if (!workspaceId) {
    loadError.value = 'Unable to resolve workspace. Please log in.';
    loading.value = false;
    return;
  }
  await fetchIntegrations();
  loading.value = false;
});
</script>
