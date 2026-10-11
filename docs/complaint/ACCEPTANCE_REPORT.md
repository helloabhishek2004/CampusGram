# CampusGram Complaint System — Phase 3 Acceptance Report

**Date:** 2026-10-10

**Branch:** `feature/lost-found-workflow`

**Scope:** Phase 3 live-integration and acceptance checks for the Complaint System.

**Safety boundary:** No migration was applied, no database data was mutated, no browser session was opened, and no secrets/tokens/cookies were printed.

## Executive result

**Phase 3 status: BLOCKED for live acceptance.**

The repository has a connected read-only Supabase target, but isolation and authorization to modify it were not verified. The target's migration history stops before `20261009182617_complaint_lifecycle`, and read-only inspection confirms that the new status-history table, lifecycle RPC, and atomic complaint-persistence RPC are not present there. Applying the migration without an explicit isolated-environment confirmation would violate the acceptance constraints, so it was not applied.

The local implementation remains healthy: focused complaint tests, the full test suite, typecheck, lint, production build, and diff checks pass. Live auth, lifecycle persistence, RLS acceptance, global aggregation against Supabase, attachment persistence, and browser E2E remain unverified.

### Final status summary

| Area                           | Status                         | Result                                                                                                                                   |
| ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2 documentation review   | PASS                           | Required documents read before testing.                                                                                                  |
| Working-tree protection        | PASS                           | Existing Lost & Found/shared changes preserved; no reset, clean, stash, branch switch, commit, or push.                                  |
| Migration static review        | PASS with live-lint limitation | SQL reviewed for additive schema, enum reuse, indexes, RLS, grants, and transaction scope. Local SQL lint could not connect to Postgres. |
| Supabase target discovery      | PASS — read-only only          | A linked remote target was queryable through Supabase tools; isolation was not proven.                                                   |
| Migration applied              | BLOCKED                        | Not applied anywhere. Remote migration history does not include the Phase 3 migration.                                                   |
| Local Complaint tests          | PASS                           | Focused tests pass.                                                                                                                      |
| Full automated tests           | PASS                           | 299 tests pass.                                                                                                                          |
| Typecheck                      | PASS                           | Recursive workspace typecheck passes.                                                                                                    |
| Lint                           | PASS with warnings             | No lint errors; existing warnings remain.                                                                                                |
| Production build               | PASS with warnings             | Web production build completes.                                                                                                          |
| Live authentication acceptance | BLOCKED                        | No verified isolated environment and no live mutation/session walkthrough.                                                               |
| Live lifecycle acceptance      | BLOCKED                        | Required migration/RPC is absent from the inspected remote target.                                                                       |
| Live global aggregation        | BLOCKED                        | Supabase repository path was not exercised against the remote target.                                                                    |
| Live RLS verification          | NOT RUN                        | No policy mutation or live authorization test performed.                                                                                 |
| Browser E2E                    | NOT RUN                        | Built-in browser had no tabs and no approved running acceptance environment.                                                             |

## 1. Environment and repository protection

### Required documents inspected

- `docs/complaint/IMPLEMENTATION_STATUS.md`
- `docs/complaint/MEMORY.md`
- `docs/complaint/STATUS.md`
- `ARCHITECTURE.md`
- `supabase/migrations/20261009182617_complaint_lifecycle.sql`
- `AGENTS.md`, `PROJECT_CONTEXT.md`, and `INTEGRATION_CONTRACT.md` for repository boundaries and shared contracts

### Existing worktree state

The branch already contained extensive unrelated, uncommitted Lost & Found and shared-documentation changes. They were preserved. The Complaint Phase 2 files and the new acceptance report were not used as a reason to reset or rewrite those changes.

No commit or push was performed.

### Environment discovery

- `.env.local`, `apps/web/.env.local`, and `.env.example` exist. Their contents were not printed or included in this report.
- `supabase status` reported that the project is not locally linked/running and could not inspect the local container.
- `docker ps` returned no running containers.
- `supabase migration list --local` could not connect to local Postgres at `127.0.0.1:54322`.
- The built-in browser reported no tabs. Browser E2E was therefore not attempted.

The Supabase MCP target was used only for read-only schema/migration inspection. The target may be a configured project, but its isolation from production/shared data was not independently established. No write operation was attempted.

## 2. Migration and RPC review

### Migration reviewed

`supabase/migrations/20261009182617_complaint_lifecycle.sql`

The migration is additive and reuses the existing `complaint_status` enum:

