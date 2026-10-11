# Complaint System — Isolated Acceptance Environment

**Purpose:** reproducibly run the Phase 3/Phase 4 complaint acceptance checks against
a disposable local Supabase stack and fictional identities.

**Scope:** authentication, complaint ownership, staff lifecycle, status history,
five-owner emergency aggregation, atomic persistence, attachment boundaries, and
browser/API acceptance.

**Safety boundary:** this guide is local-first. Do not apply the complaint migration
or seed data to a hosted/shared/production project. Do not paste environment files,
Supabase keys, cookies, OTP values, raw phone numbers, or database URLs containing
credentials into issues, reports, or chat.

## 1. Repository and runtime prerequisites

Run all commands from the repository root:

```bash
cd /home/abhishek/Desktop/campus-hackthon
```

Required tools:

- Node.js and pnpm `12.8.1` (the version declared by `package.json`)
- Docker Engine with a working local daemon
- Supabase CLI
- A refreshed shell/session whose user can access Docker's socket

Check availability without printing secrets:

```bash
node --version
pnpm --version
docker info >/dev/null
supabase --version
```

The local Supabase project is configured in `supabase/config.toml`:

| Service       | Local address/port       |
| ------------- | ------------------------ |
| Supabase API  | `http://127.0.0.1:54321` |
| PostgreSQL    | `127.0.0.1:54322`        |
| Studio        | `http://127.0.0.1:54323` |
| Auth site URL | `http://127.0.0.1:3000`  |

These addresses are local-only. The current configuration uses PostgreSQL major
version 17 and local storage/realtime/auth services.

## 2. Application environment

Create the ignored **web app** environment file from the template only if it does
not already exist; never overwrite an existing private file blindly:

```bash
test -e apps/web/.env.local || cp .env.example apps/web/.env.local
```

For a deterministic local complaint run, use these non-secret settings:

