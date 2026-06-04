import type { Context } from '@netlify/functions';
import { CRMService } from '../../src/lib/crm/service';
import { KeapAdapter } from '../../src/lib/crm/adapters/keap';
import type { CRMAdapter } from '../../src/lib/types';
import { runQueueJob } from '../../src/lib/queues/job-runner';

interface ProcessCRMSyncPayload {
  crm_event_id: string;
  provider: string;
  job_id?: string;
  worker_id?: string;
  lease_seconds?: number;
}

/**
 * Background function: Process pending CRM sync events.
 *
 * Resolves the workspace's CRM integration via the event's `integration_id`
 * and builds the adapter from `config_json.api_key`. Workspaces own their
 * own credentials — no env-var fallback.
 */
export default async (req: Request, _context: Context) =>
  runQueueJob<ProcessCRMSyncPayload>(req, 'process-crm-sync-background', async (payload, context) => {
    const { db } = context;

    // Resolve the integration via the event so we read the right workspace's
    // credentials, even when multiple workspaces use the same provider.
    const { data: event } = await db
      .from('crm_events')
      .select('integration_id')
      .eq('id', payload.crm_event_id)
      .single();

    if (!event) {
      return new Response('Skipped — event not found', { status: 200 });
    }

    const { data: integration } = await db
      .from('integrations')
      .select('id, provider, config_json, status')
      .eq('id', event.integration_id)
      .single();

    if (!integration) {
      throw new Error(`CRM integration ${event.integration_id} not found for event ${payload.crm_event_id}`);
    }

    const config = (integration.config_json ?? {}) as Record<string, unknown>;
    const adapters = new Map<string, CRMAdapter>();

    if (integration.provider === 'keap') {
      const apiKey = typeof config.api_key === 'string' ? config.api_key.trim() : '';
      if (!apiKey) {
        throw new Error(
          `Keap integration ${integration.id} has no api_key in config_json. Add the key in workspace settings.`,
        );
      }
      adapters.set('keap', new KeapAdapter(apiKey));
    } else {
      throw new Error(`Unsupported CRM provider: ${integration.provider}`);
    }

    const crmService = new CRMService(db, adapters);
    await context.heartbeat();
    await crmService.processCRMEvent(payload.crm_event_id, payload.provider);

    return new Response('OK', { status: 200 });
  });
