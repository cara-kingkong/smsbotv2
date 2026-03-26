import type { CRMAdapter, CRMApplyTagInput, CRMCreateNoteInput } from '@lib/types';

export class KeapAdapter implements CRMAdapter {
  private baseUrl = 'https://api.infusionsoft.com/crm/rest/v1';

  constructor(
    private readonly apiKey: string,
  ) {}

  private async request(path: string, options: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Keap-API-Key': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Keap API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  async applyTag(input: CRMApplyTagInput): Promise<{ success: boolean; raw_response: Record<string, unknown> }> {
    const result = await this.request(`/contacts/${input.external_contact_id}/tags`, {
      method: 'POST',
      body: JSON.stringify({
        tagIds: [input.tag_name], // tag_name is the tag ID for Keap
      }),
    });

    return { success: true, raw_response: result };
  }

  async createNote(input: CRMCreateNoteInput): Promise<{ success: boolean; raw_response: Record<string, unknown> }> {
    const result = await this.request('/notes', {
      method: 'POST',
      body: JSON.stringify({
        contact_id: input.external_contact_id,
        body: input.note_body,
        title: 'Kong SMS Chatbot',
        type: 'Other',
      }),
    });

    return { success: true, raw_response: result };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.request('/account/profile', { method: 'GET' });
      return { ok: true, message: 'Keap connection healthy' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}
