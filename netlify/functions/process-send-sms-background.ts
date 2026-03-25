import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { MessagingService } from '../../src/lib/messaging/service';
import { TwilioAdapter } from '../../src/lib/messaging/adapters/twilio';
import { SenderType } from '../../src/lib/types';

/**
 * Background function: Send a queued SMS message.
 * Handles delayed sends and business-hours-deferred messages.
 */
export default async (req: Request, _context: Context) => {
  const db = getServiceClient();

  try {
    const { conversation_id, body_text, to, sender_type } = await req.json() as {
      conversation_id: string;
      body_text: string;
      to: string;
      sender_type: string;
    };

    const twilioAdapter = new TwilioAdapter(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
    );

    const messagingService = new MessagingService(db, twilioAdapter);

    await messagingService.sendOutbound({
      conversation_id,
      to,
      from: process.env.TWILIO_PHONE_NUMBER!,
      body_text,
      sender_type: sender_type as SenderType,
    });

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('process-send-sms-background error:', err);
    return new Response('Error', { status: 500 });
  }
};
