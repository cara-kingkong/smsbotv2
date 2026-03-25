import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CRMService } from '../../src/lib/crm/service';
import { KeapAdapter } from '../../src/lib/crm/adapters/keap';
import type { CRMAdapter } from '../../src/lib/types';

/**
 * Background function: Process pending CRM sync events.
 */
export default async (req: Request, _context: Context) => {
  const db = getServiceClient();

  try {
    const { crm_event_id, provider } = await req.json() as {
      crm_event_id: string;
      provider: string;
    };

    const adapters = new Map<string, CRMAdapter>();
    if (process.env.KEAP_API_KEY) {
      adapters.set('keap', new KeapAdapter(process.env.KEAP_API_KEY));
    }

    const crmService = new CRMService(db, adapters);
    await crmService.processCRMEvent(crm_event_id, provider);

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('process-crm-sync-background error:', err);
    return new Response('Error', { status: 500 });
  }
};
