<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Supabase Data API grants (required for new tables)

This project uses `@supabase/supabase-js` (the Data API). As of **October 30, 2026**, Supabase no longer auto-exposes tables in the `public` schema to the Data API. Existing tables (`emails`, `attachments`) keep their original grants and continue to work, but **any new table you add must include explicit `GRANT` statements** or `supabase-js` will return a `42501` error.

When creating a new table in `supabase-schema.sql` or via a migration, append:

```sql
-- Required: grant access to the role(s) the app uses.
-- This project's server uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
grant select, insert, update, delete on public.<table_name> to service_role;

-- Only add these if the table is meant to be read/written directly from a
-- browser using the anon or authenticated key. This project does not do that
-- today, so usually you can skip them:
-- grant select on public.<table_name> to anon;
-- grant select, insert, update, delete on public.<table_name> to authenticated;

alter table public.<table_name> enable row level security;
-- Add explicit RLS policies if anon/authenticated grants are present.
```

Reference: https://supabase.com/docs (search "Data API grants")
