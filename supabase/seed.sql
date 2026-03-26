-- ============================================================
-- Kong SMS Chatbot — Development Seed Data
-- ============================================================
-- This file populates the database with realistic demo data for
-- local development and testing. It is idempotent — safe to run
-- multiple times thanks to ON CONFLICT DO NOTHING.
--
-- UUID scheme: 00000000-0000-0000-0000-00000000XXXX
--
-- Contents:
--   1 Workspace (Demo Workspace)
--   1 Admin User (admin@demo.com)
--   1 Workspace-User link (owner)
--   4 Integrations (Twilio, OpenAI, Keap, Calendly)
--   1 Campaign (Lead Qualification)
--   2 Agents (Friendly Qualifier, Direct Qualifier)
--   2 Agent Versions (v1 for each agent)
--   2 Calendars (Strategy Call, Quick Intro)
--   2 Agent-Calendar links
--   2 Leads (Jane Smith, Bob Johnson)
--   1 Conversation (Jane + Agent A)
--   4 Messages
--   3 Conversation Events
--   1 AI Decision
-- ============================================================

-- ─── Auth User (Supabase auth.users) ───────────────────────
-- Required because public.users has a FK to auth.users(id).
-- In Supabase local dev, auth.users is writable.

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  raw_app_meta_data,
  raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@demo.com',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Demo Admin"}'
) ON CONFLICT (id) DO NOTHING;

-- ─── Workspace ─────────────────────────────────────────────

INSERT INTO workspaces (id, name, slug, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Demo Workspace',
  'demo',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- ─── User ──────────────────────────────────────────────────

INSERT INTO users (id, email, full_name, auth_provider)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'admin@demo.com',
  'Demo Admin',
  'email'
) ON CONFLICT (id) DO NOTHING;

-- ─── Workspace User ────────────────────────────────────────

INSERT INTO workspace_users (id, workspace_id, user_id, role)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  'owner'
) ON CONFLICT (id) DO NOTHING;

-- ─── Integrations ──────────────────────────────────────────

-- Twilio SMS
INSERT INTO integrations (id, workspace_id, type, provider, name, status, config_json)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'sms',
  'twilio',
  'Twilio SMS',
  'active',
  '{
    "account_sid_ref": "TWILIO_ACCOUNT_SID",
    "auth_token_ref": "TWILIO_AUTH_TOKEN",
    "from_number": "+15550001111",
    "webhook_url": "https://example.com/api/webhooks/twilio"
  }'
) ON CONFLICT (id) DO NOTHING;

-- OpenAI
INSERT INTO integrations (id, workspace_id, type, provider, name, status, config_json)
VALUES (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  'ai_provider',
  'openai',
  'OpenAI GPT-4',
  'active',
  '{
    "api_key_ref": "OPENAI_API_KEY",
    "default_model": "gpt-4o",
    "max_tokens": 300,
    "temperature": 0.7
  }'
) ON CONFLICT (id) DO NOTHING;

-- Keap CRM
INSERT INTO integrations (id, workspace_id, type, provider, name, status, config_json)
VALUES (
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000001',
  'crm',
  'keap',
  'Keap CRM',
  'active',
  '{
    "api_key_ref": "KEAP_API_KEY",
    "app_id_ref": "KEAP_APP_ID",
    "base_url": "https://api.infusionsoft.com/crm/rest/v1"
  }'
) ON CONFLICT (id) DO NOTHING;

-- Calendly
INSERT INTO integrations (id, workspace_id, type, provider, name, status, config_json)
VALUES (
  '00000000-0000-0000-0000-000000000013',
  '00000000-0000-0000-0000-000000000001',
  'calendar',
  'calendly',
  'Calendly Booking',
  'active',
  '{
    "api_key_ref": "CALENDLY_API_KEY",
    "organization_url": "https://calendly.com/demo-workspace"
  }'
) ON CONFLICT (id) DO NOTHING;