```dotenv
AI_PROVIDER=mock
OTP_PROVIDER=mock
AUTH_MODE=mock
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the local
Supabase CLI output, and set a long random server-only `AUTH_SESSION_SECRET` in
`apps/web/.env.local`. The configured mock institutional/profile persistence path
also requires the local service-role key. Never commit or report those values.

Next.js 15.5.27 was verified using its installed `@next/env.loadEnvConfig` without
starting the app. Process-exported variables take precedence over the app's
environment files; then `.env.development.local`, `.env.local`,
`.env.development`, `.env` are checked inside `apps/web`. Root `.env.local` is not
loaded by the documented filtered web command. Recheck the effective in-memory
environment before acceptance if files or shell exports change.

The mock OTP is `123456`. It is for local/demo acceptance only; it is not a real
SMS or Supabase Auth credential.

## 3. Start and reset the isolated database

Start only the local stack:

```bash
supabase start
```

The command may print local API keys. Keep that output private. After startup, check
the service state locally without copying the output into a report:

```bash
supabase status
```

Only for an explicitly intended fresh local environment, reset the disposable
database so migrations and configured seed files run in order. Do not reset an
already-prepared acceptance stack merely to rerun tests:

```bash
supabase db reset --local
```

The seed configuration runs `supabase/seed/seed.sql` followed by
`supabase/seed/003_institutional_seed.sql`. The first file contains seed comments;
the second contains the deterministic institutional data. Supabase CLI seed files
are configured directly in `sql_paths`; do not use a psql `\i` include command.
Reset is destructive to the local database and is safe only when the local target is
the intended disposable stack.

Verify migration connectivity and SQL lint:

```bash
supabase migration list --local
supabase db lint --local
```

The migration that must appear after reset is:

```text
20261009182617_complaint_lifecycle
```

It creates `complaint_status_history`, adds lifecycle columns, and installs the
service-role-only functions `update_complaint_lifecycle` and
`persist_complaint_with_emergency`.

The repository uses unique migration version prefixes. The parallel-development
duplicates were normalized without changing SQL order:

- `004_document_management.sql` → `004001_document_management.sql`
- `005_complaint_rls_and_cascade.sql` → `005001_complaint_rls_and_cascade.sql`
- `006_lost_found_vector_rpc.sql` → `006001_lost_found_vector_rpc.sql`

## 4. Fictional acceptance identities

The institutional seed provides deterministic fictional directory records. No
manual profile or duplicate identity table should be created.

| Purpose               | Institutional ID          | Expected authorization                               |
| --------------------- | ------------------------- | ---------------------------------------------------- |
| Student A             | `STU2026001`              | Own complaint rows only through the app projection   |
| Student B             | `STU2026002`              | Own complaint rows only through the app projection   |
| Five-owner regression | `STU2026001`–`STU2026005` | Five distinct student owners                         |
| Authorized staff      | `FAC1011`                 | Faculty with `HOD` and `DEPARTMENT_COORDINATOR` tags |

All test logins use OTP `123456`. The mock verification path provisions the linked
application profile on first successful login when the local Supabase directory is
configured. The server must derive identity from the signed HTTP-only application
cookie; requests must not be allowed to choose a `userId`, `complainant_id`, or
staff actor in the body.

Do not grant staff permissions to a student to make a test pass. If `FAC1011` is
not present after reset, stop and inspect the seed/migration state rather than
changing a student's role.

## 5. Acceptance fixture design

Use only fictional complaint data. Recommended shared-cluster text:

```text
Water leak beside the north library entrance is making the floor unsafe.
```

Create five reports with distinct owners and small wording variations that still
resolve to the same deterministic cluster, for example:

1. `STU2026001` — water leak beside the north library entrance.
2. `STU2026002` — leaking pipe making the north library entrance floor unsafe.
3. `STU2026003` — water pooling from a leak at the north library entrance.
4. `STU2026004` — north library entrance has a dangerous water leakage.
5. `STU2026005` — repeated water leak near the library entrance.

Use a second, unrelated complaint for the ordinary path, such as a fictional
projector issue in `CSE-204`. Do not reuse real student details, real phone numbers,
or real incident descriptions.

## 6. Acceptance procedure

### Authentication and ownership

1. Start the web app with the local `.env.local` configuration:

   ```bash
   pnpm --filter @smart-campus/web dev
   ```

2. In separate browser contexts, sign in as `STU2026001` and `STU2026002`.
3. For each user, verify institutional lookup shows only a masked phone number.
4. Request OTP, enter `123456`, and confirm a distinct HTTP-only session is issued.
5. Create one complaint per student.
6. Confirm each student can read their own complaint and cannot use a request-body
   identity to read or mutate another user's data.

### Staff lifecycle

1. Sign in as `FAC1011` in a separate browser context.
2. Confirm the staff queue is available from server-derived role/tag permissions.
3. Take ownership of a complaint and transition it through valid states, recording a
   non-empty note for `resolved` or `rejected`.
4. Confirm `complaint_status_history` records the server-derived actor and that the
   API projection does not expose the raw actor UUID.
5. Attempt the same `PATCH` as a student and expect `403`.
6. Attempt an invalid transition and expect `409`.
7. Attempt `resolved` or `rejected` without a note and expect validation failure.
8. Refresh as the owning student and confirm the status and response note persist.

### Five-owner emergency aggregation

1. Log in as each of `STU2026001` through `STU2026005` in isolated browser
   contexts, or use the equivalent route-level session fixtures.
2. Submit the five related reports using the fixture text above.
3. Confirm reports 1–4 remain normal and the fifth report triggers the configured
   emergency threshold for the cluster.
4. As each owner, confirm the response contains the global count/emergency state
   but only that owner's permitted complaint row and safe fields.
5. Confirm another owner's text, attachment references, ownership IDs, and raw
   actor IDs are not exposed.

### Atomic failure and attachments

1. In a disposable local database, force a persistence/RPC failure and confirm the
   request does not report success and leaves no partial emergency cascade.
2. Upload valid JPEG, PNG, WebP, and GIF bytes with matching declared MIME types.
3. Reject forged signatures, unsupported MIME types, oversized files, external URLs,
   unissued root-relative paths, and another owner's attachment reference.
4. New uploads use ignored `apps/web/.data/uploads/complaints`, with the public-shaped
   URL rewritten before static lookup to an owner/staff-authorized read route. Test
   anonymous and cross-owner byte reads as well as reference reuse. Keep the updated
   Next configuration loaded before testing.
5. Local files are not durable production storage. A dedicated attachment secret or
   domain-separated configured auth-secret fallback stabilizes tokens across route
   bundles; the offline process-global fallback still invalidates on process restart.
   Legacy public uploads are not automatically migrated or deleted and are rejected
   through the authorized complaint URL namespace.

## 7. Repository-level checks

Run the smallest focused checks first, then the required repository checks:

```bash
pnpm --filter @smart-campus/web exec vitest run \
  tests/complaint.test.ts \
  tests/complaint-attachment-security.test.ts \
  tests/complaint-lifecycle.test.ts \
  tests/auth-hardening.test.ts

