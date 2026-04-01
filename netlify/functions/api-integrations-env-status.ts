import type { Context } from '@netlify/functions';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Returns which provider environment variables are configured on the server.
 * Only reports boolean presence — never exposes actual values.
 *
 * GET /.netlify/functions/api-integrations-env-status?workspace_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    const status = {
      twilio: {
        account_sid: !!process.env.TWILIO_ACCOUNT_SID,
        auth_token: !!process.env.TWILIO_AUTH_TOKEN,
        phone_number: !!process.env.TWILIO_PHONE_NUMBER,
        configured: !!(
          process.env.TWILIO_ACCOUNT_SID
          && process.env.TWILIO_AUTH_TOKEN
          && process.env.TWILIO_PHONE_NUMBER
        ),
      },
    };

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-integrations-env-status error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
