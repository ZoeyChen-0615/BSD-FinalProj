# Supabase Setup

This extension syncs uploaded resume profiles to Supabase so users do not need to re-upload on each LinkedIn visit.
Authentication is handled by Clerk; Supabase only stores profile data scoped to the logged-in Clerk user.

## 1. Create a Supabase project

Copy these values from your project settings:

- `Project URL`
- `Anon public key`

These values are used by the extension code.

## 2. Run the schema

Open the Supabase SQL editor and run:

- [schema.sql](/Users/zoeychen/Desktop/Build%20Ship/BSD-FinalProj/final_project/supabase/schema.sql)

## 3. Enable Clerk third-party auth

In Supabase Authentication:

- open `Sign In / Providers`
- switch to `Third-Party Auth`
- enable `Clerk`
- set the Clerk domain to your Clerk frontend API URL (for example `https://alive-teal-28.clerk.accounts.dev`)

## 4. Use in the extension

1. Open the WorkWise popup
2. Sign up or log in with Clerk
3. Upload a resume

After upload:

- the profile is saved locally
- the same parsed profile is also written to Supabase
- next time the popup opens, the extension tries to restore the remote profile automatically
