## Security Deny List

Agents working in this repository must not read, print, modify, or summarize:

- `.env`
- `.env.local`
- `.env.*`
- `**/.env`
- `**/.env.local`
- `**/.env.*`
- `secrets/`
- `*.pem`
- `*.key`
- `*.p12`
- `*.crt`
- exported Vercel, Clerk, or Supabase environment dumps
- service-role keys, private API keys, or session tokens from any source

Agents should avoid editing generated bundles unless the task explicitly requires it and the source change is made first.
