# Hermes VPS handoff

Deploy the reviewed GitHub commit, not an uncommitted working directory. This packet does not install Nous Hermes or start agents. The website's sample workflow pages remain sample data; account configuration does not make them live.

## Full-checkout deployment

Use a dedicated service user and Node 22 or newer, npm 10 or newer. Keep secrets outside Git. In a fresh release checkout, supply the public Supabase URL/publishable key at build time and APP_ORIGIN at runtime through the host's private configuration mechanism.

```sh
npm ci
npm run build
```

The standalone output is rooted at `apps/istemer-demo/.next/standalone`. Before starting it, copy the built static assets into the standalone app directory:

```sh
mkdir -p apps/istemer-demo/.next/standalone/apps/istemer-demo/.next
cp -R apps/istemer-demo/.next/static apps/istemer-demo/.next/standalone/apps/istemer-demo/.next/static
```

If `apps/istemer-demo/public` exists, copy it to `apps/istemer-demo/.next/standalone/apps/istemer-demo/public` as well. Start the process from the checkout root:

```sh
HOSTNAME=127.0.0.1 PORT=3000 node apps/istemer-demo/.next/standalone/apps/istemer-demo/server.js
```

Use the host's process supervisor and HTTPS reverse proxy. The standalone server path must be confirmed in the successful build before publication is called deployable. Bind internally when the proxy runs on the same host. Do not copy an example hostname, grant root access to the app, or enable public signup.

The app sets frame, MIME-sniffing and camera/microphone/location restrictions plus a limited CSP for frame ancestors, base URLs and objects. Configure HTTPS and an appropriate HSTS policy at the proxy after TLS works; do not blindly enable HSTS on unrelated hostnames. A full script/style CSP needs a tested Next nonce strategy before deployment, rather than a copied policy that breaks hydration.

## Supabase and acceptance

Confirm the target project and existing migration history before any migration command. Do not reapply the existing baseline. Recovery requires a working Auth sender and exact callback allowlist. Account access also requires an authorized identity and the applicable membership/MFA setup; credentials must never be returned in a deployment report.

Check the home page, a nested sample route, English/Arabic account pages, missing-configuration behavior, and invalid callback behavior. Then verify real sign-in, logout, recovery and unauthorized tenant access with the explicitly designated test identity. Until these live checks pass, report the site as a preview/session foundation, not a completed functional business system.

Retain the previous release directory and private configuration for rollback. Switch traffic only after checks pass. Backend changes need a separately reviewed forward/rollback strategy; do not reset the database as cleanup.