- Adds nullable `public.complaints.response_note`.
- Adds nullable `public.complaints.last_updated_by` referencing `public.profiles(id)`.
- Creates `public.complaint_status_history` with complaint/status/actor foreign keys, note, and timestamp.
- Adds an index on `(complaint_id, created_at DESC)`.
- Enables RLS on the history table.
- Revokes table access from `anon` and `authenticated`; grants it to `service_role`.
- Adds service-role-only `update_complaint_lifecycle(...)`.
- Adds service-role-only `persist_complaint_with_emergency(...)`.

### Static SQL conclusions

| Check                            | Status               | Evidence                                                                                                                    |
| -------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Existing enum reuse              | PASS                 | Functions use `complaint_status`; no incompatible enum value is introduced.                                                 |
| Backward-compatible columns      | PASS                 | `ADD COLUMN IF NOT EXISTS`; nullable fields preserve existing rows.                                                         |
| Repeated table/index application | PASS                 | `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` are used.                                                     |
| Repeated function application    | PASS                 | `CREATE OR REPLACE FUNCTION` is used.                                                                                       |
| History referential integrity    | PASS                 | Complaint and actor foreign keys are defined with deliberate delete behavior.                                               |
| Status transition enforcement    | PASS — source review | Allowed transition matrix and response-note requirement are enforced inside the lifecycle function.                         |
| Transactional lifecycle history  | PASS — source review | Complaint update and history insert occur within one function transaction.                                                  |
| Atomic emergency insert/cascade  | PASS — source review | The persistence function updates cluster peers and inserts the new complaint in one function transaction.                   |
| Public RPC execution             | PASS — source review | New functions revoke `PUBLIC`, `anon`, and `authenticated`; only `service_role` is granted.                                 |
| History table direct access      | PASS — source review | RLS enabled; `anon`/`authenticated` table privileges revoked.                                                               |
| Local SQL lint                   | BLOCKED              | `supabase db lint` could not connect because local Postgres is not running.                                                 |
| Live SQL lint                    | NOT RUN              | A linked target was not treated as safe to mutate or validate beyond read-only inspection because isolation was unverified. |

### Remote target read-only inspection

The remote target's migration list ended at `20261008050729_lost_found_revoke_anon`; it did not include `20261009182617_complaint_lifecycle`.

Read-only queries showed:

- `public.complaints`, `public.institutional_users`, and `public.profiles` exist.
- `public.complaint_status_history` does not exist.
- Only the existing `cascade_complaint_emergency(target_cluster_id text)` function is present among the queried complaint functions.
- Existing cascade execute privileges are `anon=false`, `authenticated=false`, `service_role=true`.
- Existing complaint policies include authenticated insert with `auth.uid() = complainant_id` and authenticated campus-wide select.
- Existing `public.complaints` does not yet expose `response_note` or `last_updated_by`.

These were read-only observations. No complaint rows, roles, policies, functions, tables, or migration history were changed.

## 3. Authentication and authorization acceptance

| Acceptance check                                    | Status                           | Evidence/blocker                                                                                                                                         |
| --------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Institutional ID lookup against configured source   | BLOCKED                          | Remote directory is queryable, but no isolated test identity/session flow was authorized for live acceptance.                                            |
| Dummy OTP `123456` creates signed HTTP-only session | PASS — local                     | `auth-hardening.test.ts` exercises the actual OTP verify route, cookie attributes, and resolver consumption.                                             |
| Session works with protected complaint endpoints    | PASS — local; BLOCKED live       | Mock-cookie route tests pass locally; configured Supabase complaint route was not exercised against a verified isolated project.                         |
| Missing/tampered/expired/future sessions rejected   | PASS — local                     | Auth hardening tests cover malformed, tampered, expired, future, and absent tokens.                                                                      |
| Client identity spoofing rejected                   | PASS — local                     | Complaint create overwrites caller `complainant_id`; student lifecycle mutation receives 403.                                                            |
| Student cannot perform staff mutation               | PASS — local; BLOCKED live       | `complaint-lifecycle.test.ts` covers student PATCH denial. Live role/session acceptance was not run.                                                     |
| Staff role exists in target                         | BLOCKED                          | Read-only aggregate directory inspection showed student/faculty/admin counts, but no staff identity was selected or used without isolation confirmation. |
| Lost & Found compatibility                          | PASS — local tests; NOT RUN live | Existing web/Lost & Found suites pass; no live shared-resolver walkthrough was performed.                                                                |

The mock authentication architecture was not replaced or weakened.

## 4. Complaint lifecycle acceptance

