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

  async queueOutbound(input: {
    conversation_id: string;
    body_text: string;
    sender_type: SenderType;
    source_job_id?: string;
  }): Promise<Message> {
    if (input.source_job_id) {
      const { data: existing } = await this.db
        .from('messages')
        .select('*')
        .eq('source_job_id', input.source_job_id)
        .single();

      if (existing) return existing;
    }

    const { data: message, error: insertError } = await this.db
      .from('messages')
      .insert({
        conversation_id: input.conversation_id,
        source_job_id: input.source_job_id ?? null,
        direction: MessageDirection.Outbound,
        sender_type: input.sender_type,
        body_text: input.body_text,
        provider_status: 'queued',
      })
      .select()
      .single();

    if (insertError) throw new Error(`Failed to persist queued message: ${insertError.message}`);

    // conversations.last_activity_at / last_message_* are maintained by the
    // trg_update_conversation_last_message trigger on messages.

    return message;
  }

  async sendOutbound(input: {
    conversation_id: string;
    to: string;
    from: string;
    body_text: string;
    sender_type: SenderType;
    source_job_id?: string;
  }): Promise<Message> {
    const message = await this.queueOutbound({
      conversation_id: input.conversation_id,
      body_text: input.body_text,
      sender_type: input.sender_type,
      source_job_id: input.source_job_id,
    });

    return this.dispatchQueuedOutbound({
      message_id: message.id,
      to: input.to,
      from: input.from,
    });
  }

  async dispatchQueuedOutbound(input: {
    message_id: string;
    to: string;
    from: string;
  }): Promise<Message> {
    const { data: message, error: fetchError } = await this.db
      .from('messages')
      .select('*')
      .eq('id', input.message_id)
      .single();

    if (fetchError || !message) {
      throw new Error(`Failed to load message ${input.message_id}: ${fetchError?.message ?? 'Not found'}`);
    }

    if (message.direction !== MessageDirection.Outbound) {
      throw new Error(`Message ${input.message_id} is not outbound`);
    }

    if (message.provider_message_id) {
      return message;
    }

    // Send via provider
    try {
      const result = await this.smsAdapter.sendMessage({
        to: input.to,
        from: input.from,
        body: message.body_text,
        conversation_id: message.conversation_id,
      });

      // Update with provider response
      await this.db
        .from('messages')
        .update({
          provider_message_id: result.provider_message_id,
          provider_status: result.status,
          sent_at: new Date().toISOString(),
        })
        .eq('id', message.id);

      return {
        ...message,
        provider_message_id: result.provider_message_id,
        provider_status: result.status,
        sent_at: new Date().toISOString(),
      };
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
        source_job_id: null,
        direction: MessageDirection.Inbound,
        sender_type: SenderType.Lead,
        body_text: input.body_text,
        provider_message_id: input.provider_message_id,
        received_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505' || error.message.includes('duplicate key')) {
        const { data: existing } = await this.db
          .from('messages')
          .select('*')
          .eq('provider_message_id', input.provider_message_id)
          .single();

        if (existing) return existing;
      }

      throw new Error(`Failed to record inbound message: ${error.message}`);
    }

    // conversations.last_activity_at / last_message_* are maintained by the
    // trg_update_conversation_last_message trigger on messages.

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
