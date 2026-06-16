import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveEscalationWebhookUrl,
  notifyEscalation,
  formatEscalationText,
  type EscalationNotification,
} from '../../../src/lib/utils/escalation-notify';

const BASE_PAYLOAD: EscalationNotification = {
  reason: 'ai_escalation',
  workspace_id: 'ws-1',
  conversation_id: 'conv-1',
  lead: { first_name: 'Ada', last_name: 'Lovelace', phone: '+15551234567' },
  qualification_state: 'qualified',
  should_book: false,
  lead_engaged: true,
  recent_messages: [],
  occurred_at: '2026-06-04T00:00:00.000Z',
};

describe('resolveEscalationWebhookUrl', () => {
  const originalEsc = process.env.ESCALATION_WEBHOOK_URL;
  const originalChat = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  afterEach(() => {
    if (originalEsc === undefined) delete process.env.ESCALATION_WEBHOOK_URL;
    else process.env.ESCALATION_WEBHOOK_URL = originalEsc;
    if (originalChat === undefined) delete process.env.GOOGLE_CHAT_WEBHOOK_URL;
    else process.env.GOOGLE_CHAT_WEBHOOK_URL = originalChat;
  });

  it('returns the configured url', () => {
    process.env.ESCALATION_WEBHOOK_URL = 'https://hooks.example.com/x';
    expect(resolveEscalationWebhookUrl()).toBe('https://hooks.example.com/x');
  });

  it('falls back to GOOGLE_CHAT_WEBHOOK_URL when no dedicated url is set', () => {
    delete process.env.ESCALATION_WEBHOOK_URL;
    process.env.GOOGLE_CHAT_WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/x';
    expect(resolveEscalationWebhookUrl()).toBe('https://chat.googleapis.com/v1/spaces/x');
  });

  it('prefers ESCALATION_WEBHOOK_URL over the chat fallback', () => {
    process.env.ESCALATION_WEBHOOK_URL = 'https://hooks.example.com/x';
    process.env.GOOGLE_CHAT_WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/x';
    expect(resolveEscalationWebhookUrl()).toBe('https://hooks.example.com/x');
  });

  it('returns null when neither is set', () => {
    delete process.env.ESCALATION_WEBHOOK_URL;
    delete process.env.GOOGLE_CHAT_WEBHOOK_URL;
    expect(resolveEscalationWebhookUrl()).toBeNull();
  });

  it('treats whitespace-only as unset', () => {
    process.env.ESCALATION_WEBHOOK_URL = '   ';
    delete process.env.GOOGLE_CHAT_WEBHOOK_URL;
    expect(resolveEscalationWebhookUrl()).toBeNull();
  });
});

describe('formatEscalationText', () => {
  it('uses the default "needs a human" header for ai_escalation', () => {
    const text = formatEscalationText({ ...BASE_PAYLOAD, reason: 'ai_escalation' });
    expect(text).toContain('Conversation needs a human');
    expect(text).toContain('AI escalation');
  });

  it('uses a booked-lead header and label for message_after_booking', () => {
    const text = formatEscalationText({ ...BASE_PAYLOAD, reason: 'message_after_booking' });
    expect(text).toContain('Booked lead replied — needs a human');
    expect(text).toContain('Lead replied after their call was booked');
    expect(text).not.toContain('Conversation needs a human');
  });

  it('uses an informational header for reopened_closed_conversation', () => {
    const text = formatEscalationText({ ...BASE_PAYLOAD, reason: 'reopened_closed_conversation' });
    expect(text).toContain('Closed conversation got a new message');
    expect(text).toContain('New message on a previously closed conversation');
  });
});

describe('notifyEscalation', () => {
  const originalEsc = process.env.ESCALATION_WEBHOOK_URL;
  const originalChat = process.env.GOOGLE_CHAT_WEBHOOK_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalEsc === undefined) delete process.env.ESCALATION_WEBHOOK_URL;
    else process.env.ESCALATION_WEBHOOK_URL = originalEsc;
    if (originalChat === undefined) delete process.env.GOOGLE_CHAT_WEBHOOK_URL;
    else process.env.GOOGLE_CHAT_WEBHOOK_URL = originalChat;
  });

  it('skips (no throw) when no webhook is configured', async () => {
    delete process.env.ESCALATION_WEBHOOK_URL;
    delete process.env.GOOGLE_CHAT_WEBHOOK_URL;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await notifyEscalation(BASE_PAYLOAD);

    expect(result).toEqual({ delivered: false, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs a Google Chat / Slack compatible { text } body and reports delivered on 2xx', async () => {
    process.env.ESCALATION_WEBHOOK_URL = 'https://hooks.example.com/x';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    const result = await notifyEscalation(BASE_PAYLOAD);

    expect(result).toEqual({ delivered: true, skipped: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/x');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    // Google Chat requires exactly { text }; no extra top-level fields.
    expect(Object.keys(body)).toEqual(['text']);
    expect(body.text).toContain('needs a human');
    expect(body.text).toContain('Ada Lovelace');
    expect(body.text).toContain('+15551234567');
  });

  it('throws on non-2xx so the queue job retries', async () => {
    process.env.ESCALATION_WEBHOOK_URL = 'https://hooks.example.com/x';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));

    await expect(notifyEscalation(BASE_PAYLOAD)).rejects.toThrow(/500/);
  });
});
