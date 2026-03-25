import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { AgentService } from '../../src/lib/agents/service';

/**
 * Create an agent within a campaign.
 * POST /.netlify/functions/api-agents-create
 *
 * Body: { campaign_id, name, weight?, ai_provider_integration_id? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { campaign_id, name, weight, ai_provider_integration_id } = body;

    if (!campaign_id || !name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: campaign_id, name' }),
        { status: 400 },
      );
    }

    // Validate campaign exists
    const { data: campaign, error: campError } = await db
      .from('campaigns')
      .select('id')
      .eq('id', campaign_id)
      .single();

    if (campError || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404 });
    }

    const agentService = new AgentService(db);
    const agent = await agentService.create({
      campaign_id,
      name,
      weight,
      ai_provider_integration_id,
    });

    return new Response(JSON.stringify(agent), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-agents-create error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
