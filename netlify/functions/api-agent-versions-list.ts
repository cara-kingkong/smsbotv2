import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';

/**
 * List versions for an agent.
 * GET /.netlify/functions/api-agent-versions-list?agent_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get('agent_id');

    if (!agentId) {
      return new Response(JSON.stringify({ error: 'agent_id is required' }), { status: 400 });
    }

    const { data, error } = await db
      .from('agent_versions')
      .select('*')
      .eq('agent_id', agentId)
      .order('version_number', { ascending: false });

    if (error) throw new Error(`Failed to list agent versions: ${error.message}`);

    return new Response(JSON.stringify(data ?? []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-agent-versions-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