-- ─── Campaign ──────────────────────────────────────────────

INSERT INTO campaigns (id, workspace_id, name, status, business_hours_json, stop_conditions_json)
VALUES (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000001',
  'Lead Qualification',
  'active',
  '{
    "timezone": "America/New_York",
    "schedule": {
      "monday":    {"start": "09:00", "end": "17:00"},
      "tuesday":   {"start": "09:00", "end": "17:00"},
      "wednesday": {"start": "09:00", "end": "17:00"},
      "thursday":  {"start": "09:00", "end": "17:00"},
      "friday":    {"start": "09:00", "end": "17:00"}
    }
  }',
  '{
    "max_messages": 50,
    "max_days": 14,
    "max_no_reply_hours": 72
  }'
) ON CONFLICT (id) DO NOTHING;

-- ─── Agents ────────────────────────────────────────────────

-- Agent A: Friendly Qualifier
INSERT INTO agents (id, campaign_id, name, status, ai_provider_integration_id, weight)
VALUES (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000020',
  'Friendly Qualifier',
  'active',
  '00000000-0000-0000-0000-000000000011',
  50
) ON CONFLICT (id) DO NOTHING;

-- Agent B: Direct Qualifier
INSERT INTO agents (id, campaign_id, name, status, ai_provider_integration_id, weight)
VALUES (
  '00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000020',
  'Direct Qualifier',
  'active',
  '00000000-0000-0000-0000-000000000011',
  50
) ON CONFLICT (id) DO NOTHING;

-- ─── Agent Versions ────────────────────────────────────────

-- Agent A v1 — warm, friendly, conversational
INSERT INTO agent_versions (id, agent_id, version_number, prompt_text, system_rules_json, reply_cadence_json, config_json, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000030',
  1,
  'You are a warm, friendly, and conversational sales assistant. Your goal is to build rapport with the lead while qualifying them for our services.

Approach:
- Be personable and empathetic. Use the lead''s first name.
- Ask open-ended questions about their needs, challenges, and goals.
- Naturally steer the conversation toward budget and timeline.
- Qualify the lead if their budget is above $3,000/month and they have a clear timeline (within 3 months).
- Once qualified, suggest booking a strategy call.
- Keep messages short and SMS-friendly (under 160 characters when possible).
- Never make promises about results or guarantees.
- If the lead seems uninterested, gracefully disengage.',
  '{
    "qualification_criteria": {
      "min_budget": 3000,
      "max_timeline_months": 3
    },
    "tone": "warm_friendly",
    "max_message_length": 320
  }',
  '{
    "initial_delay_seconds": 30,
    "followup_delay_seconds": 3600,
    "max_followups": 3
  }',
  '{
    "model": "gpt-4o",
    "temperature": 0.8,
    "max_tokens": 200
  }',
  true
) ON CONFLICT (id) DO NOTHING;

-- Agent B v1 — direct, efficient
INSERT INTO agent_versions (id, agent_id, version_number, prompt_text, system_rules_json, reply_cadence_json, config_json, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000041',
  '00000000-0000-0000-0000-000000000031',
  1,
  'You are a direct and efficient sales assistant. Your goal is to quickly determine if the lead is a good fit for our services.

Approach:
- Be professional and respectful, but get to the point quickly.
- Ask targeted questions about budget, timeline, and current challenges.
- Qualify the lead if their budget is above $3,000/month and they have a clear timeline (within 3 months).
- Once qualified, immediately suggest booking a strategy call.
- Keep messages concise and action-oriented.
- Do not spend time on small talk — every message should move toward qualification.
- Never make promises about results or guarantees.
- If the lead does not meet criteria after 3 exchanges, politely close.',
  '{
    "qualification_criteria": {
      "min_budget": 3000,
      "max_timeline_months": 3
    },
    "tone": "direct_professional",
    "max_message_length": 280
  }',
  '{
    "initial_delay_seconds": 30,
    "followup_delay_seconds": 3600,
    "max_followups": 3
  }',
  '{
    "model": "gpt-4o",
    "temperature": 0.5,
    "max_tokens": 150
  }',
  true
) ON CONFLICT (id) DO NOTHING;

