import { z } from 'zod';

/** Start conversation webhook payload schema */
export const startConversationSchema = z.object({
  workspace_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  idempotency_key: z.string().optional(),
  lead: z.object({
    phone: z.string().min(10),
    first_name: z.string().min(1),
    last_name: z.string().optional(),
    email: z.string().email().optional(),
    timezone: z.string().optional(),
    external_contact_id: z.string().optional(),
    tags: z.array(z.string()).optional(),
    custom_fields: z.record(z.unknown()).optional(),
  }),
  source_metadata: z.record(z.unknown()).optional(),
});

/** Campaign creation schema */
export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  workspace_id: z.string().uuid(),
  business_hours_json: z
    .object({
      timezone: z.string(),
      schedule: z.array(
        z.object({
          day: z.number().min(0).max(6),
          start: z.string().regex(/^\d{2}:\d{2}$/),
          end: z.string().regex(/^\d{2}:\d{2}$/),
        }),
      ),
    })
    .optional(),
});

/** Agent creation schema */
export const createAgentSchema = z.object({
  campaign_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  weight: z.number().min(1).max(100).optional(),
  ai_provider_integration_id: z.string().uuid().optional(),
});

/** Agent version creation schema */
export const createAgentVersionSchema = z.object({
  agent_id: z.string().uuid(),
  prompt_text: z.string().min(1),
  system_rules_json: z.record(z.unknown()).optional(),
  reply_cadence_json: z
    .object({
      initial_delay_seconds: z.number().min(0),
      followup_delay_seconds: z.number().min(0),
      max_followups: z.number().min(0),
    })
    .optional(),
  config_json: z.record(z.unknown()).optional(),
});

/** Manual message send schema */
export const sendManualMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  body_text: z.string().min(1).max(1600),
});