| Journey                                             | Status                                       | Evidence/blocker                                                                                                                         |
| --------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Student A submits                                   | PASS — local; BLOCKED live                   | Local route/repository tests pass. Remote lifecycle RPC is absent.                                                                       |
| Student B submits separately                        | PASS — local; BLOCKED live                   | Local owner-scoped tests pass.                                                                                                           |
| Each student sees only permitted complaint rows     | PASS — local; BLOCKED live                   | Global aggregation tests verify owner-only rows and sanitized fields locally. Live RLS/app projection was not exercised.                 |
| Authorized staff queue access                       | PASS — local source/tests; BLOCKED live      | Existing server-derived role/tag predicate is used; no isolated staff session was available.                                             |
| Valid staff transitions                             | PASS — local; BLOCKED live                   | Tests cover under-review, in-progress, resolved, ownership, notes, and status history in memory. Live RPC absent.                        |
| Invalid transitions rejected                        | PASS — local; BLOCKED live                   | Tests cover invalid transition responses. Live database function not installed.                                                          |
| Resolution/rejection requires note                  | PASS — local; BLOCKED live                   | Route/repository tests pass; SQL function source enforces the same rule but is unapplied.                                                |
| Student sees status/note after refresh              | PASS — local; BLOCKED live                   | Detail route reads status history locally; no live persistence/read-back.                                                                |
| History actor attribution                           | PASS — local; BLOCKED live                   | In-memory test asserts staff actor history; live history table absent.                                                                   |
| Database failure avoids false success/partial state | PASS — source/local error path; BLOCKED live | Create route does not return success on persistence error; atomic RPC is uninstalled in remote target and failure injection was not run. |

## 5. Global emergency aggregation

| Check                                            | Status       | Evidence/blocker                                                                          |
| ------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------- |
| Reports 1–4 remain normal                        | PASS — local | Complaint threshold tests pass.                                                           |
| Fifth report triggers emergency                  | PASS — local | Threshold/cascade tests pass.                                                             |
| Five separate owners                             | PASS — local | Global aggregation regression uses separate owner IDs.                                    |
| Student sees only own row(s)                     | PASS — local | Owner projection tests pass.                                                              |
| Visible row carries global count/emergency state | PASS — local | Student projection receives cluster-wide count/status.                                    |
| Other owners' text/IDs/attachments absent        | PASS — local | API projection and owner-only tests pass.                                                 |
| Summary counts consistent                        | PASS — local | Threshold tests verify global counts.                                                     |
| Supabase repository path                         | BLOCKED      | No Phase 2 migration applied and no live mutation allowed without isolation confirmation. |
| Cascade failure leaves no partial state          | BLOCKED      | Atomic RPC source reviewed but not installed or failure-injected.                         |

## 6. Attachment acceptance

| Check                                  | Status                                   | Evidence/blocker                                                                                                                                 |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| JPEG/PNG/WebP/GIF signature validation | PASS — local helper/upload tests         | Server-side magic-byte checks are covered for representative supported content; full four-format upload matrix remains a manual acceptance item. |
| Incorrect signatures                   | PASS — local                             | Forged image bytes rejected.                                                                                                                     |
| Unsupported MIME                       | PASS — local                             | Unsupported declared types rejected.                                                                                                             |
| Oversized files                        | PASS — source/tested boundary            | Existing size limit remains 5 MB; live deployment not tested.                                                                                    |
| External URLs                          | PASS — local                             | Complaint create rejects external references.                                                                                                    |
| Unissued root-relative paths           | PASS — local                             | Complaint create rejects unissued references.                                                                                                    |
| Another owner's reference              | PASS — local                             | Owner binding rejects reuse.                                                                                                                     |
| Missing/deleted file                   | PASS — source/helper; NOT RUN deployment | Reference validation checks file existence/size; restart/deployment behavior was not run.                                                        |
| Durable storage                        | FAIL for production requirement          | Implementation remains local filesystem/demo storage by design. No durable-storage claim is made.                                                |

## 7. Automated verification

Executed from repository root:

| Exact command                                                                                                                                                                        | Result                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `pnpm --filter @smart-campus/web exec vitest run tests/complaint.test.ts tests/complaint-attachment-security.test.ts tests/complaint-lifecycle.test.ts tests/auth-hardening.test.ts` | PASS — focused suites passed.                              |
| `pnpm --filter @smart-campus/complaint-intelligence test`                                                                                                                            | PASS — 14 tests.                                           |
| `pnpm test`                                                                                                                                                                          | PASS — 299 tests across participating workspaces.          |
| `pnpm typecheck`                                                                                                                                                                     | PASS.                                                      |
| `pnpm lint`                                                                                                                                                                          | PASS with warnings; no errors.                             |
| `pnpm --filter @smart-campus/web build`                                                                                                                                              | PASS with warnings.                                        |
| `pnpm --filter @smart-campus/web typecheck`                                                                                                                                          | PASS.                                                      |
| `supabase db lint`                                                                                                                                                                   | BLOCKED — local Postgres unavailable at `127.0.0.1:54322`. |
| `git diff --check`                                                                                                                                                                   | PASS.                                                      |

