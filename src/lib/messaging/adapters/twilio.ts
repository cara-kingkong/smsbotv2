import Twilio from 'twilio';
import type { SMSAdapter, SendMessageInput, SendMessageResult, InboundMessagePayload } from '@lib/types';

export class TwilioAdapter implements SMSAdapter {
  private client: ReturnType<typeof Twilio>;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
  ) {
    this.client = Twilio(accountSid, authToken);
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const message = await this.client.messages.create({
      to: input.to,
      from: input.from,
      body: input.body,
      statusCallback: `${process.env.PUBLIC_SITE_URL}/.netlify/functions/webhook-twilio-status`,
    });

    return {
      provider_message_id: message.sid,
      status: message.status,
      raw_response: {
        sid: message.sid,
        status: message.status,
        dateCreated: message.dateCreated,
      },
    };
  }

  parseInboundWebhook(body: Record<string, unknown>): InboundMessagePayload {
    return {
      from: body.From as string,
      to: body.To as string,
      body: body.Body as string,
      provider_message_id: body.MessageSid as string,
      raw_payload: body,
    };
  }

  validateWebhookSignature(requestUrl: string, headers: Headers, body: Record<string, string>): boolean {
    const { validateRequest } = Twilio;
    const signature = headers.get('x-twilio-signature') || '';
    return validateRequest(this.authToken, signature, requestUrl, body);
  }

  async getDeliveryStatus(providerMessageId: string): Promise<string> {
    const message = await this.client.messages(providerMessageId).fetch();
    return message.status;
  }
}
