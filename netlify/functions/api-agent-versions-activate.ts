import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { AgentService } from '../../src/lib/agents/service';

/**
 * Activate a specific version for an agent.
 * POST /.netlify/functions/api-agent-versions-activate
 *
 * Body: { agent_id, version_id }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { agent_id, version_id } = body;

    if (!agent_id || !version_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: agent_id, version_id' }),
        { status: 400 },
      );
    }

    const agentService = new AgentService(db);
    const version = await agentService.activateVersion(agent_id, version_id);

    return new Response(JSON.stringify(version), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-agent-versions-activate error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
