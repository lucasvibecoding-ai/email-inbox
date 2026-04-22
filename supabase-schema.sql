-- Run this in your Supabase SQL Editor to set up the database

-- Emails table
create table emails (
  id uuid default gen_random_uuid() primary key,
  message_id text unique,
  thread_id uuid,
  from_address text not null,
  from_name text,
  to_addresses text[] not null,
  cc_addresses text[],
  bcc_addresses text[],
  subject text,
  text_body text,
  html_body text,
  direction text not null check (direction in ('inbound', 'outbound')),
  is_read boolean default false,
  is_starred boolean default false,
  is_archived boolean default false,
  is_trash boolean default false,
  in_reply_to text,
  "references" text[],
  created_at timestamptz default now()
);

-- Attachments table
create table attachments (
  id uuid default gen_random_uuid() primary key,
  email_id uuid references emails(id) on delete cascade,
  filename text,
  content_type text,
  size integer,
  url text,
  created_at timestamptz default now()
);

-- Indexes
create index idx_emails_thread on emails(thread_id);
create index idx_emails_direction on emails(direction);
create index idx_emails_created on emails(created_at desc);
create index idx_emails_from on emails(from_address);
create index idx_emails_read on emails(is_read);
create index idx_emails_archived on emails(is_archived);
create index idx_emails_trash on emails(is_trash);

-- Auto-assign thread_id: group by subject or in_reply_to
create or replace function assign_thread_id()
returns trigger as $$
begin
  -- If replying to an existing email, use same thread
  if new.in_reply_to is not null then
    select thread_id into new.thread_id
    from emails
    where message_id = new.in_reply_to
    limit 1;
  end if;

  -- If no thread found, create new thread
  if new.thread_id is null then
    new.thread_id := gen_random_uuid();
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_assign_thread
  before insert on emails
  for each row execute function assign_thread_id();

-- Row Level Security
-- The server uses the service role (bypasses RLS); the anon key should have no access.
alter table emails enable row level security;
alter table attachments enable row level security;
