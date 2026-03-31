import { describe, expect, it, vi } from 'vitest';
import { MessagingService } from '../../../src/lib/messaging/service';
import { MessageDirection, SenderType } from '../../../src/lib/types';

describe('MessagingService', () => {
  it('reuses an existing outbound message when source_job_id matches', async () => {
    const existingMessage = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      source_job_id: 'job-1',
      direction: MessageDirection.Outbound,
      sender_type: SenderType.AI,
      body_text: 'Hello',
      provider_message_id: null,
      provider_status: 'queued',
      error_json: null,
      sent_at: null,
      received_at: null,
      created_at: new Date().toISOString(),
    };

    const insertSpy = vi.fn();
    const db = {
      from: vi.fn((table: string) => {
        if (table === 'messages') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: existingMessage, error: null }),
              }),
            }),
            insert: insertSpy,
          };
        }

        return {
          update: vi.fn(),
        };
      }),
    };

    const service = new MessagingService(db as any, { sendMessage: vi.fn() } as any);
    const result = await service.queueOutbound({
      conversation_id: 'conv-1',
      body_text: 'Hello',
      sender_type: SenderType.AI,
      source_job_id: 'job-1',
    });

    expect(result).toEqual(existingMessage);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('does not re-send an outbound message that already has a provider_message_id', async () => {
    const existingMessage = {
      id: 'msg-2',
      conversation_id: 'conv-2',
      source_job_id: 'job-2',
      direction: MessageDirection.Outbound,
      sender_type: SenderType.AI,
      body_text: 'Already sent',
      provider_message_id: 'SM123',
      provider_status: 'sent',
      error_json: null,
      sent_at: new Date().toISOString(),
      received_at: null,
      created_at: new Date().toISOString(),
    };

    const sendMessage = vi.fn();
    const db = {
      from: vi.fn((table: string) => {
        if (table === 'messages') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: existingMessage, error: null }),
              }),
            }),
          };
        }

        return {
          update: vi.fn(),
        };
      }),
    };

    const service = new MessagingService(db as any, { sendMessage } as any);
    const result = await service.dispatchQueuedOutbound({
      message_id: 'msg-2',
      to: '+15555550123',
      from: '+15555550999',
    });

    expect(result).toEqual(existingMessage);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
