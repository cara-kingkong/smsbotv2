import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { QueueService } from '../../src/lib/queues/service';

/**
 * Release a conversation back to AI control.
 * POST /.netlify/functions/api-inbox-release
 * Body: { conversation_id: string }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const { conversation_id } = (await req.json()) as { conversation_id: string };

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: 'conversation_id is required' }), { status: 400 });
    }

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversation_id);

    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    }

    if (!conversation.human_controlled) {
      return new Response(
        JSON.stringify({ error: 'Conversation is not currently human-controlled' }),
        { status: 409 },
      );
    }

    // Release back to AI
    const updated = await conversationService.releaseToAI(conversation_id);

    // Queue an AI reply job so AI picks up where it left off
    const queueService = new QueueService(db);
    await queueService.enqueue({
      job_type: 'generate_ai_reply',
      queue_name: 'ai',
      payload: {
        conversation_id,
        trigger: 'human_release',
      },
    });

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-inbox-release error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
