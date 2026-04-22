<template>
  <div class="space-y-8">
    <!-- Endpoint overview -->
    <section class="panel p-6">
      <div class="page-kicker">Start Conversation Webhook</div>
      <h2 class="section-title mt-3">Create a lead &amp; start a conversation in one call</h2>
      <p class="section-copy mt-2">
        POST a JSON payload to this endpoint. The system will create (or update) the lead,
        assign an AI agent from the campaign, and send the first message automatically.
      </p>

      <div class="mt-5 flex items-center gap-3">
        <span class="badge bg-emerald-50 text-emerald-700 font-mono text-xs">POST</span>
        <code class="flex-1 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-mono text-slate-800 select-all break-all">
          {{ endpointUrl }}
        </code>
        <button
          class="button-secondary text-xs"
          @click="copyToClipboard(endpointUrl)"
        >
          {{ copiedField === 'url' ? 'Copied!' : 'Copy' }}
        </button>
      </div>
    </section>

    <!-- Your IDs -->
    <section class="panel p-6">
      <h3 class="section-title">Your IDs</h3>
      <p class="section-copy mt-2">
        Use these values for <code class="text-xs bg-slate-50 px-1.5 py-0.5 rounded">workspace_id</code>
        and <code class="text-xs bg-slate-50 px-1.5 py-0.5 rounded">campaign_id</code> in your request.
      </p>

      <div class="mt-5 space-y-4">
        <div>
          <label class="form-label">Workspace ID</label>
          <div class="flex items-center gap-3">
            <code class="flex-1 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-mono text-slate-800 select-all break-all">
              {{ workspaceId || 'Loading...' }}
            </code>
            <button
              class="button-secondary text-xs"
              :disabled="!workspaceId"
              @click="copyToClipboard(workspaceId, 'workspace')"
            >
              {{ copiedField === 'workspace' ? 'Copied!' : 'Copy' }}
            </button>
          </div>
        </div>

        <div>
          <label class="form-label">Campaign</label>
          <select v-model="selectedCampaignId" class="input max-w-sm">
            <option value="" disabled>Select a campaign...</option>
            <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <p v-if="campaigns.length === 0 && !loading" class="mt-2 text-sm text-slate-500">
            No active campaigns.
            <a href="/campaigns" class="text-teal-700 hover:text-teal-800 font-medium">Create one first.</a>
          </p>
        </div>

        <div v-if="selectedCampaignId">
          <label class="form-label">Campaign ID</label>
          <div class="flex items-center gap-3">
            <code class="flex-1 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-mono text-slate-800 select-all break-all">
              {{ selectedCampaignId }}
            </code>
            <button
              class="button-secondary text-xs"
              @click="copyToClipboard(selectedCampaignId, 'campaign')"
            >
              {{ copiedField === 'campaign' ? 'Copied!' : 'Copy' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Required fields -->
    <section class="panel p-6">
      <h3 class="section-title">Request Body</h3>
      <p class="section-copy mt-2">Content-Type: <code class="text-xs bg-slate-50 px-1.5 py-0.5 rounded">application/json</code></p>

      <div class="mt-5 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-slate-500 uppercase tracking-wider">
              <th class="pb-3 pr-4">Field</th>
              <th class="pb-3 pr-4">Type</th>
              <th class="pb-3 pr-4">Required</th>
              <th class="pb-3">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y" style="border-color: rgba(17,17,17,0.06);">
            <tr v-for="field in fields" :key="field.name" class="text-slate-700">
              <td class="py-3 pr-4 font-mono text-xs font-medium text-slate-900">{{ field.name }}</td>
              <td class="py-3 pr-4 text-xs text-slate-500">{{ field.type }}</td>
              <td class="py-3 pr-4">
                <span v-if="field.required" class="text-xs font-semibold text-red-600">Yes</span>
                <span v-else class="text-xs text-slate-400">No</span>
              </td>
              <td class="py-3 text-xs text-slate-600">{{ field.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Live example -->
    <section class="panel p-6">
      <h3 class="section-title">Your Example Payload</h3>
      <p class="section-copy mt-2">
        Pre-filled with your workspace and campaign IDs from above.
      </p>

      <!-- JSON payload -->
      <div class="mt-5 relative">
        <pre
          class="rounded-2xl bg-slate-900 p-5 text-sm text-slate-100 overflow-x-auto leading-relaxed font-mono"
        >{{ formattedPayload }}</pre>
        <button
          class="absolute top-3 right-3 rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600 transition"
          @click="copyToClipboard(formattedPayload, 'payload')"
        >
          {{ copiedField === 'payload' ? 'Copied!' : 'Copy JSON' }}
        </button>
      </div>

      <!-- Curl command -->
      <div class="mt-5">
        <h4 class="text-sm font-semibold text-slate-900 mb-2">cURL Command</h4>
        <div class="relative">
          <pre
            class="rounded-2xl bg-slate-900 p-5 text-sm text-slate-100 overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap break-all"
          >{{ curlCommand }}</pre>
          <button
            class="absolute top-3 right-3 rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600 transition"
            @click="copyToClipboard(curlCommand, 'curl')"
          >
            {{ copiedField === 'curl' ? 'Copied!' : 'Copy cURL' }}
          </button>
        </div>
      </div>
    </section>

    <!-- Test it -->
    <section class="panel p-6">
      <h3 class="section-title">Test It</h3>
      <p class="section-copy mt-2">
        Send a test request using the example above. Fill in a real phone number and name below.
      </p>

      <div class="mt-4 grid gap-4 sm:grid-cols-2 max-w-2xl">
        <div>
          <label class="form-label">Phone *</label>
          <input v-model="testPhone" type="tel" placeholder="+1 555 123 4567" class="input" />
        </div>
        <div>
          <label class="form-label">Email *</label>
          <input v-model="testEmail" type="email" placeholder="jane@example.com" class="input" />
        </div>
        <div>
          <label class="form-label">First Name *</label>
          <input v-model="testFirstName" type="text" placeholder="Jane" class="input" />
        </div>
        <div>
          <label class="form-label">Last Name</label>
          <input v-model="testLastName" type="text" placeholder="Doe" class="input" />
        </div>
        <div class="sm:col-span-2">
          <label class="form-label">Timezone *</label>
          <input v-model="testTimezone" type="text" placeholder="America/New_York" class="input" />
          <p class="form-help mt-1">IANA timezone — used for business-hours checks.</p>
        </div>
      </div>

      <button
        class="button-primary mt-4"
        :disabled="!selectedCampaignId || !testPhone || !testFirstName || !testEmail || !testTimezone || testLoading"
        @click="sendTest"
      >
        {{ testLoading ? 'Sending...' : 'Send Test Request' }}
      </button>

      <div v-if="testError" class="feedback-error mt-3">{{ testError }}</div>
      <div v-if="testSuccess" class="feedback-success mt-3">{{ testSuccess }}</div>

      <div v-if="testResponse" class="mt-4">
        <h4 class="text-sm font-semibold text-slate-900 mb-2">Response</h4>
        <pre class="rounded-2xl bg-slate-50 p-4 text-xs text-slate-700 overflow-x-auto font-mono">{{ testResponse }}</pre>
      </div>
    </section>

    <!-- Response format -->
    <section class="panel p-6">
      <h3 class="section-title">Response</h3>
      <p class="section-copy mt-2">On success, returns <code class="text-xs bg-slate-50 px-1.5 py-0.5 rounded">201 Created</code>:</p>
      <pre class="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-700 overflow-x-auto font-mono leading-relaxed">{
  "conversation_id": "uuid",
  "lead_id": "uuid",
  "agent_id": "uuid",
  "agent_version_id": "uuid"
}</pre>

      <div class="mt-5 space-y-3">
        <div class="flex items-start gap-3 rounded-xl border px-4 py-3" style="border-color: rgba(17,17,17,0.06);">
          <span class="badge bg-blue-50 text-blue-700 text-xs mt-0.5">200</span>
          <span class="text-sm text-slate-600">Lead already has an active conversation (returns existing conversation_id)</span>
        </div>
        <div class="flex items-start gap-3 rounded-xl border px-4 py-3" style="border-color: rgba(17,17,17,0.06);">
          <span class="badge bg-amber-50 text-amber-700 text-xs mt-0.5">400</span>
          <span class="text-sm text-slate-600">Missing required fields</span>
        </div>
        <div class="flex items-start gap-3 rounded-xl border px-4 py-3" style="border-color: rgba(17,17,17,0.06);">
          <span class="badge bg-amber-50 text-amber-700 text-xs mt-0.5">409</span>
          <span class="text-sm text-slate-600">Duplicate request already in progress (idempotency)</span>
        </div>
        <div class="flex items-start gap-3 rounded-xl border px-4 py-3" style="border-color: rgba(17,17,17,0.06);">
          <span class="badge bg-red-50 text-red-700 text-xs mt-0.5">500</span>
          <span class="text-sm text-slate-600">Server error (check webhook receipts for details)</span>
        </div>
      </div>
    </section>

    <!-- Notes -->
    <section class="panel p-6">
      <h3 class="section-title">Notes</h3>
      <ul class="mt-3 space-y-2 text-sm text-slate-600 list-disc pl-5">
        <li>Phone numbers are normalised to E.164 format automatically. Include the country code for best results.</li>
        <li>A lead can only have <strong>one active conversation</strong> at a time. If one already exists, the endpoint returns it instead of creating a duplicate.</li>
        <li>The <code class="text-xs bg-slate-50 px-1.5 py-0.5 rounded">idempotency_key</code> prevents duplicate processing if you retry the same request.</li>
        <li>Agents are selected from the campaign using weighted random (for A/B testing). Configure agent weights on the Agents page.</li>
        <li>The AI sends the first message automatically after the configured delay.</li>
        <li>Use <code class="text-xs bg-slate-50 px-1.5 py-0.5 rounded">source_metadata</code> to tag where the lead came from (e.g. CRM, Zapier, form).</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getSessionContext } from '@lib/config/public-client';

const API_BASE = '/api';

interface CampaignOption { id: string; name: string; status: string; }

const loading = ref(true);
const campaigns = ref<CampaignOption[]>([]);
const selectedCampaignId = ref('');
const copiedField = ref('');

const testPhone = ref('');
const testFirstName = ref('');
const testLastName = ref('');
const testEmail = ref('');
const testTimezone = ref('');
const testLoading = ref(false);
const testError = ref('');
const testSuccess = ref('');
const testResponse = ref('');

const workspaceId = ref('');

const siteOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://your-site.netlify.app';
const endpointUrl = computed(() => `${siteOrigin}/.netlify/functions/webhook-start-conversation`);

const fields = [
  { name: 'workspace_id', type: 'string (UUID)', required: true, description: 'Your workspace ID' },
  { name: 'campaign_id', type: 'string (UUID)', required: true, description: 'Campaign to assign the lead to' },
  { name: 'lead.phone', type: 'string', required: true, description: 'Phone number (E.164 preferred, e.g. +14155551234)' },
  { name: 'lead.first_name', type: 'string', required: true, description: 'Lead\'s first name' },
  { name: 'lead.email', type: 'string', required: true, description: 'Lead\'s email address (required for booking)' },
  { name: 'lead.timezone', type: 'string', required: true, description: 'IANA timezone (e.g. America/New_York) — required for business-hours checks' },
  { name: 'lead.last_name', type: 'string', required: false, description: 'Lead\'s last name' },
  { name: 'lead.external_contact_id', type: 'string', required: false, description: 'CRM contact ID for syncing' },
  { name: 'idempotency_key', type: 'string', required: false, description: 'Unique key to prevent duplicate processing' },
  { name: 'source_metadata', type: 'object', required: false, description: 'Arbitrary JSON for tracking lead source' },
];

const examplePayload = computed(() => ({
  workspace_id: workspaceId.value || 'YOUR_WORKSPACE_ID',
  campaign_id: selectedCampaignId.value || 'YOUR_CAMPAIGN_ID',
  lead: {
    phone: '+14155551234',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    timezone: 'America/New_York',
  },
  source_metadata: { source: 'api' },
}));

const formattedPayload = computed(() => JSON.stringify(examplePayload.value, null, 2));

const curlCommand = computed(() =>
  `curl -X POST "${endpointUrl.value}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(examplePayload.value, null, 2)}'`
);

async function copyToClipboard(text: string, field = 'url') {
  try {
    await navigator.clipboard.writeText(text);
    copiedField.value = field;
    setTimeout(() => { copiedField.value = ''; }, 2000);
  } catch { /* ignore */ }
}

async function sendTest() {
  if (!workspaceId.value || !selectedCampaignId.value) return;
  testError.value = '';
  testSuccess.value = '';
  testResponse.value = '';
  testLoading.value = true;

  try {
    const res = await fetch(`${API_BASE}/webhook-start-conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId.value,
        campaign_id: selectedCampaignId.value,
        lead: {
          phone: testPhone.value,
          first_name: testFirstName.value,
          email: testEmail.value,
          timezone: testTimezone.value,
          last_name: testLastName.value || undefined,
        },
        source_metadata: { source: 'api_guide_test' },
      }),
    });

    const data = await res.json();
    testResponse.value = JSON.stringify(data, null, 2);

    if (res.status === 201) {
      testSuccess.value = `Conversation started! ID: ${data.conversation_id}`;
    } else if (res.ok) {
      testSuccess.value = data.message || 'Request processed.';
    } else {
      testError.value = data.error || `Request failed (${res.status})`;
    }
  } catch {
    testError.value = 'Network error. Please try again.';
  } finally {
    testLoading.value = false;
  }
}

onMounted(async () => {
  const ctx = getSessionContext();
  workspaceId.value = ctx.workspaceId || '';

  if (!workspaceId.value) {
    loading.value = false;
    return;
  }

  const params = new URLSearchParams({ workspace_id: workspaceId.value, status: 'active' });
  const res = await fetch(`${API_BASE}/api-campaigns-list?${params}`);
  if (res.ok) {
    campaigns.value = await res.json();
    if (campaigns.value.length === 1) {
      selectedCampaignId.value = campaigns.value[0].id;
    }
  }
  loading.value = false;
});
</script>