## 8. Browser E2E and RLS

### Browser E2E

**NOT RUN.** The built-in browser had no tabs, and no approved running isolated acceptance environment was available. No browser login, multi-user walk-through, viewport check, or live complaint flow is claimed.

### RLS

**NOT VERIFIED live.** Read-only inspection confirmed the current remote complaint policies, but the Phase 2 migration was not applied and no authenticated/unauthenticated policy test was executed against a verified isolated database.

## 9. Defects found and fixes

No new live integration defect was fixed because live mutation/acceptance was blocked by the missing isolation confirmation and unapplied migration.

The Phase 2 implementation was revalidated locally. No additional application source changes were required during Phase 3 acceptance. The only Phase 3 deliverable is this report.

## 10. Remaining blockers and exact next steps

1. **Isolation confirmation required:** Confirm that the configured Supabase target is a disposable, fictional-data test project and not production/shared. Do not provide credentials or tokens in chat.
2. Apply the migration through the repository's normal Supabase migration workflow only after that confirmation.
3. Re-run read-only migration/RPC/grant inspection and local/remote SQL lint.
4. Perform two fictional student sessions and one authorized staff session using OTP `123456`.
5. Run the lifecycle, five-owner emergency, atomic failure, attachment ownership, and RLS checks against that isolated target.
6. Complete browser E2E using a running app configured against the same isolated target.
7. If the environment has no authorized staff identity, seed/configure one through the approved fictional test-data process; do not grant staff privileges to a student.

## Updated maturity classification

**Level 3 — Integrated hackathon system, live acceptance blocked.**

Local integration evidence supports Level 3 behavior for the mock/in-memory path. The system is not Level 4 or production-ready because the Phase 2 migration/RPC is absent from the inspected remote target, live RLS/auth/lifecycle persistence is unverified, browser E2E was not run, and attachment storage remains non-durable local filesystem storage.

## Phase 4 setup addendum — 2026-10-10

Phase 4 continued the acceptance work without mutating the configured remote target.
The reproducible setup guide is now available at
`docs/complaint/TEST_ENVIRONMENT_SETUP.md`.

### Setup changes

- Corrected `supabase/config.toml` so the configured seed path points to the existing
  `supabase/seed/seed.sql` file.
- Removed the duplicate `AUTH_SESSION_SECRET` entry from `.env.example`; the
  template now documents one server-only session-secret variable.
- Documented the local ports, mock environment, fictional acceptance identities,
  five-owner fixture, lifecycle checks, attachment checks, cleanup, and exact
  limitations.

### Phase 4 checks actually run

| Exact command/check                             | Result                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `docker info`                                   | PASS; Docker daemon responded.                                                                          |
| `supabase start`                                | BLOCKED; first attempt exceeded 120 seconds and a retry failed without producing a running local stack. |
| `docker ps --format '{{.Names}}\\t{{.Status}}'` | PASS as an observation; no local Supabase containers were running after the failed startup.             |
| `supabase migration list --local`               | BLOCKED; connection refused at `127.0.0.1:54322`.                                                       |
| `supabase db lint --local`                      | BLOCKED; connection refused at `127.0.0.1:54322`.                                                       |
| Remote migration/schema mutation                | NOT RUN; isolation was not confirmed.                                                                   |

No migration was applied, no seed data was loaded, no hosted row or policy was
changed, and no credential/key/cookie output was added to the repository.

### Phase 4 status

**BLOCKED for live acceptance.** The next concrete step is to make the local
Supabase stack start successfully, then run `supabase db reset`, verify
`20261009182617_complaint_lifecycle` in `supabase migration list --local`, and run
local SQL lint before beginning the fictional multi-user walkthrough. Until then,
the existing Phase 3 local-only acceptance results remain valid, but live
authentication, RLS, lifecycle persistence, global aggregation, atomic failure, and
browser E2E remain unverified.

## Phase 5 diagnosis and local startup addendum — 2026-10-10

Phase 5 diagnosed and repaired the local-only startup path. No remote Supabase
project was connected to or mutated.

### Root causes

