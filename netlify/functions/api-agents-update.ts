import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';

/**
 * Update an agent.
 * PUT /.netlify/functions/api-agents-update
 *
 * Body: { agent_id, name?, weight?, status? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { agent_id, name, weight, status } = body;

    if (!agent_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: agent_id' }),
        { status: 400 },
      );
    }

    // Build update payload with only provided fields
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (weight !== undefined) updates.weight = weight;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ error: 'No fields to update. Provide at least one of: name, weight, status' }),
        { status: 400 },
      );
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('agents')
      .update(updates)
      .eq('id', agent_id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update agent: ${error.message}`);

    if (!data) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404 });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-agents-update error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
