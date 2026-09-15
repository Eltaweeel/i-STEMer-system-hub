# Supabase project context

## Project metadata

Discovery date: 2026-09-09.

`supabase projects list` returned three projects, but the owner-supplied target ref was absent. CLI authentication is working for the listed projects; access to the target is not confirmed. The CLI reported the checkout unlinked. Linking was not attempted because target visibility could not be confirmed. Remote migration discovery was not run; remote migration existence remains unknown.

The target metadata below was supplied explicitly by the owner; it is not independently CLI-verified.

| Target field | Discovery result |
| --- | --- |
| Project name | i-STEMer |
| Project ref | ezsfdlkuzusylbqxqnod |
| API URL | https://ezsfdlkuzusylbqxqnod.supabase.co |
| Region | eu-west-2 |
| Organization/account | i-STEMer (owner-supplied organization name; account/organization ID not verified) |
| Environment | Non-production, synthetic data only |
| Active/healthy status | Unknown: target absent from CLI listing |

## Environment placeholders

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://ezsfdlkuzusylbqxqnod.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

## Non-production warning

This context is intended only for the separate i-STEMer non-production project with synthetic data. The URL above records owner-supplied metadata, not application configuration or verified connectivity. Confirm CLI access before linking or using the project. Do not substitute an unrelated accessible project. No production use, users, invitations or application integration is established by this discovery.

## Secret-handling rules

- Never put CLI access tokens, database passwords, secret keys or service-role credentials in project files, browser code, public environment variables, logs or this document.
- Authenticate the CLI through `supabase login` when needed; never share access tokens in chat.
- Keep the publishable-key entry above empty. Only a publishable key may eventually occupy that public variable; never a privileged credential.
- `.env.local` remains ignored: `git check-ignore -v .env.local` returned `.gitignore:12:.env.*`. Its contents were not read during this discovery.
