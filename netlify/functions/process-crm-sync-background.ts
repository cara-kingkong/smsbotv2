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
 */
export default async (req: Request, _context: Context) =>
  runQueueJob<ProcessCRMSyncPayload>(req, 'process-crm-sync-background', async (payload, context) => {
    const adapters = new Map<string, CRMAdapter>();
    if (process.env.KEAP_API_KEY) {
      adapters.set('keap', new KeapAdapter(process.env.KEAP_API_KEY));
    }

    const crmService = new CRMService(context.db, adapters);
    await context.heartbeat();
    await crmService.processCRMEvent(payload.crm_event_id, payload.provider);

    return new Response('OK', { status: 200 });
  });
