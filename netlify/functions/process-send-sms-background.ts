import type { Context } from '@netlify/functions';
import { ConversationService } from '../../src/lib/conversations/service';
import { MessagingService } from '../../src/lib/messaging/service';
import { TwilioAdapter } from '../../src/lib/messaging/adapters/twilio';
import { runQueueJob } from '../../src/lib/queues/job-runner';

interface ProcessSendSmsPayload {
  message_id: string;
  conversation_id: string;
  to: string;
  from: string;
  job_id?: string;
  worker_id?: string;
  lease_seconds?: number;
}

/**
 * Background function: Send a queued SMS message.
 */
export default async (req: Request, _context: Context) =>
  runQueueJob<ProcessSendSmsPayload>(req, 'process-send-sms-background', async (payload, context) => {
    const conversationService = new ConversationService(context.db);
    const conversation = await conversationService.getById(payload.conversation_id);
    if (!conversation) return new Response('Skipped', { status: 200 });

    const twilioAdapter = new TwilioAdapter(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
    );
    const messagingService = new MessagingService(context.db, twilioAdapter);

    await context.heartbeat();
    await messagingService.dispatchQueuedOutbound({
      message_id: payload.message_id,
      to: payload.to,
      from: payload.from,
    });

    return new Response('OK', { status: 200 });
  });
