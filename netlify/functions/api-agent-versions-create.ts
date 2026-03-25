import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { AgentService } from '../../src/lib/agents/service';

/**
 * Create a new version for an agent.
 * POST /.netlify/functions/api-agent-versions-create
 *
 * Body: { agent_id, prompt_text, system_rules_json?, reply_cadence_json?, config_json? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { agent_id, prompt_text, system_rules_json, reply_cadence_json, config_json } = body;

    if (!agent_id || !prompt_text) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: agent_id, prompt_text' }),
        { status: 400 },
      );
    }

    // Validate agent exists
    const { data: agent, error: agentError } = await db
      .from('agents')
      .select('id')
      .eq('id', agent_id)
      .single();

    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404 });
    }

    const agentService = new AgentService(db);
    const version = await agentService.createVersion({
      agent_id,
      prompt_text,
      system_rules_json,
      reply_cadence_json,
      config_json,
    });

    return new Response(JSON.stringify(version), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-agent-versions-create error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
