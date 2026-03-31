import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { TwilioAdapter } from '../../src/lib/messaging/adapters/twilio';

/**
 * Twilio delivery status callback.
 * POST /.netlify/functions/webhook-twilio-status
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const db = getServiceClient();
  const twilioAdapter = new TwilioAdapter(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  );

  try {
    const bodyText = await req.text();
    const body = Object.fromEntries(new URLSearchParams(bodyText)) as Record<string, string>;

    const publicUrl = resolvePublicUrl(req);
    const isValid = twilioAdapter.validateWebhookSignature(publicUrl, req.headers, body);
    if (!isValid) {
      return new Response('Unauthorized', { status: 401 });
    }

    const messageSid = body.MessageSid as string;
    const messageStatus = body.MessageStatus as string;

    if (!messageSid) {
      return new Response('Missing MessageSid', { status: 400 });
    }

    // Update message delivery status
    await db
      .from('messages')
      .update({ provider_status: messageStatus })
      .eq('provider_message_id', messageSid);

    // If delivery failed, log error
    if (messageStatus === 'failed' || messageStatus === 'undelivered') {
      await db
        .from('messages')
        .update({
          error_json: {
            status: messageStatus,
            error_code: body.ErrorCode,
            error_message: body.ErrorMessage,
          },
        })
        .eq('provider_message_id', messageSid);
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('webhook-twilio-status error:', err);
    return new Response('Internal error', { status: 500 });
  }
};

function resolvePublicUrl(req: Request): string {
  const url = new URL(req.url);
  const forwardedHost = req.headers.get('x-forwarded-host') || url.host;
  const forwardedProto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');

  return `${forwardedProto}://${forwardedHost}${url.pathname}${url.search}`;
}
