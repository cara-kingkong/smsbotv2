import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueueService } from '../../../src/lib/queues/service';

/* ------------------------------------------------------------------ */
/*  Lightweight Supabase stub                                         */
/* ------------------------------------------------------------------ */

function createMockDb(overrides?: {
  updateReturn?: { data: { id: string }[] | null; error: null };
}) {
  const updateReturn = overrides?.updateReturn ?? { data: [{ id: 'job-1' }], error: null };

  const chain = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(updateReturn),
    single: vi.fn().mockResolvedValue({ data: { id: 'job-1' }, error: null }),
  };

  const update = vi.fn().mockReturnValue(chain);
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'job-new' }, error: null }) }) });

  return {
    db: { from: vi.fn().mockReturnValue({ update, insert, select: vi.fn() }) },
    chain,
    update,
    insert,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('QueueService', () => {
  describe('cancelPendingAIReplies', () => {
    it('targets only pending generate_ai_reply jobs for the given conversation', async () => {
      const { db, chain, update } = createMockDb();
      const service = new QueueService(db as never);

      const cancelled = await service.cancelPendingAIReplies('conv-123');

      expect(cancelled).toBe(1);
      expect(update).toHaveBeenCalledOnce();

      // Verify the correct filters were applied (order: status, job_type, payload)
      const eqCalls = chain.eq.mock.calls;
      expect(eqCalls).toContainEqual(['status', 'pending']);
      expect(eqCalls).toContainEqual(['job_type', 'generate_ai_reply']);
      expect(chain.contains).toHaveBeenCalledWith('payload_json', { conversation_id: 'conv-123' });
    });

    it('returns 0 when no pending jobs exist', async () => {
      const { db } = createMockDb({ updateReturn: { data: [], error: null } });
      const service = new QueueService(db as never);

      const cancelled = await service.cancelPendingAIReplies('conv-empty');
      expect(cancelled).toBe(0);
    });

    it('returns 0 when data is null', async () => {
      const { db } = createMockDb({ updateReturn: { data: null, error: null } });
      const service = new QueueService(db as never);

      const cancelled = await service.cancelPendingAIReplies('conv-null');
      expect(cancelled).toBe(0);
    });
  });
});