-- ─── Calendars ─────────────────────────────────────────────

-- Strategy Call (linked to Calendly integration)
INSERT INTO calendars (id, workspace_id, integration_id, name, booking_url, eligibility_rules_json, status)
VALUES (
  '00000000-0000-0000-0000-000000000050',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000013',
  'Strategy Call',
  'https://calendly.com/demo-workspace/strategy-call',
  '{
    "min_budget": 3000,
    "qualified_only": true
  }',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Quick Intro
INSERT INTO calendars (id, workspace_id, integration_id, name, booking_url, eligibility_rules_json, status)
VALUES (
  '00000000-0000-0000-0000-000000000051',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000013',
  'Quick Intro',
  'https://calendly.com/demo-workspace/quick-intro',
  '{
    "qualified_only": false
  }',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- ─── Agent-Calendar Links ──────────────────────────────────

-- Agent A -> Strategy Call
INSERT INTO agent_calendars (id, agent_id, calendar_id)
VALUES (
  '00000000-0000-0000-0000-000000000060',
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000050'
) ON CONFLICT (id) DO NOTHING;

-- Agent B -> Strategy Call
INSERT INTO agent_calendars (id, agent_id, calendar_id)
VALUES (
  '00000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000050'
) ON CONFLICT (id) DO NOTHING;

-- ─── Leads ─────────────────────────────────────────────────

