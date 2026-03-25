import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { IntegrationService } from '../../src/lib/integrations/service';

const VALID_TYPES = ['crm', 'calendar', 'sms', 'ai_provider'];
const VALID_PROVIDERS = ['twilio', 'calendly', 'keap', 'openai', 'anthropic'];

/**
 * Create or update an integration for a workspace.
 * POST /.netlify/functions/api-integrations-upsert
 *
 * Body: { workspace_id, type, provider, name, config_json }
 *
 * If an integration for this workspace+provider already exists, it is updated.
 * Otherwise a new integration is created.
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { workspace_id, type, provider, name, config_json } = body;

    if (!workspace_id || !type || !provider || !name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: workspace_id, type, provider, name' }),
        { status: 400 },
      );
    }

    if (!VALID_TYPES.includes(type)) {
      return new Response(
        JSON.stringify({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }),
        { status: 400 },
      );
    }

    if (!VALID_PROVIDERS.includes(provider)) {
      return new Response(
        JSON.stringify({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` }),
        { status: 400 },
      );
    }

    // Validate workspace exists
    const { data: workspace, error: wsError } = await db
      .from('workspaces')
      .select('id')
      .eq('id', workspace_id)
      .single();

    if (wsError || !workspace) {
      return new Response(JSON.stringify({ error: 'Workspace not found' }), { status: 404 });
    }

    const service = new IntegrationService(db);

    // Check if integration for this workspace+provider already exists
    const existing = await service.listByWorkspace(workspace_id);
    const match = existing.find((i) => i.provider === provider);

    if (match) {
      // Update existing integration
      const updated = await service.update(match.id, {
        name,
        config_json: config_json ?? {},
      });

      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create new integration
    const created = await service.create({
      workspace_id,
      type,
      provider,
      name,
      config_json: config_json ?? {},
    });

    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-integrations-upsert error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
