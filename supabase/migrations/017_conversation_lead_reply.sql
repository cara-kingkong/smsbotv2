-- ============================================================
-- Track whether the lead has replied at least once
-- ============================================================
-- Adds a denormalized `has_lead_reply` flag to conversations so
-- the dashboard can report "engaged" conversations (leads that
-- actually responded) without scanning the messages table on
-- every load. The flag is maintained by the same insert trigger
-- that keeps the last-message snapshot in sync (migration 012),
-- so the only write cost is a one-time flip the first time an
-- inbound message arrives.

alter table conversations
  add column if not exists has_lead_reply boolean not null default false;

create or replace function update_conversation_last_message()
returns trigger
language plpgsql
as $$
begin
  update conversations
  set
    last_message_preview     = left(coalesce(new.body_text, ''), 280),
    last_message_sender_type = new.sender_type,
    last_message_direction   = new.direction,
    last_message_at          = new.created_at,
    last_activity_at         = greatest(last_activity_at, new.created_at)
  where id = new.conversation_id
    and (last_message_at is null or new.created_at >= last_message_at);

  -- Mark that the lead has engaged on any inbound message. Kept as a
  -- separate, ordering-independent update so an out-of-order insert
  -- still flips the flag; the guard makes it a no-op once already set.
  if new.direction = 'inbound' then
    update conversations
    set has_lead_reply = true
    where id = new.conversation_id
      and has_lead_reply = false;
  end if;

  return new;
end;
$$;

-- Backfill existing conversations that have ever received an inbound message.
update conversations c
set has_lead_reply = true
where has_lead_reply = false
  and exists (
    select 1 from messages m
    where m.conversation_id = c.id
      and m.direction = 'inbound'
  );