1. Three migration version prefixes were duplicated by parallel development:
   `004`, `005`, and `006`. The first debug startup failed at the second `004`
   migration with:
   `duplicate key value violates unique constraint "schema_migrations_pkey"`.
2. After migration versions were made unique, startup reached seeding and failed
   because `supabase/seed/seed.sql` used the psql-only `\i` command. Supabase CLI's
   configured seed runner sends each configured SQL file directly and does not parse
   psql meta-commands.

### Minimal fixes

- Renamed only the duplicate migration filenames, preserving SQL and execution order:
  - `004_document_management.sql` → `004001_document_management.sql`
  - `005_complaint_rls_and_cascade.sql` → `005001_complaint_rls_and_cascade.sql`
  - `006_lost_found_vector_rpc.sql` → `006001_lost_found_vector_rpc.sql`
- Updated `[db.seed].sql_paths` to run the two existing files directly:
  - `./seed/seed.sql`
  - `./seed/003_institutional_seed.sql`
- Removed the unsupported `\i` line from `supabase/seed/seed.sql`.

### Commands and actual results

| Exact command/check                     | Result                                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase --version`                    | `3.0.0-next.4`                                                                                                                                             |
| `docker info`                           | PASS                                                                                                                                                       |
| `docker ps -a` before fix               | No containers running or exited                                                                                                                            |
| `ss -ltnp`                              | No conflicts on ports `54320`–`54324`, `54327`, or `54329`                                                                                                 |
| `df -h .` / `free -h`                   | 73 GiB available; 8.2 GiB memory available                                                                                                                 |
| Migration version uniqueness check      | PASS; no duplicate version prefixes remain                                                                                                                 |
| Seed path/readability check             | PASS; both configured SQL files exist and are readable                                                                                                     |
| `supabase start` before fixes           | FAIL at duplicate migration version `004`                                                                                                                  |
| `supabase start` after migration rename | FAIL at seed `\i` syntax                                                                                                                                   |
| `supabase start` after both fixes       | PASS                                                                                                                                                       |
| `supabase status -o json`               | PASS; local status command exited 0                                                                                                                        |
| Docker service inspection               | PASS; 12 expected containers running; health checks healthy where defined                                                                                  |
| `curl .../auth/v1/health`               | HTTP 200                                                                                                                                                   |
| `supabase db reset --local --yes`       | PASS                                                                                                                                                       |
| `supabase migration list --local`       | PASS; `20261009182617` lifecycle migration applied                                                                                                         |
| `supabase db lint --local`              | PASS; no schema errors found                                                                                                                               |
| Local verification query                | PASS; history table and both lifecycle RPCs exist; 50 institutional users, 7 departments, 7 programs, 19 tags, and 6 acceptance fixture identities present |

The local migration and seed reset are now repeatable. The seed verification used
counts and fictional institutional IDs only; raw phone values and keys were not
printed. No remote migration, reset, seed, row, policy, or schema mutation was
performed.

### Remaining blockers

- The browser multi-user Complaint acceptance walkthrough has not yet been run.
- Live RLS and hosted persistence remain unverified because remote isolation was not
  confirmed and remote mutation remains prohibited.
- Attachment storage remains the existing local/demo filesystem implementation and
  is not a production durability claim.

## Phase 6B — Executed local acceptance (2026-10-11)

**Result: PASS for the executed local API/database scenarios after focused fixes;
BLOCKED for browser E2E. This is not a production-readiness or warning-free claim.**

### Target, baseline, and environment gate

- Branch: `feature/lost-found-workflow`; starting HEAD `9d5379e`.
- The worktree was clean at the start of this phase. Previously developed Complaint,
  Lost & Found, migration-renaming, and seed/configuration work was already present
  in that baseline and was preserved. This phase made no commits, branch switches,
  pushes, resets, stashes, or destructive Docker cleanup.
- Installed Next.js version: **15.5.27**. A temporary diagnostic resolved its own
  installed `@next/env` and invoked `loadEnvConfig(apps/web, true, ...)`, without
  loading config/route handlers or booting a server. Production-mode loading was
  checked separately and passed too.
- Loader precedence: inherited process variables, `.env.development.local`,
  `.env.local`, `.env.development`, `.env` within `apps/web` (production uses the
  corresponding production filenames). The loader does not read parent/root env
  files. Only `apps/web/.env.local` was loaded on this run; none of the required
  variables came from an inherited process override.
- Effective URL was exactly `http://127.0.0.1:54321`. Anon/service-role credentials
  matched local `supabase status` in memory. Session secret was nonempty, auth/OTP/AI
  modes were `mock`, and app URL was `http://localhost:3000`. No configured nonlocal
  database/storage/AI endpoint was found in the effective app environment.
