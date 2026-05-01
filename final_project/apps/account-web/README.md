# WorkWise Account Web

Deploy this directory to Vercel as the standalone account site for:

- login / logout
- resume upload
- favorite companies
- full Glassdoor comments stored in the synced profile

## Required environment variables

Copy `.env.example` into Vercel project settings:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (recommended server-side fallback for `/api/profile`)

## Vercel setup

1. Import the GitHub repository into Vercel
2. Set the **Root Directory** to `apps/account-web`
3. Add the environment variables above
4. Deploy
5. Bind the custom domain `account.workwise.app`

## Clerk setup

Add these URLs in Clerk:

- `http://localhost:3000`
- your Vercel preview domain
- `https://account.workwise.app`

If you do not set `SUPABASE_SERVICE_ROLE_KEY` in Vercel, also create a Clerk JWT template named `supabase`. The API route will fall back to that token plus the Supabase anon key.

## Supabase setup

Run `/supabase/schema.sql` in the SQL editor and enable Clerk third-party auth.
