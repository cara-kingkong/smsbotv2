/**
 * Seed script for local development.
 * Run: npm run db:seed
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function seed() {
  console.log('Seeding database...');

  // 1. Create a demo workspace
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .upsert({ name: 'Demo Workspace', slug: 'demo', status: 'active' }, { onConflict: 'slug' })
    .select()
    .single();

  if (wsError) throw wsError;
  console.log('Workspace:', workspace.id);

  // 2. Create a demo campaign
  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .insert({
      workspace_id: workspace.id,
      name: 'Lead Qualification Demo',
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
        max_messages: 50,
        max_days: 14,
        max_no_reply_hours: 72,
      },
    })
    .select()
    .single();

  if (campError) throw campError;
  console.log('Campaign:', campaign.id);

  // 3. Create two agents for split testing
  const agentConfigs = [
    { name: 'Friendly Agent', weight: 50 },
    { name: 'Direct Agent', weight: 50 },
  ];

  for (const cfg of agentConfigs) {
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .insert({
        campaign_id: campaign.id,
        name: cfg.name,
        status: 'active',
        weight: cfg.weight,
      })
      .select()
      .single();

    if (agentError) throw agentError;
    console.log(`Agent ${cfg.name}:`, agent.id);

    // Create initial version
    const { error: versionError } = await supabase.from('agent_versions').insert({
      agent_id: agent.id,
      version_number: 1,
      prompt_text:
        cfg.name === 'Friendly Agent'
          ? 'You are a friendly, warm SMS assistant helping qualify leads for a consultation. Be conversational and helpful. Ask about their needs before suggesting a booking.'
          : 'You are a direct, efficient SMS assistant. Quickly assess if the lead is qualified and guide them toward booking if appropriate. Be professional and concise.',
      system_rules_json: {
        max_message_length: 300,
        always_greet_by_name: true,
      },
      reply_cadence_json: {
        initial_delay_seconds: 30,
        followup_delay_seconds: 3600,
        max_followups: 5,
      },
      is_active: true,
    });

    if (versionError) throw versionError;
  }

  console.log('Seed complete.');
}

seed().catch(console.error);
