# i-STEMer system hub

Web application for the i-STEMer agent workspace. The existing command center, agents, workflows and approval previews use labeled sample data. The server/session foundation includes English/Arabic sign-in, recovery, password reset, TOTP setup/verification and protected tenant-access checks. It is not a complete business system or a running Adam/Hermes installation. See [release status](docs/WEB_RELEASE_STATUS.md).

## Local development

Use Node 22 or newer and npm 10 or newer. From the repository root:

```sh
npm ci
npm run dev --workspace apps/istemer-demo
```

The application normally opens at http://localhost:3000. Sample pages require no Supabase configuration. Account routes are under `/en/auth/login/` and `/ar/auth/login/`; missing configuration is shown explicitly.

## Configuration

Configure these environment variables privately in the i-STEMer application environment:

- `NEXT_PUBLIC_SUPABASE_URL`: intended Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: publishable key only; never a secret or service-role key.
- `APP_ORIGIN`: exact origin used for authentication redirects, without a path.

Next public environment values are included at build time. Rebuild when changing the connected project. Configure the same origin and `/auth/callback/` in Supabase's allowed redirect configuration before testing recovery. Do not disable email verification to make a test pass. No automatic signup, account creation, membership grant or database seed occurs at application startup.

Before provisioning live demo identities, complete database-level MFA enforcement and the reviewed membership setup. The UI's owner MFA gate alone does not add that enforcement to the existing database baseline. An abandoned TOTP setup whose secret was not saved requires administrator recovery; existing factors are never automatically deleted. Session sign-out is local to the current session, and public Auth traffic currently relies on Supabase's throttling.

## Build and check

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

The root build covers both i-STEMer and the Northwind fixture conformance app. i-STEMer produces a Next server build; Northwind retains a static export. Database baseline tests are separate: `npm --prefix supabase/tests ci` then `npm --prefix supabase/tests test`. Local database tests do not prove live Auth or Storage behavior.

## Hosting handoff

See [VPS deployment instructions](deploy/README.md). GitHub holds source; Supabase supplies backend services; the Next web server must be hosted separately. Deployment verification and unfinished features are recorded in the release status rather than implied by a build succeeding.
