import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { LeadService } from '../../src/lib/leads/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Create or upsert a lead within a workspace.
 * POST /.netlify/functions/api-leads-create
 *
 * Body: { workspace_id, phone, first_name, last_name?, email?, timezone?, external_contact_id?, source_metadata? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { workspace_id, phone, first_name, last_name, email, timezone, external_contact_id, source_metadata } = body;

    if (!workspace_id || !phone || !first_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: workspace_id, phone, first_name' }),
        { status: 400 },
      );
    }

    const access = await requireWorkspaceAccess(req, workspace_id);
    if (access instanceof Response) return access;

    const leadService = new LeadService(db);
    const lead = await leadService.upsertByPhone({
      workspace_id: access.workspace.id,
      phone,
      first_name,
      last_name,
      email,
      timezone,
      external_contact_id,
      source_json: source_metadata,
    });

    return new Response(JSON.stringify(lead), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-leads-create error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';

    // Surface phone validation errors as 400
    if (message.includes('Invalid phone number')) {
      return new Response(JSON.stringify({ error: message }), { status: 400 });
    }

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
