import type { SupabaseClient } from '@supabase/supabase-js';
import type { Message, SMSAdapter } from '@lib/types';
import { MessageDirection, SenderType } from '@lib/types';

export interface QueueOutboundInput {
  conversation_id: string;
  body_text: string;
  sender_type: SenderType;
  delay_seconds?: number;
}

export class MessagingService {
  constructor(
    private readonly db: SupabaseClient,
    private readonly smsAdapter: SMSAdapter,
  ) {}

  async sendOutbound(input: {
    conversation_id: string;
    to: string;
    from: string;
    body_text: string;
    sender_type: SenderType;
  }): Promise<Message> {
    // Persist message record first
    const { data: message, error: insertError } = await this.db
      .from('messages')
      .insert({
        conversation_id: input.conversation_id,
        direction: MessageDirection.Outbound,
        sender_type: input.sender_type,
        body_text: input.body_text,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw new Error(`Failed to persist message: ${insertError.message}`);

    // Send via provider
    try {
      const result = await this.smsAdapter.sendMessage({
        to: input.to,
        from: input.from,
        body: input.body_text,
        conversation_id: input.conversation_id,
      });

      // Update with provider response
      await this.db
        .from('messages')
        .update({
          provider_message_id: result.provider_message_id,
          provider_status: result.status,
        })
        .eq('id', message.id);

      return { ...message, provider_message_id: result.provider_message_id, provider_status: result.status };
    } catch (err) {
      // Log failure but don't lose the message record
      await this.db
        .from('messages')
        .update({
          provider_status: 'failed',
          error_json: { error: err instanceof Error ? err.message : 'Unknown error' },
        })
        .eq('id', message.id);

      throw err;
    }
  }

  async recordInbound(input: {
    conversation_id: string;
    body_text: string;
    provider_message_id: string;
  }): Promise<Message> {
    const { data, error } = await this.db
      .from('messages')
      .insert({
        conversation_id: input.conversation_id,
        direction: MessageDirection.Inbound,
        sender_type: SenderType.Lead,
        body_text: input.body_text,
        provider_message_id: input.provider_message_id,
        received_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to record inbound message: ${error.message}`);

    // Update conversation last_activity_at
    await this.db
      .from('conversations')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', input.conversation_id);

    return data;
  }

  async getHistory(conversationId: string): Promise<Message[]> {
    const { data, error } = await this.db
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to get message history: ${error.message}`);
    return data ?? [];
  }
}