- Values, prefixes, hashes, cookies, and authorization headers were not included in
  reports. The ignored app environment file was not changed in this phase.
- Local Auth health returned HTTP 200. Migration `20261009182617`, history table,
  and both complaint RPCs were present before writes. Initial complaint count was 0.
- No hosted Supabase project was contacted or mutated. All test database clients used
  the verified loopback URL or the named local Docker PostgreSQL container. No reset,
  migration application, or institutional seed rerun occurred in this phase.
- Web startup: `NEXT_TELEMETRY_DISABLED=1 pnpm --filter @smart-campus/web dev`.
  `/login` and `/complaints` returned HTTP 200 at `http://localhost:3000`.

### Scenario results — executed versus unverified

| Scenario                                  | Status                               | Executed evidence                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Six fictional identities                  | PASS                                 | Institutional lookup, OTP send/verify, HTTP-only cookie, and canonical profile link for `STU2026001`–`STU2026005` and `FAC1011`; six different linked profile IDs.                                                                                                                            |
| Unauthenticated/spoofed requests          | PASS                                 | Complaint create/upload without a cookie returned 401 even with body ownership/role fields.                                                                                                                                                                                                   |
| Expired/tampered/canonical-spoof sessions | PASS                                 | Live complaint requests returned 401 for modified signatures, signed expired payloads, wrong linked profile, and unknown directory identity.                                                                                                                                                  |
| Inactive session                          | PASS                                 | Temporarily disabled fictional Student B, observed 401, restored its original active state in `finally`.                                                                                                                                                                                      |
| Server-derived creation and contract      | PASS                                 | Submitted Student A complaint while naming Student B in body; database owner remained Student A. Response passed shared Zod schema and text/cluster matched local DB read-back.                                                                                                               |
| Owner/privacy projection                  | PASS                                 | Owner detail succeeded; Student B detail returned 404 and its feed excluded A's row. Complaint/history responses omitted raw ownership, assignment, and actor columns.                                                                                                                        |
| Validation/no partial records             | PASS                                 | Short text, invalid category, external attachment URL, and unissued reference returned 400; complaint count unchanged.                                                                                                                                                                        |
| Five-owner threshold                      | PASS                                 | Five different profile owners and five different complaint records in one cluster. Counts 1–4 were normal; fifth creation and stored peers were emergency.                                                                                                                                    |
| Global count before student projection    | PASS                                 | Each owner's emergency feed contained exactly its one permitted row with `similar_count=5`; owner detail returned no other owners' peer rows.                                                                                                                                                 |
| Staff queue and all transition edges      | PASS                                 | Authorized faculty fixture could view eligible rows and execute all documented transition edges. 12 transitions on one complaint persisted actor attribution, response notes, ownership, and history.                                                                                         |
| Invalid transitions/required notes        | PASS                                 | Submitted→in_progress rejected; rejection without a note rejected; fresh in_progress complaint could not resolve without a note.                                                                                                                                                              |
| Forged staff mutation                     | PASS                                 | Student PATCH returned 403 even with forged role/actor fields.                                                                                                                                                                                                                                |
| Emergency RPC rollback                    | PASS                                 | A duplicate-PK insert failed after attempting an emergency cascade; peer emergency state, text, and update timestamp remained unchanged.                                                                                                                                                      |
| Lifecycle/history rollback                | PASS                                 | A temporary local history check constraint failed after the complaint update; status, note, timestamp, and history count all rolled back. Transaction-local constraint was rolled back too.                                                                                                   |
| API-level DB failures                     | PASS after fix                       | Temporary sentinel constraints induced real create/lifecycle RPC failures. HTTP 500 reported no success and did not expose SQL/constraint details; no failed create row or partial lifecycle/history persisted. Both constraints were removed in `finally`, and catalog cleanup was verified. |
| JPEG/PNG/WebP/GIF signature matrix        | PASS                                 | Live upload route accepted supported magic-byte fixtures and rejected forged bytes, MIME mismatch, and >5 MB input. These are signature tests, not full decoder validation of every image format.                                                                                             |
| Issued attachment ownership               | PASS after fix                       | Fresh owner upload could be attached; another owner could not reuse it. Owner/staff reads returned exact PNG bytes, Student B 403, anonymous 401; forged/missing references rejected.                                                                                                         |
| Legacy public byte bypass                 | PASS after fix                       | Existing tracked `.jpeg` initially returned anonymous 200. The `beforeFiles` rewrite now sends that namespace through auth before static lookup; the same URL returned 401. Existing tracked images were not moved/deleted.                                                                   |
| Browser workflow                          | BLOCKED                              | Built-in `browser_open` timed out; subsequent `browser_tabs` returned no tab. No login, form, modal, validation display, visual attachment, or staff UI action was performed in a browser. Browser E2E NOT RUN.                                                                               |
| UI global-count display                   | PASS — model; NOT VERIFIED — browser | Subsequently fixed to use global `similar_count`, while inspection/modal counts describe visible permitted rows. Two regressions pass for owner-visible 1/global 5 and staff-visible 5/global 5. Browser rendering was not exercised.                                                         |
| Direct authenticated-JWT RLS              | NOT VERIFIED                         | Mock cookies are not Supabase Auth JWTs; the app uses an authorized service-role path. Read-only grants confirmed lifecycle RPC executes only for service_role, not anon/authenticated. This is not a full JWT/RLS walkthrough.                                                               |
| Concurrency/replay/deployment durability  | NOT VERIFIED                         | Serial acceptance does not establish concurrent cluster assignment, replay idempotency, or durable hosting storage.                                                                                                                                                                           |