-- Jane Smith
INSERT INTO leads (id, workspace_id, external_contact_id, crm_provider, first_name, last_name, email, phone_e164, timezone, status)
VALUES (
  '00000000-0000-0000-0000-000000000070',
  '00000000-0000-0000-0000-000000000001',
  'keap_12345',
  'keap',
  'Jane',
  'Smith',
  'jane@example.com',
  '+15551234567',
  'America/New_York',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Bob Johnson
INSERT INTO leads (id, workspace_id, first_name, last_name, email, phone_e164, timezone, status)
VALUES (
  '00000000-0000-0000-0000-000000000071',
  '00000000-0000-0000-0000-000000000001',
  'Bob',
  'Johnson',
  'bob@example.com',
  '+15559876543',
  'America/Chicago',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- ─── Conversation (Jane + Agent A) ─────────────────────────

INSERT INTO conversations (id, workspace_id, campaign_id, agent_id, agent_version_id, lead_id, status, outcome, needs_human, human_controlled, opened_at, last_activity_at)
VALUES (
  '00000000-0000-0000-0000-000000000080',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000070',
  'active',
  null,
  false,
  false,
  now() - interval '2 hours',
  now() - interval '10 minutes'
) ON CONFLICT (id) DO NOTHING;

-- ─── Messages ──────────────────────────────────────────────

-- Message 1: AI outbound greeting
INSERT INTO messages (id, conversation_id, direction, sender_type, body_text, sent_at, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000090',
  '00000000-0000-0000-0000-000000000080',
  'outbound',
  'ai',
  'Hi Jane! Thanks for reaching out. I''d love to learn more about what you''re looking for. What kind of service are you interested in?',
  now() - interval '2 hours',
  now() - interval '2 hours'
) ON CONFLICT (id) DO NOTHING;

-- Message 2: Lead inbound reply
INSERT INTO messages (id, conversation_id, direction, sender_type, body_text, received_at, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000091',
  '00000000-0000-0000-0000-000000000080',
  'inbound',
  'lead',
  'Hi! I''m looking for help with marketing for my small business',
  now() - interval '1 hour 45 minutes',
  now() - interval '1 hour 45 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Message 3: AI outbound follow-up
INSERT INTO messages (id, conversation_id, direction, sender_type, body_text, sent_at, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000092',
  '00000000-0000-0000-0000-000000000080',
  'outbound',
  'ai',
  'That''s great! Marketing can make a huge difference. Can you tell me a bit about your budget range and when you''d like to get started?',
  now() - interval '1 hour 44 minutes',
  now() - interval '1 hour 44 minutes'
) ON CONFLICT (id) DO NOTHING;

-- Message 4: Lead inbound with budget info
INSERT INTO messages (id, conversation_id, direction, sender_type, body_text, received_at, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000093',
  '00000000-0000-0000-0000-000000000080',
  'inbound',
  'lead',
  'We''re thinking around $5000/month and want to start next month',
  now() - interval '10 minutes',
  now() - interval '10 minutes'
) ON CONFLICT (id) DO NOTHING;

-- ─── Conversation Events ───────────────────────────────────

-- Event 1: Conversation created
INSERT INTO conversation_events (id, conversation_id, event_type, event_payload_json, created_at)
VALUES (
  '00000000-0000-0000-0000-0000000000a0',
  '00000000-0000-0000-0000-000000000080',
  'conversation_created',
  '{
    "campaign_id": "00000000-0000-0000-0000-000000000020",
    "agent_id": "00000000-0000-0000-0000-000000000030",
    "lead_id": "00000000-0000-0000-0000-000000000070",
    "assignment_reason": "ab_test_random"
  }',
  now() - interval '2 hours'
) ON CONFLICT (id) DO NOTHING;

-- Event 2: AI reply generated
INSERT INTO conversation_events (id, conversation_id, event_type, event_payload_json, created_at)
VALUES (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000080',
  'ai_reply_generated',
  '{
    "message_id": "00000000-0000-0000-0000-000000000090",
    "model": "gpt-4o",
    "tokens_used": 42,
    "latency_ms": 1200
  }',
  now() - interval '2 hours'
) ON CONFLICT (id) DO NOTHING;

-- Event 3: Message received from lead
INSERT INTO conversation_events (id, conversation_id, event_type, event_payload_json, created_at)
VALUES (
  '00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-000000000080',
  'message_received',
  '{
    "message_id": "00000000-0000-0000-0000-000000000091",
    "from": "+15551234567",
    "provider": "twilio"
  }',
  now() - interval '1 hour 45 minutes'
) ON CONFLICT (id) DO NOTHING;

-- ─── AI Decision ───────────────────────────────────────────

INSERT INTO ai_decisions (id, workspace_id, conversation_id, message_id, agent_version_id, provider_integration_id, model_name, input_json, decision_json, raw_response_json)
VALUES (
  '00000000-0000-0000-0000-0000000000b0',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000080',
  '00000000-0000-0000-0000-000000000092',
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000011',
  'gpt-4o',
  '{
    "conversation_history": [
      {"role": "assistant", "content": "Hi Jane! Thanks for reaching out. I''d love to learn more about what you''re looking for. What kind of service are you interested in?"},
      {"role": "user", "content": "Hi! I''m looking for help with marketing for my small business"}
    ],
    "lead_context": {
      "first_name": "Jane",
      "timezone": "America/New_York"
    }
  }',
  '{
    "action": "reply",
    "qualification_status": "in_progress",
    "detected_intent": "service_inquiry",
    "confidence": 0.92,
    "next_step": "gather_budget_and_timeline"
  }',
  '{
    "id": "chatcmpl-seed-example-001",
    "model": "gpt-4o",
    "usage": {
      "prompt_tokens": 185,
      "completion_tokens": 38,
      "total_tokens": 223
    },
    "choices": [
      {
        "message": {
          "role": "assistant",
          "content": "That''s great! Marketing can make a huge difference. Can you tell me a bit about your budget range and when you''d like to get started?"
        },
        "finish_reason": "stop"
      }
    ]
  }'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Seed complete. Run with: supabase db reset
-- ============================================================