pnpm test
pnpm typecheck
pnpm lint
pnpm --filter @smart-campus/web build
git diff --check
```

These commands validate application behavior, but they do not replace live RLS,
browser, or deployment checks. Keep local database command results separate from
the application test results:

```bash
supabase migration list --local
supabase db lint --local
```

Do not mark a check as passed when it was skipped because Docker, Postgres, the web
server, or an isolated test identity was unavailable.

## 8. Cleanup and reset

Remove only exact files/rows created by the current fixture run, where intended.
Keep pre-existing data and images. The Phase 6B walkthrough removed its own uploads
and temporary constraints but retained clearly fictional complaint/history rows for
inspection. Do not use a reset as routine acceptance cleanup. If the owner separately
intends to destroy all local test data, use only the local reset option:

```bash
supabase db reset --local
supabase stop
```

Remove `.env.local` only if it contains values created solely for this run. Never
remove or rewrite another developer's environment file without confirming its use.

If a hosted target was used accidentally, stop immediately, do not run further
mutations, and report the target and command to the project owner without including
credentials or data. Hosted migration application requires explicit confirmation
that the project is isolated, disposable, and populated only with fictional data.

## 9. Current verification record

The environment work for this repository has reached the following state:

| Check                                     | Result                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Docker daemon (`docker info`)             | PASS                                                                                      |
| Local Supabase startup (`supabase start`) | PASS after unique migration versions and direct seed paths were fixed                     |
| Local service status                      | PASS; expected containers running; health checks reported healthy where defined           |
| Local Postgres connectivity               | PASS at `127.0.0.1:54322`                                                                 |
| Local migration list                      | PASS; lifecycle migration `20261009182617` applied                                        |
| Local SQL lint                            | PASS; no schema errors found                                                              |
| Local seed verification                   | PASS; 50 institutional users, 7 departments, 7 programs, 19 tags, 6 acceptance identities |
| Remote migration application              | NOT RUN; remote isolation was not confirmed                                               |

The local Supabase stack, migration state, and fictional seed data are now ready for
the Complaint System acceptance walkthrough. Remote acceptance remains prohibited
until a separate hosted target is explicitly confirmed as isolated and disposable.

## 10. Known limitations

- The mock OTP flow is not a production authentication provider.
- Local complaint attachment storage uses a private filesystem/demo adapter and
  is not durable across an ephemeral deployment.
- The standalone Module 2 analyzer is not the canonical complaint submission path;
  submission uses deterministic lexical clustering.
- Browser multi-user acceptance requires a running web app and separate browser
  contexts. Unit tests do not prove browser cookie isolation or live RLS behavior.
- A remote Supabase target must never be treated as an acceptance environment until
  its owner confirms isolation and authorizes the migration workflow.