### Defects reproduced and fixed

1. **Public attachment bytes bypassed ownership.** Owner-bound upload references
   prevented reuse but public static serving allowed another student to download the
   bytes. New files now live in ignored `apps/web/.data/uploads/complaints`; the
   existing URL is rewritten before static file lookup to an authenticated route.
   Owner/staff checks, byte signature/size validation, path restrictions, and
   private/no-store/nosniff headers protect reads. Existing legacy assets are rejected
   through the complaint namespace, not silently migrated or deleted.
2. **Attachment keys differed across route bundles.** A module-local random fallback
   failed real upload→create/read across newly compiled Next routes. Dedicated
   attachment-secret precedence is retained; configured auth-secret fallback uses a
   domain-separated key. Offline random state is shared across module reloads within
   one process. Fresh-upload HTTP retest passed after this fix.
3. **Lifecycle DB error details leaked.** Real failing history insertion exposed the
   PostgreSQL constraint message in PATCH response. User-facing persistence/transition
   errors now use fixed safe sentences. Failure-injection retest passed.

New regression suites: `complaint-attachment-read.test.ts` (21),
`complaint-attachment-token-key.test.ts` (5),
`complaint-attachment-routing.test.ts` (7), and `complaint-lifecycle-rpc.test.ts` (9).
The existing attachment-storage assertion was updated to enforce non-public storage.

### Phase 6B command receipts

