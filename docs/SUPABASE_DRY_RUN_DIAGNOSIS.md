# Supabase dry-run diagnosis

**Final verdict: CONFIG_ERROR**

Date: 2026-09-10. Repository:
`D:\Abdo\Private\STEMer\Claude code\Building\business-agent-os`.

The supported command fails in the legacy CLI profile loader. It is not a
missing-Docker error or a syntax error in `supabase/config.toml`.

## Requested checks

### 1. Version

```powershell
npx supabase --version
```

Output: `2.109.1`. Completed successfully. No installation prompt appeared.

### 2. Push help

```powershell
npx supabase db push --help
```

Completed successfully. Relevant help output:

```text
USAGE
  supabase db push [flags]

  --dry-run    Print the migrations that would be applied, but don't actually apply them.
  --linked     Pushes to the linked project.
  --profile string    Use a specific profile for connecting to Supabase API.
```

`--dry-run`, `--linked` and the global `--profile` flag are supported. Their
placement in the requested command is syntactically correct. The two unprofiled
version/help invocations above were explicitly requested, informational checks;
the only project-targeting CLI invocation used `--profile istemer`.

### 3. Docker

```powershell
docker version
```

PowerShell could not launch Docker:

```text
The term 'docker' is not recognized as a name of a cmdlet, function, script file, or executable program.
Check the spelling of the name, or if a path was included, verify that the path is correct and try again.
```

There is no Docker process exit code because the executable was not found.
Docker remains unavailable; nothing was installed or configured.

### 4. Project configuration

Read-only filesystem inspection found **`supabase/config.toml` does not exist**.
There was no TOML content to parse or display. No config was created, and no
environment or credential file contents were printed.

The observed error explicitly names profile loading. The matching source passes
the profile token to a separate config-file loader; it does not report a parse
failure in `supabase/config.toml`. Missing project configuration could be a later
check once profile loading succeeds; this run did not reach it and does not
establish that a project config must be created for the linked path.

### 5. Exact dry-run reproduction

```powershell
npx supabase --profile istemer db push --linked --dry-run
```

**Exit code: 1. Full process error output:**

```text
failed to read profile: Unsupported Config Type ""
Try rerunning the command with --debug to troubleshoot the error.
```

No password prompt appeared. Debug logging was not enabled. No migration plan,
connection-success message or migration application was returned.

## Cause and evidence

The installed npm package and CLI both identify version 2.109.1. The source was
checked against the exact upstream `v2.109.1` tag, rather than assuming the current
main-branch implementation matches the installed CLI:

1. [The versioned push handler](https://github.com/supabase/cli/blob/v2.109.1/apps/cli/src/legacy/commands/db/push/push.handler.ts)
   forwards `db push`, including `--dry-run`, to `LegacyGoProxy`.
2. [The versioned Go profile loader](https://github.com/supabase/cli/blob/v2.109.1/apps/cli-go/internal/utils/profile.go)
   first recognizes a fixed set of built-in provider profiles. Otherwise it calls
   `viper.SetConfigFile(prof)` followed by `ReadInConfig()` and wraps failures with
   `failed to read profile:`. `istemer` is not one of those built-ins and has no
   file extension. The reproduced empty config-type error is consistent with that
   exact loader path treating an account-profile name as a config-file path.
3. [The versioned Go push implementation](https://github.com/supabase/cli/blob/v2.109.1/apps/cli-go/internal/db/push/push.go)
   connects to PostgreSQL directly, reads pending migration history/files and
   branches on `dryRun` to print the plan instead of applying it. It does not
   start a Docker shadow database for this linked push operation.

Thus the immediate diagnosis is **CLI profile-format/loader incompatibility**.
It is not evidence that the owner's stored account credentials are invalid. The
prior profiled preflight established that project listing and metadata queries
work; this diagnosis did not reauthenticate or change those credentials. The
underlying account-profile files were not opened or edited to attempt a repair.

## Answers

| Question | Determination |
| --- | --- |
| Does 2.109.1 support `--dry-run`? | Yes: installed help and versioned handler confirm it. |
| Is Docker required for this linked push dry-run? | No. The versioned push path uses a direct remote PostgreSQL connection. |
| Is missing Docker the observed cause? | No; the error is profile loading, before the push workflow runs. |
| Is project TOML malformed? | No TOML file exists to be malformed; this error refers to profile config parsing. |
| Is the command syntax correct? | Yes; the valid profile flag reaches an incompatible legacy loader. |
| Has a successful dry-run been demonstrated? | No; it remains blocked by the reproduced profile error. |

Docker-dependent diff/replay checks remain UNVERIFIED and were not attempted.
A successful future dry-run would list planned migrations, not prove migration
SQL execution or authorize application.

## Scope and next step

Only this diagnosis report was created/updated. No config, migrations, application
code or remote project changes were made. No non-dry-run push, reauthentication,
Docker installation, user/invitation creation or commit was performed.

The next repair should address compatibility between the named account profile
and this command's legacy loader. Do not infer that creating project TOML,
installing Docker, removing the profile flag or reauthenticating fixes it. No
repair or account-switch workaround was attempted under this diagnosis-only task.

**CONFIG_ERROR — specifically the CLI profile loader, not project TOML.**
