import { computeOnboardingState } from '../../src/lib/onboarding/service';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get('workspace_id');

  if (!workspaceId) {
    return new Response(JSON.stringify({ error: 'workspace_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const state = await computeOnboardingState(workspaceId);
  return new Response(JSON.stringify(state), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
