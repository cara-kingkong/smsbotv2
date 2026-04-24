<template>
  <div class="space-y-6">
    <div v-if="loading" class="empty-state min-h-[180px]">Loading phone numbers...</div>

    <template v-else>
      <div class="panel space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h3 class="form-label">Phone Numbers</h3>
            <p class="section-copy">
              Outbound SMS only goes to leads whose country matches one of your numbers. If no number for that country is configured, the conversation is flagged for a human instead of sending.
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
              <option value="AF">Afghanistan (AF)</option>
              <option value="AL">Albania (AL)</option>
              <option value="DZ">Algeria (DZ)</option>
              <option value="AS">American Samoa (AS)</option>
              <option value="AD">Andorra (AD)</option>
              <option value="AO">Angola (AO)</option>
              <option value="AI">Anguilla (AI)</option>
              <option value="AG">Antigua and Barbuda (AG)</option>
              <option value="AR">Argentina (AR)</option>
              <option value="AM">Armenia (AM)</option>
              <option value="AW">Aruba (AW)</option>
              <option value="AU">Australia (AU)</option>
              <option value="AT">Austria (AT)</option>
              <option value="AZ">Azerbaijan (AZ)</option>
              <option value="BS">Bahamas (BS)</option>
              <option value="BH">Bahrain (BH)</option>
              <option value="BD">Bangladesh (BD)</option>
              <option value="BB">Barbados (BB)</option>
              <option value="BY">Belarus (BY)</option>
              <option value="BE">Belgium (BE)</option>
              <option value="BZ">Belize (BZ)</option>
              <option value="BJ">Benin (BJ)</option>
              <option value="BM">Bermuda (BM)</option>
              <option value="BT">Bhutan (BT)</option>
              <option value="BO">Bolivia (BO)</option>
              <option value="BA">Bosnia and Herzegovina (BA)</option>
              <option value="BW">Botswana (BW)</option>
              <option value="BR">Brazil (BR)</option>
              <option value="BN">Brunei (BN)</option>
              <option value="BG">Bulgaria (BG)</option>
              <option value="BF">Burkina Faso (BF)</option>
              <option value="BI">Burundi (BI)</option>
              <option value="KH">Cambodia (KH)</option>
              <option value="CM">Cameroon (CM)</option>
              <option value="CA">Canada (CA)</option>
              <option value="CV">Cape Verde (CV)</option>
              <option value="KY">Cayman Islands (KY)</option>
              <option value="CF">Central African Republic (CF)</option>
              <option value="TD">Chad (TD)</option>
              <option value="CL">Chile (CL)</option>
              <option value="CN">China (CN)</option>
              <option value="CO">Colombia (CO)</option>
              <option value="KM">Comoros (KM)</option>
              <option value="CG">Congo (CG)</option>
              <option value="CD">Congo, Democratic Republic (CD)</option>
              <option value="CK">Cook Islands (CK)</option>
              <option value="CR">Costa Rica (CR)</option>
              <option value="CI">Côte d'Ivoire (CI)</option>
              <option value="HR">Croatia (HR)</option>
              <option value="CU">Cuba (CU)</option>
              <option value="CW">Curaçao (CW)</option>
              <option value="CY">Cyprus (CY)</option>
              <option value="CZ">Czech Republic (CZ)</option>
              <option value="DK">Denmark (DK)</option>
              <option value="DJ">Djibouti (DJ)</option>
              <option value="DM">Dominica (DM)</option>
              <option value="DO">Dominican Republic (DO)</option>
              <option value="EC">Ecuador (EC)</option>
              <option value="EG">Egypt (EG)</option>
              <option value="SV">El Salvador (SV)</option>
              <option value="GQ">Equatorial Guinea (GQ)</option>
              <option value="ER">Eritrea (ER)</option>
              <option value="EE">Estonia (EE)</option>
              <option value="SZ">Eswatini (SZ)</option>
              <option value="ET">Ethiopia (ET)</option>
              <option value="FK">Falkland Islands (FK)</option>
              <option value="FO">Faroe Islands (FO)</option>
              <option value="FJ">Fiji (FJ)</option>
              <option value="FI">Finland (FI)</option>
              <option value="FR">France (FR)</option>
              <option value="GF">French Guiana (GF)</option>
              <option value="PF">French Polynesia (PF)</option>
              <option value="GA">Gabon (GA)</option>
              <option value="GM">Gambia (GM)</option>
              <option value="GE">Georgia (GE)</option>
              <option value="DE">Germany (DE)</option>
              <option value="GH">Ghana (GH)</option>
              <option value="GI">Gibraltar (GI)</option>
              <option value="GR">Greece (GR)</option>
              <option value="GL">Greenland (GL)</option>
              <option value="GD">Grenada (GD)</option>
              <option value="GP">Guadeloupe (GP)</option>
              <option value="GU">Guam (GU)</option>
              <option value="GT">Guatemala (GT)</option>
              <option value="GG">Guernsey (GG)</option>
              <option value="GN">Guinea (GN)</option>
              <option value="GW">Guinea-Bissau (GW)</option>
              <option value="GY">Guyana (GY)</option>
              <option value="HT">Haiti (HT)</option>
              <option value="HN">Honduras (HN)</option>
              <option value="HK">Hong Kong (HK)</option>
              <option value="HU">Hungary (HU)</option>
              <option value="IS">Iceland (IS)</option>
              <option value="IN">India (IN)</option>
              <option value="ID">Indonesia (ID)</option>
              <option value="IR">Iran (IR)</option>
              <option value="IQ">Iraq (IQ)</option>
              <option value="IE">Ireland (IE)</option>
              <option value="IM">Isle of Man (IM)</option>
              <option value="IL">Israel (IL)</option>
              <option value="IT">Italy (IT)</option>
              <option value="JM">Jamaica (JM)</option>
              <option value="JP">Japan (JP)</option>
              <option value="JE">Jersey (JE)</option>
              <option value="JO">Jordan (JO)</option>
              <option value="KZ">Kazakhstan (KZ)</option>
              <option value="KE">Kenya (KE)</option>
              <option value="KI">Kiribati (KI)</option>
              <option value="KP">Korea, North (KP)</option>
              <option value="KR">Korea, South (KR)</option>
              <option value="XK">Kosovo (XK)</option>
              <option value="KW">Kuwait (KW)</option>
              <option value="KG">Kyrgyzstan (KG)</option>
              <option value="LA">Laos (LA)</option>
              <option value="LV">Latvia (LV)</option>
              <option value="LB">Lebanon (LB)</option>
              <option value="LS">Lesotho (LS)</option>
              <option value="LR">Liberia (LR)</option>
              <option value="LY">Libya (LY)</option>
              <option value="LI">Liechtenstein (LI)</option>
              <option value="LT">Lithuania (LT)</option>
              <option value="LU">Luxembourg (LU)</option>
              <option value="MO">Macao (MO)</option>
              <option value="MG">Madagascar (MG)</option>
              <option value="MW">Malawi (MW)</option>
              <option value="MY">Malaysia (MY)</option>
              <option value="MV">Maldives (MV)</option>
              <option value="ML">Mali (ML)</option>
              <option value="MT">Malta (MT)</option>
              <option value="MH">Marshall Islands (MH)</option>
              <option value="MQ">Martinique (MQ)</option>
              <option value="MR">Mauritania (MR)</option>
              <option value="MU">Mauritius (MU)</option>
              <option value="YT">Mayotte (YT)</option>
              <option value="MX">Mexico (MX)</option>
              <option value="FM">Micronesia (FM)</option>
              <option value="MD">Moldova (MD)</option>
              <option value="MC">Monaco (MC)</option>
              <option value="MN">Mongolia (MN)</option>
              <option value="ME">Montenegro (ME)</option>
              <option value="MS">Montserrat (MS)</option>
              <option value="MA">Morocco (MA)</option>
              <option value="MZ">Mozambique (MZ)</option>
              <option value="MM">Myanmar (MM)</option>
              <option value="NA">Namibia (NA)</option>
              <option value="NR">Nauru (NR)</option>
              <option value="NP">Nepal (NP)</option>
              <option value="NL">Netherlands (NL)</option>
              <option value="NC">New Caledonia (NC)</option>
              <option value="NZ">New Zealand (NZ)</option>
              <option value="NI">Nicaragua (NI)</option>
              <option value="NE">Niger (NE)</option>
              <option value="NG">Nigeria (NG)</option>
              <option value="MK">North Macedonia (MK)</option>
              <option value="MP">Northern Mariana Islands (MP)</option>
              <option value="NO">Norway (NO)</option>
              <option value="OM">Oman (OM)</option>
              <option value="PK">Pakistan (PK)</option>
              <option value="PW">Palau (PW)</option>
              <option value="PS">Palestine (PS)</option>
              <option value="PA">Panama (PA)</option>
              <option value="PG">Papua New Guinea (PG)</option>
              <option value="PY">Paraguay (PY)</option>
              <option value="PE">Peru (PE)</option>
              <option value="PH">Philippines (PH)</option>
              <option value="PL">Poland (PL)</option>
              <option value="PT">Portugal (PT)</option>
              <option value="PR">Puerto Rico (PR)</option>
              <option value="QA">Qatar (QA)</option>
              <option value="RE">Réunion (RE)</option>
              <option value="RO">Romania (RO)</option>
              <option value="RU">Russia (RU)</option>
              <option value="RW">Rwanda (RW)</option>
              <option value="BL">Saint Barthélemy (BL)</option>
              <option value="KN">Saint Kitts and Nevis (KN)</option>
              <option value="LC">Saint Lucia (LC)</option>
              <option value="MF">Saint Martin (MF)</option>
              <option value="PM">Saint Pierre and Miquelon (PM)</option>
              <option value="VC">Saint Vincent and the Grenadines (VC)</option>
              <option value="WS">Samoa (WS)</option>
              <option value="SM">San Marino (SM)</option>
              <option value="ST">São Tomé and Príncipe (ST)</option>
              <option value="SA">Saudi Arabia (SA)</option>
              <option value="SN">Senegal (SN)</option>
              <option value="RS">Serbia (RS)</option>
              <option value="SC">Seychelles (SC)</option>
              <option value="SL">Sierra Leone (SL)</option>
              <option value="SG">Singapore (SG)</option>
              <option value="SX">Sint Maarten (SX)</option>
              <option value="SK">Slovakia (SK)</option>
              <option value="SI">Slovenia (SI)</option>
              <option value="SB">Solomon Islands (SB)</option>
              <option value="SO">Somalia (SO)</option>
              <option value="ZA">South Africa (ZA)</option>
              <option value="SS">South Sudan (SS)</option>
              <option value="ES">Spain (ES)</option>
              <option value="LK">Sri Lanka (LK)</option>
              <option value="SD">Sudan (SD)</option>
              <option value="SR">Suriname (SR)</option>
              <option value="SE">Sweden (SE)</option>
              <option value="CH">Switzerland (CH)</option>
              <option value="SY">Syria (SY)</option>
              <option value="TW">Taiwan (TW)</option>
              <option value="TJ">Tajikistan (TJ)</option>
              <option value="TZ">Tanzania (TZ)</option>
              <option value="TH">Thailand (TH)</option>
              <option value="TL">Timor-Leste (TL)</option>
              <option value="TG">Togo (TG)</option>
              <option value="TK">Tokelau (TK)</option>
              <option value="TO">Tonga (TO)</option>
              <option value="TT">Trinidad and Tobago (TT)</option>
              <option value="TN">Tunisia (TN)</option>
              <option value="TR">Turkey (TR)</option>
              <option value="TM">Turkmenistan (TM)</option>
              <option value="TC">Turks and Caicos Islands (TC)</option>
              <option value="TV">Tuvalu (TV)</option>
              <option value="UG">Uganda (UG)</option>
              <option value="UA">Ukraine (UA)</option>
              <option value="AE">United Arab Emirates (AE)</option>
              <option value="GB">United Kingdom (GB)</option>
              <option value="US">United States (US)</option>
              <option value="UY">Uruguay (UY)</option>
              <option value="UZ">Uzbekistan (UZ)</option>
              <option value="VU">Vanuatu (VU)</option>
              <option value="VA">Vatican City (VA)</option>
              <option value="VE">Venezuela (VE)</option>
              <option value="VN">Vietnam (VN)</option>
              <option value="VG">Virgin Islands, British (VG)</option>
              <option value="VI">Virgin Islands, U.S. (VI)</option>
              <option value="WF">Wallis and Futuna (WF)</option>
              <option value="YE">Yemen (YE)</option>
              <option value="ZM">Zambia (ZM)</option>
              <option value="ZW">Zimbabwe (ZW)</option>
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
              Prefer this number when multiple are configured for {{ form.country_code }}
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
