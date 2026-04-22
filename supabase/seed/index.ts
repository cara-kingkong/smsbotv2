/**
 * Seed script for local development.
 * Run: tsx supabase/seed/index.ts
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment or .env
 */
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------------------
// Fixed UUIDs for deterministic testing
// ---------------------------------------------------------------------------

const IDS = {
  workspace: '10000000-0000-0000-0000-000000000001',
  twilioIntegration: '20000000-0000-0000-0000-000000000001',
  openaiIntegration: '20000000-0000-0000-0000-000000000002',
  campaign: '30000000-0000-0000-0000-000000000001',
  agentA: '40000000-0000-0000-0000-000000000001',
  agentB: '40000000-0000-0000-0000-000000000002',
  agentVersionA: '50000000-0000-0000-0000-000000000001',
  agentVersionB: '50000000-0000-0000-0000-000000000002',
  lead: '60000000-0000-0000-0000-000000000001',
  conversation: '70000000-0000-0000-0000-000000000001',
  messageOutbound1: '80000000-0000-0000-0000-000000000001',
  messageInbound1: '80000000-0000-0000-0000-000000000002',
  messageOutbound2: '80000000-0000-0000-0000-000000000003',
  eventCreated: '90000000-0000-0000-0000-000000000001',
  eventAiReply: '90000000-0000-0000-0000-000000000002',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function deleteFrom(table: string, filter?: { column: string; value: string }) {
  if (filter) {
    const { error } = await supabase.from(table).delete().eq(filter.column, filter.value);
    if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
  } else {
    // For tables without a workspace filter, delete by known IDs
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  console.log('Starting seed...\n');

  // ── Step 0: Clear existing seed data (reverse FK order) ──────────────
  console.log('Clearing existing seed data...');

  const workspaceFilter = { column: 'workspace_id', value: IDS.workspace };
  const conversationFilter = { column: 'conversation_id', value: IDS.conversation };

  // Delete in reverse dependency order
  await deleteFrom('conversation_events', conversationFilter);
  await deleteFrom('messages', conversationFilter);
  await deleteFrom('ai_decisions', workspaceFilter);
  await deleteFrom('crm_events', workspaceFilter);
  await deleteFrom('conversations', workspaceFilter);
  await deleteFrom('leads', workspaceFilter);
  await deleteFrom('agent_versions', { column: 'agent_id', value: IDS.agentA });
  await deleteFrom('agent_versions', { column: 'agent_id', value: IDS.agentB });
  await deleteFrom('agent_calendars', { column: 'agent_id', value: IDS.agentA });
  await deleteFrom('agent_calendars', { column: 'agent_id', value: IDS.agentB });
  await deleteFrom('agents', { column: 'campaign_id', value: IDS.campaign });
  await deleteFrom('calendars', workspaceFilter);
  await deleteFrom('campaigns', workspaceFilter);
  await deleteFrom('integrations', workspaceFilter);
  await deleteFrom('webhook_receipts', workspaceFilter);
  await deleteFrom('activity_logs', workspaceFilter);

  // Delete the workspace itself
  const { error: wsDelErr } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', IDS.workspace);
  if (wsDelErr) throw new Error(`Failed to clear workspaces: ${wsDelErr.message}`);

  console.log('  Cleared.\n');

  // ── Step 1: Workspace ────────────────────────────────────────────────
  console.log('Creating workspace...');
  const { error: wsErr } = await supabase.from('workspaces').insert({
    id: IDS.workspace,
    name: 'Demo Agency',
    slug: 'demo-agency',
    status: 'active',
  });
  if (wsErr) throw new Error(`Workspace insert failed: ${wsErr.message}`);
  console.log(`  Workspace: ${IDS.workspace}`);

  // ── Step 2: Integrations ─────────────────────────────────────────────
  console.log('Creating integrations...');
  const { error: intErr } = await supabase.from('integrations').insert([
    {
      id: IDS.twilioIntegration,
      workspace_id: IDS.workspace,
      type: 'sms',
      provider: 'twilio',
      name: 'Twilio SMS',
      status: 'active',
      config_json: {},
    },
    {
      id: IDS.openaiIntegration,
      workspace_id: IDS.workspace,
      type: 'ai_provider',
      provider: 'openai',
      name: 'OpenAI GPT-4o',
      status: 'active',
      config_json: {},
    },
  ]);
  if (intErr) throw new Error(`Integrations insert failed: ${intErr.message}`);
  console.log(`  Twilio:  ${IDS.twilioIntegration}`);
  console.log(`  OpenAI:  ${IDS.openaiIntegration}`);

  // ── Step 3: Campaign ─────────────────────────────────────────────────
  console.log('Creating campaign...');
  const { error: campErr } = await supabase.from('campaigns').insert({
    id: IDS.campaign,
    workspace_id: IDS.workspace,
    name: 'Lead Qualification',
    status: 'active',
    business_hours_json: {
      timezone: 'America/New_York',
      schedule: [
        { day: 1, start: '09:00', end: '17:00' },
        { day: 2, start: '09:00', end: '17:00' },
        { day: 3, start: '09:00', end: '17:00' },
        { day: 4, start: '09:00', end: '17:00' },
        { day: 5, start: '09:00', end: '17:00' },
      ],
    },
    stop_conditions_json: {
      max_messages: 10,
      max_days: 14,
      max_no_reply_hours: 72,
    },
  });
  if (campErr) throw new Error(`Campaign insert failed: ${campErr.message}`);
  console.log(`  Campaign: ${IDS.campaign}`);

  // ── Step 4: Agents ───────────────────────────────────────────────────
  console.log('Creating agents...');
  const { error: agentErr } = await supabase.from('agents').insert([
    {
      id: IDS.agentA,
      campaign_id: IDS.campaign,
      name: 'Friendly Qualifier',
      status: 'active',
      ai_provider_integration_id: IDS.openaiIntegration,
      weight: 70,
    },
    {
      id: IDS.agentB,
      campaign_id: IDS.campaign,
      name: 'Direct Qualifier',
      status: 'active',
      ai_provider_integration_id: IDS.openaiIntegration,
      weight: 30,
    },
  ]);
  if (agentErr) throw new Error(`Agents insert failed: ${agentErr.message}`);
  console.log(`  Agent A (Friendly, w=70): ${IDS.agentA}`);
  console.log(`  Agent B (Direct, w=30):   ${IDS.agentB}`);

  // ── Step 5: Agent Versions ───────────────────────────────────────────
  console.log('Creating agent versions...');
  const { error: verErr } = await supabase.from('agent_versions').insert([
    {
      id: IDS.agentVersionA,
      agent_id: IDS.agentA,
      version_number: 1,
      prompt_text: [
        'You are a friendly and warm SMS assistant for a home services company.',
        'Your goal is to qualify incoming leads for a free consultation.',
        '',
        'Guidelines:',
        '- Always greet the lead by first name',
        '- Be conversational, use casual language and light humor when appropriate',
        '- Ask about their specific needs before suggesting a booking',
        '- Gather: type of service needed, timeline, budget range, property type',
        '- If qualified (needs service within 30 days, has budget), suggest booking a free consultation',
        '- If not qualified, thank them and offer to follow up later',
        '- Keep messages under 300 characters for SMS',
        '- Never pressure the lead; let the conversation flow naturally',
        '- If they ask to stop, immediately acknowledge and end the conversation',
      ].join('\n'),
      system_rules_json: {
        max_message_length: 300,
        always_greet_by_name: true,
        required_qualification_fields: ['service_type', 'timeline', 'budget_range'],
        tone: 'friendly_casual',
      },
      reply_cadence_json: {
        reply_delay_seconds: 30,
        followup_delay_seconds: 3600,
        max_followups: 5,
      },
      config_json: {},
      is_active: true,
    },
    {
      id: IDS.agentVersionB,
      agent_id: IDS.agentB,
      version_number: 1,
      prompt_text: [
        'You are a professional SMS assistant for a home services company.',
        'Your objective is to efficiently qualify leads and book consultations.',
        '',
        'Protocol:',
        '1. Introduce yourself and state the purpose of the outreach',
        '2. Ask directly about the service they need and their preferred timeline',
        '3. Confirm budget expectations align with our service range',
        '4. If qualified, present available consultation slots immediately',
        '5. If not qualified, politely close the conversation',
        '',
        'Rules:',
        '- Be concise and professional; avoid small talk',
        '- Each message should advance the qualification process',
        '- Use proper grammar and complete sentences',
        '- Maximum 280 characters per message',
        '- Respect opt-out requests immediately',
      ].join('\n'),
      system_rules_json: {
        max_message_length: 280,
        always_greet_by_name: true,
        required_qualification_fields: ['service_type', 'timeline', 'budget_range'],
        tone: 'professional_direct',
      },
      reply_cadence_json: {
        reply_delay_seconds: 15,
        followup_delay_seconds: 1800,
        max_followups: 3,
      },
      config_json: {},
      is_active: true,
    },
  ]);
  if (verErr) throw new Error(`Agent versions insert failed: ${verErr.message}`);
  console.log(`  Version A (v1): ${IDS.agentVersionA}`);
  console.log(`  Version B (v1): ${IDS.agentVersionB}`);

  // ── Step 6: Lead ─────────────────────────────────────────────────────
  console.log('Creating lead...');
  const { error: leadErr } = await supabase.from('leads').insert({
    id: IDS.lead,
    workspace_id: IDS.workspace,
    first_name: 'Jane',
    last_name: 'Smith',
    phone_e164: '+15551234567',
    email: 'jane@example.com',
    timezone: 'America/Chicago',
    status: 'active',
  });
  if (leadErr) throw new Error(`Lead insert failed: ${leadErr.message}`);
  console.log(`  Lead: ${IDS.lead}`);

  // ── Step 7: Conversation ─────────────────────────────────────────────
  console.log('Creating conversation...');
  const { error: convErr } = await supabase.from('conversations').insert({
    id: IDS.conversation,
    workspace_id: IDS.workspace,
    campaign_id: IDS.campaign,
    agent_id: IDS.agentA,
    agent_version_id: IDS.agentVersionA,
    lead_id: IDS.lead,
    status: 'active',
  });
  if (convErr) throw new Error(`Conversation insert failed: ${convErr.message}`);
  console.log(`  Conversation: ${IDS.conversation}`);

  // ── Step 8: Messages ─────────────────────────────────────────────────
  console.log('Creating messages...');
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const threeMinAgo = new Date(now.getTime() - 3 * 60 * 1000);
  const oneMinAgo = new Date(now.getTime() - 1 * 60 * 1000);

  const { error: msgErr } = await supabase.from('messages').insert([
    {
      id: IDS.messageOutbound1,
      conversation_id: IDS.conversation,
      direction: 'outbound',
      sender_type: 'ai',
      body_text:
        'Hi Jane! This is Sarah from HomeServ. We got your inquiry about home services. What kind of project are you looking into? We\'d love to help!',
      provider_message_id: 'SM_seed_001',
      provider_status: 'delivered',
      sent_at: fiveMinAgo.toISOString(),
      created_at: fiveMinAgo.toISOString(),
    },
    {
      id: IDS.messageInbound1,
      conversation_id: IDS.conversation,
      direction: 'inbound',
      sender_type: 'lead',
      body_text:
        'Hey! Yeah I need some plumbing work done. Kitchen faucet is leaking and I think we need a new water heater too.',
      provider_message_id: 'SM_seed_002',
      provider_status: 'received',
      received_at: threeMinAgo.toISOString(),
      created_at: threeMinAgo.toISOString(),
    },
    {
      id: IDS.messageOutbound2,
      conversation_id: IDS.conversation,
      direction: 'outbound',
      sender_type: 'ai',
      body_text:
        'Oh nice, we can definitely help with both! A leaky faucet and water heater replacement are right in our wheelhouse. How soon are you looking to get this done?',
      provider_message_id: 'SM_seed_003',
      provider_status: 'delivered',
      sent_at: oneMinAgo.toISOString(),
      created_at: oneMinAgo.toISOString(),
    },
  ]);
  if (msgErr) throw new Error(`Messages insert failed: ${msgErr.message}`);
  console.log(`  Message 1 (AI greeting):    ${IDS.messageOutbound1}`);
  console.log(`  Message 2 (Lead reply):      ${IDS.messageInbound1}`);
  console.log(`  Message 3 (AI followup):     ${IDS.messageOutbound2}`);

  // ── Step 9: Conversation Events ──────────────────────────────────────
  console.log('Creating conversation events...');
  const { error: evtErr } = await supabase.from('conversation_events').insert([
    {
      id: IDS.eventCreated,
      conversation_id: IDS.conversation,
      event_type: 'created',
      event_payload_json: {
        campaign_id: IDS.campaign,
        agent_id: IDS.agentA,
        lead_id: IDS.lead,
        trigger: 'new_lead_import',
      },
      created_at: fiveMinAgo.toISOString(),
    },
    {
      id: IDS.eventAiReply,
      conversation_id: IDS.conversation,
      event_type: 'ai_reply_generated',
      event_payload_json: {
        message_id: IDS.messageOutbound1,
        agent_version_id: IDS.agentVersionA,
        model: 'gpt-4o',
        latency_ms: 1240,
        tokens_used: 87,
      },
      created_at: fiveMinAgo.toISOString(),
    },
  ]);
  if (evtErr) throw new Error(`Conversation events insert failed: ${evtErr.message}`);
  console.log(`  Event (created):            ${IDS.eventCreated}`);
  console.log(`  Event (ai_reply_generated): ${IDS.eventAiReply}`);

  // ── Done ─────────────────────────────────────────────────────────────
  console.log('\nSeed complete! All data inserted successfully.');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nSeed failed:', err);
    process.exit(1);
  });
