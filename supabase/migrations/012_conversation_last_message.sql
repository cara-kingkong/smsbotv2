-- ============================================================
-- Denormalize last-message snapshot onto conversations
-- ============================================================
-- Eliminates the N+1 query in api-inbox-list where each listed
-- conversation fired its own "most recent message" lookup.
-- The trigger below keeps the snapshot in sync on every insert
-- and also advances last_activity_at, so the messaging service
-- no longer needs a follow-up UPDATE per message.

alter table conversations
  add column if not exists last_message_preview     text,
  add column if not exists last_message_sender_type sender_type,
  add column if not exists last_message_direction   message_direction,
  add column if not exists last_message_at          timestamptz;

-- Supports the inbox list ordering (workspace + status filter + recency).
create index if not exists idx_conversations_workspace_activity
  on conversations(workspace_id, last_activity_at desc)
  where deleted_at is null;

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
  return new;
end;
$$;

drop trigger if exists trg_update_conversation_last_message on messages;
create trigger trg_update_conversation_last_message
after insert on messages
for each row
execute function update_conversation_last_message();

-- Backfill using DISTINCT ON to grab the latest message per conversation.
update conversations c
set
  last_message_preview     = left(coalesce(m.body_text, ''), 280),
  last_message_sender_type = m.sender_type,
  last_message_direction   = m.direction,
  last_message_at          = m.created_at
from (
  select distinct on (conversation_id)
    conversation_id, body_text, sender_type, direction, created_at
  from messages
  order by conversation_id, created_at desc
) m
where c.id = m.conversation_id;
