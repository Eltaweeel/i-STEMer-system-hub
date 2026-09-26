# Hermes VPS handoff

Deploy the reviewed GitHub commit, not an uncommitted working directory. This packet does not install Nous Hermes or start agents. The website's sample workflow pages remain sample data; account configuration does not make them live.

## Automated staging deployment

The GitHub Actions workflow at `.github/workflows/staging-deploy.yml` runs on every push to `main` and on manual dispatch from `main`. It runs lint, typecheck, the test suite, and the production build before packaging and deploying the i-STEMer standalone app. The deploy step uses a dedicated SSH key with a forced command and a pinned VPS host key; it does not expose a shell or copy secrets into the release. Configure these repository Actions secrets:

- `ISTEMER_STAGING_SSH_KEY`: the private key paired with the restricted key entry on the VPS.
- `ISTEMER_STAGING_KNOWN_HOSTS`: the verified `77.237.232.170 ssh-ed25519 ...` known-hosts line.

On the VPS, install the reviewed helpers once as root with `bash deploy/install-staging-host.sh`. Add the public deployment key to `/srv/istemer-deploy/.ssh/authorized_keys` with `restrict,command="/usr/local/sbin/istemer-staging-receive"`. Never put the private key in the repository. The receiver accepts only `deploy <full-commit-sha>`, validates and safely extracts the standalone artifact, then invokes the root-owned activation helper. The helper switches `/srv/istemer-staging/active-release`, reloads and restarts `istemer-staging.service`, checks `/`, `/coordination-cycle/`, and `/agents/`, and restores the previous release if a check fails. Old releases are retained for rollback; the private `/etc/istemer-staging.env` file is not modified.

The staging web service currently runs from `Eltaweeel/i-STEMer-system-hub`. `Eltaweeel/i-STEMer-agents-hub` is a separate source repository: it has no staging service or start script and is not imported by the deployed UI. Its pushes therefore do not trigger website deployment. Do not couple it to this workflow until a reviewed runtime integration and deployment target exist.

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