| Command                                                                                                                                                                                                                                                                                                                                                    | Result                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node /tmp/omnirush/phase6-env-gate.cjs`                                                                                                                                                                                                                                                                                                                   | PASS; installed Next environment loader, local-status credential comparison and development gate.                                                            |
| `node /tmp/omnirush/phase6-env-gate.cjs production`                                                                                                                                                                                                                                                                                                        | PASS; production environment gate.                                                                                                                           |
| `NEXT_TELEMETRY_DISABLED=1 pnpm --filter @smart-campus/web dev`                                                                                                                                                                                                                                                                                            | PASS; local web server launched.                                                                                                                             |
| `curl --max-time 60 -sS -o /dev/null -w 'LOGIN_HTTP=%{http_code}\n' http://localhost:3000/login`                                                                                                                                                                                                                                                           | HTTP 200.                                                                                                                                                    |
| `curl --max-time 60 -sS -o /dev/null -w 'COMPLAINTS_HTTP=%{http_code}\n' http://localhost:3000/complaints`                                                                                                                                                                                                                                                 | HTTP 200.                                                                                                                                                    |
| `node /tmp/omnirush/phase6-live.cjs`                                                                                                                                                                                                                                                                                                                       | Initial 16 live check groups: 15 PASS, 1 FAIL (public cross-owner attachment bytes).                                                                         |
| `node /tmp/omnirush/phase6-attachment-retest.cjs`                                                                                                                                                                                                                                                                                                          | Final fresh-upload retest: 15 assertions PASS, 0 FAIL, including live byte equality and read ownership.                                                      |
| `docker exec -i supabase_db_campus-hackthon psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/omnirush/phase6-atomic-history.sql`                                                                                                                                                                                                                  | PASS; injected history failure rolled back complaint/history, test constraint removed.                                                                       |
| `supabase db query --local --file /tmp/omnirush/phase6-atomic-history.sql`                                                                                                                                                                                                                                                                                 | Initial diagnostic failed because CLI uses a single prepared statement; no SQL batch executed. Used local container psql for the transaction instead.        |
| `node /tmp/omnirush/phase6-api-errors.cjs`                                                                                                                                                                                                                                                                                                                 | Final 5 PASS assertions: generic create/lifecycle errors, no insert, lifecycle rollback, constraint cleanup.                                                 |
| `pnpm --filter @smart-campus/web exec vitest run tests/complaint.test.ts tests/complaint-attachment-security.test.ts tests/complaint-attachment-read.test.ts tests/complaint-attachment-token-key.test.ts tests/complaint-attachment-routing.test.ts tests/complaint-lifecycle.test.ts tests/complaint-lifecycle-rpc.test.ts tests/auth-hardening.test.ts` | PASS — 74 tests, 8 files.                                                                                                                                    |
| `pnpm test`                                                                                                                                                                                                                                                                                                                                                | PASS — 341 tests (contracts 32, complaint intelligence 14, Lost & Found 31, web 264).                                                                        |
| `pnpm typecheck`                                                                                                                                                                                                                                                                                                                                           | PASS.                                                                                                                                                        |
| `pnpm lint`                                                                                                                                                                                                                                                                                                                                                | PASS with existing warnings; image optimization, unrelated any/unused args, and next lint deprecation remain.                                                |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build`                                                                                                                                                                                                                                                                                                                     | PASS with image optimization warnings.                                                                                                                       |
| `supabase migration list --local`                                                                                                                                                                                                                                                                                                                          | PASS; lifecycle migration applied. The CLI table's “Remote” column in this --local invocation refers to the local queried database, not a hosted connection. |
| `supabase db lint --local`                                                                                                                                                                                                                                                                                                                                 | PASS — no schema errors.                                                                                                                                     |
| Local catalog/readback query                                                                                                                                                                                                                                                                                                                               | PASS — history/RPCs present, lifecycle execute grants anon=false/authenticated=false/service_role=true, no phase6 injection constraints remain.              |
| `git diff --check`                                                                                                                                                                                                                                                                                                                                         | PASS.                                                                                                                                                        |

### Fixture and runtime cleanup

- Only six fictional seeded identities were used. Student B's active state was
  restored. Canonical auth/profile links created by the supported login path remain
  in the disposable local database.
- Ten fictional complaint records and 14 history entries remain as acceptance data;
  they are not production data. No database reset was used to hide a failure.
- Exact upload files created by these scripts were removed after byte/missing-file
  checks. Existing six tracked legacy images were untouched. Some retained fictional
  complaint rows reference deliberately removed test uploads; this is not a storage
  durability result.
- Temporary diagnostics were kept outside the workspace, printed only check labels,
  and are removed after final verification. Private server logs are not copied into
  repository evidence.

### Next safe actions

1. Complete the blocked browser multi-user walkthrough, including the global count
   badge and visible-versus-global peer count wording. Do not call HTTP page health
   browser E2E.
2. The UI count concern was subsequently fixed before integration: the badge uses
   authoritative `similar_count`, and group/modal counts describe only permitted
   rows. Two pure-model regressions passed; actual browser rendering remains unverified.
3. Keep local-only env in place and keep secrets out of commits. Hosted Supabase was
   not part of Phase 6B; no hosted acceptance result is claimed.
4. The user subsequently explicitly authorized committing the fixes/warning cleanup
   and merging `feature/lost-found-workflow` into local `main`, without pushing.
   Earlier no-commit statements above describe the acceptance phase before that
   authorization, not a denial of the later integration request.

### Authorized integration preparation

- UI image warnings were resolved with `next/image`, using `unoptimized` for direct
  authenticated/blob/base64 rendering rather than introducing optimizer requests.
- Local-store/worker `any` and unused-argument warnings were removed with explicit
  domain types. Typed pg-boss dispatch adapts fetched job arrays and `data` to domain
  jobs, preserving metadata and propagating processing errors for retry. Two mocked
  dispatch regressions passed; no live worker job was dispatched.
- The web lint script now uses the installed ESLint supported API with existing
  rules/coverage, avoiding the deprecated `next lint` and legacy CLI entrypoint.
  No lint rules were disabled to make checks green.
- `pnpm lint`: PASS, no warnings/deprecation messages.
- `pnpm test`: PASS, **345 tests** (contracts 32, complaint intelligence 14,
  Lost & Found 31, web 268).
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS, no source/lint warnings. The first changed-cache rebuild emitted
  two Webpack serialization performance advisories; this is not disguised as a
  fully warning-free cold-build guarantee.
- Browser E2E remains BLOCKED/NOT RUN. Integration and clean-tree checks are recorded
  separately after the local merge.
