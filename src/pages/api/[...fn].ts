import type { APIRoute } from 'astro';

/**
 * Catch-all Astro API route that delegates to Netlify function handlers.
 * Maps /api/<function-name> → netlify/functions/<function-name>.ts
 *
 * This allows the same function logic to work in both:
 * - `astro dev` (local development)
 * - `netlify dev` / production (Netlify Functions runtime)
 */

// Statically import all function handlers so Vite can resolve them
const handlers: Record<string, (req: Request, ctx: unknown) => Promise<Response>> = {
  'api-campaigns-list': (await import('../../../netlify/functions/api-campaigns-list')).default,
  'api-campaigns-create': (await import('../../../netlify/functions/api-campaigns-create')).default,
  'api-campaigns-get': (await import('../../../netlify/functions/api-campaigns-get')).default,
  'api-campaigns-update': (await import('../../../netlify/functions/api-campaigns-update')).default,
  'api-leads-list': (await import('../../../netlify/functions/api-leads-list')).default,
  'api-leads-create': (await import('../../../netlify/functions/api-leads-create')).default,
  'api-agents-list': (await import('../../../netlify/functions/api-agents-list')).default,
  'api-agents-workspace-list': (await import('../../../netlify/functions/api-agents-workspace-list')).default,
  'api-agents-create': (await import('../../../netlify/functions/api-agents-create')).default,
  'api-agents-update': (await import('../../../netlify/functions/api-agents-update')).default,
  'api-agent-versions-list': (await import('../../../netlify/functions/api-agent-versions-list')).default,
  'api-agent-versions-create': (await import('../../../netlify/functions/api-agent-versions-create')).default,
  'api-agent-versions-activate': (await import('../../../netlify/functions/api-agent-versions-activate')).default,
  'api-inbox-list': (await import('../../../netlify/functions/api-inbox-list')).default,
  'api-inbox-messages': (await import('../../../netlify/functions/api-inbox-messages')).default,
  'api-inbox-reply': (await import('../../../netlify/functions/api-inbox-reply')).default,
  'api-inbox-takeover': (await import('../../../netlify/functions/api-inbox-takeover')).default,
  'api-inbox-release': (await import('../../../netlify/functions/api-inbox-release')).default,
  'api-dashboard-stats': (await import('../../../netlify/functions/api-dashboard-stats')).default,
  'api-jobs-list': (await import('../../../netlify/functions/api-jobs-list')).default,
  'api-jobs-retry': (await import('../../../netlify/functions/api-jobs-retry')).default,
  'api-activity-list': (await import('../../../netlify/functions/api-activity-list')).default,
  'api-webhooks-list': (await import('../../../netlify/functions/api-webhooks-list')).default,
  'api-integrations-list': (await import('../../../netlify/functions/api-integrations-list')).default,
  'api-integrations-upsert': (await import('../../../netlify/functions/api-integrations-upsert')).default,
  'api-reporting-campaign': (await import('../../../netlify/functions/api-reporting-campaign')).default,
  'api-reporting-workspace': (await import('../../../netlify/functions/api-reporting-workspace')).default,
  'api-workspace-settings-get': (await import('../../../netlify/functions/api-workspace-settings-get')).default,
  'api-workspace-settings-update': (await import('../../../netlify/functions/api-workspace-settings-update')).default,
};

const handle: APIRoute = async ({ params, request }) => {
  const fnName = params.fn;

  if (!fnName || !handlers[fnName]) {
    return new Response(JSON.stringify({ error: `Unknown API function: ${fnName}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    return await handlers[fnName](request, {});
  } catch (err) {
    console.error(`API route error [${fnName}]:`, err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Support all HTTP methods
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
