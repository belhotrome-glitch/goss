-- Run this once in Supabase SQL Editor to enable staff reassignment with
-- separate archived chat transcripts. Existing messages are kept in the
-- initial conversation for each concern.
begin;

create table if not exists public.concern_conversations (
  id uuid primary key default gen_random_uuid(),
  concern_id uuid not null references public.concerns(id) on delete cascade,
  assigned_staff_id uuid references public.users(id) on delete set null,
  assigned_at text,
  started_at text not null,
  ended_at text,
  ended_by uuid references public.users(id) on delete set null
);
alter table public.concern_conversations add column if not exists assigned_at text;

alter table public.messages
  add column if not exists conversation_id uuid
  references public.concern_conversations(id) on delete cascade;

insert into public.concern_conversations (concern_id, assigned_staff_id, assigned_at, started_at)
select c.id, c.assigned_to,
  case when c.assigned_to is null then null else c.created_at end,
  c.created_at
from public.concerns c
where not exists (
  select 1 from public.concern_conversations cc
  where cc.concern_id = c.id and cc.ended_at is null
);
update public.concern_conversations
set assigned_at = started_at
where assigned_staff_id is not null and assigned_at is null;

update public.messages m
set conversation_id = cc.id
from public.concern_conversations cc
where cc.concern_id = m.concern_id
  and cc.ended_at is null
  and m.conversation_id is null;

alter table public.messages alter column conversation_id set not null;
create unique index if not exists idx_concern_conversations_active
  on public.concern_conversations(concern_id) where ended_at is null;
create index if not exists idx_concern_conversations_concern
  on public.concern_conversations(concern_id, started_at);
create index if not exists idx_messages_conversation
  on public.messages(conversation_id);

alter table public.concern_conversations enable row level security;

create or replace function public.can_access_case(p_concern_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.concerns c
      where c.id = p_concern_id
        and (c.student_id = auth.uid() or public.is_staff())
    );
$$;

create or replace function public.can_reply_to_conversation(p_conversation_id uuid, p_concern_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.concern_conversations cc
    where cc.id = p_conversation_id
      and cc.concern_id = p_concern_id
      and cc.ended_at is null
      and public.can_access_case(p_concern_id)
  );
$$;

create or replace function public.can_read_conversation(p_conversation_id uuid, p_concern_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.concern_conversations cc
    where cc.id = p_conversation_id
      and cc.concern_id = p_concern_id
      and (
        public.is_staff()
        or (
          cc.ended_at is null
          and exists (
            select 1 from public.concerns c
            where c.id = p_concern_id and c.student_id = auth.uid()
          )
        )
      )
  );
$$;

drop policy if exists "concern_conversations_select" on public.concern_conversations;
create policy "concern_conversations_select" on public.concern_conversations
  for select using (
    public.is_staff()
    or (
      ended_at is null
      and exists (
        select 1 from public.concerns c
        where c.id = concern_id and c.student_id = auth.uid()
      )
    )
  );

drop policy if exists "concern_conversations_insert" on public.concern_conversations;
create policy "concern_conversations_insert" on public.concern_conversations
  for insert with check (
    public.is_staff()
    or exists (
      select 1 from public.concerns c
      where c.id = concern_id and c.student_id = auth.uid()
    )
  );

drop policy if exists "concern_conversations_update" on public.concern_conversations;
create policy "concern_conversations_update" on public.concern_conversations
  for update using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "messages_insert" on public.messages;
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select using (public.can_read_conversation(conversation_id, concern_id));

create policy "messages_insert" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and public.can_reply_to_conversation(conversation_id, concern_id)
  );

drop policy if exists "messages_update_read_receipt" on public.messages;
create policy "messages_update_read_receipt" on public.messages
  for update using (public.can_reply_to_conversation(conversation_id, concern_id))
  with check (public.can_reply_to_conversation(conversation_id, concern_id));

create or replace function public.reassign_concern(p_concern_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_concern public.concerns%rowtype;
  v_conversation public.concern_conversations%rowtype;
  v_staff_name text;
  v_conversation_id uuid;
  v_now text := to_char(now(), 'YYYY-MM-DD HH24:MI:SS');
  v_restarted boolean := false;
begin
  if coalesce(public.my_role(), '') <> 'staff' then
    raise exception 'Only staff can assign a concern';
  end if;

  select * into v_concern
  from public.concerns
  where id = p_concern_id
  for update;
  if not found then
    raise exception 'Concern not found';
  end if;

  select full_name into v_staff_name
  from public.users
  where id = p_staff_id and role = 'staff' and is_active is distinct from false;
  if not found then
    raise exception 'Choose a valid staff member';
  end if;

  select * into v_conversation
  from public.concern_conversations
  where concern_id = p_concern_id and ended_at is null
  for update;

  if v_concern.assigned_to is distinct from p_staff_id then
    if v_conversation.id is not null and v_concern.assigned_to is not null then
      update public.concern_conversations
      set ended_at = v_now, ended_by = auth.uid()
      where id = v_conversation.id;
      insert into public.concern_conversations (concern_id, assigned_staff_id, assigned_at, started_at)
      values (p_concern_id, p_staff_id, v_now, v_now)
      returning id into v_conversation_id;
      v_restarted := true;
    elsif v_conversation.id is not null then
      update public.concern_conversations
      set assigned_staff_id = p_staff_id, assigned_at = v_now
      where id = v_conversation.id
      returning id into v_conversation_id;
    else
      insert into public.concern_conversations (concern_id, assigned_staff_id, assigned_at, started_at)
      values (p_concern_id, p_staff_id, v_now, v_now)
      returning id into v_conversation_id;
      v_restarted := v_concern.assigned_to is not null;
    end if;

    update public.concerns
    set assigned_to = p_staff_id, updated_at = v_now
    where id = p_concern_id;

    insert into public.notifications (user_id, title, body, is_read, created_at, event_type)
    values (
      v_concern.student_id,
      'Concern Assigned',
      'Your concern "' || v_concern.subject || '" has been assigned to ' || v_staff_name ||
        case when v_restarted then '. A new conversation has been started.' else '.' end,
      false,
      v_now,
      'concern_assigned'
    );
  else
    v_conversation_id := v_conversation.id;
    if v_conversation_id is null then
      insert into public.concern_conversations (concern_id, assigned_staff_id, assigned_at, started_at)
      values (p_concern_id, p_staff_id, v_now, v_now)
      returning id into v_conversation_id;
    end if;
  end if;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'conversation_restarted', v_restarted
  );
end;
$$;

revoke all on function public.reassign_concern(uuid, uuid) from public;
grant execute on function public.reassign_concern(uuid, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'concern_conversations'
  ) then
    alter publication supabase_realtime add table public.concern_conversations;
  end if;
end $$;

commit;
