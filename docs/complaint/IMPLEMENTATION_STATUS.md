# Complaint System — Phase 2 Implementation Status

**Date:** 2026-10-09

**Scope:** Safe local implementation of the Complaint System Phase 2 plan.

**Phase 2 verification:** No live Supabase mutation was performed during Phase 2.
**Latest local verification (2026-10-11):** Phase 6B executed local Supabase-backed
authentication, ownership, five-owner aggregation, lifecycle/history, safe rollback,
and attachment acceptance. See `ACCEPTANCE_REPORT.md` for precise results and fixes.
Fresh rerun on `main` at `65c06fc` passed 10 live scenario groups, 76 focused tests
and 346 full-suite tests without new application changes. Hosted Supabase and
browser E2E remain unverified: the latest browser attempt opened successfully but
awaits user completion of the sensitive OTP handoff; the earlier attempt timed out.

## Outcome

The complaint module now has a secured mock-session boundary, global cluster aggregation with owner-only row projection, a server-enforced staff lifecycle, stronger attachment references, truthful deterministic-clustering wording, and regression coverage for the changed paths.

The intended authentication flow remains:

```text
Institutional ID
  → institutional directory lookup
  → dummy OTP 123456
  → signed HTTP-only mock application cookie
  → server-derived identity
  → route-level authorization
```

`AUTH_MODE=mock` is still a demo/hackathon mechanism. With configured Supabase, `AUTH_SESSION_SECRET` or the server-only service-role key is required for stable session signing; the public anon key is not used as a signing secret.

## Audit findings addressed

| Audit finding                                   | Phase 2 result                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-02 — Configured OTP/session mismatch         | `resolveServerIdentity()` now treats the signed application cookie as authoritative in explicit mock mode, even when Supabase URL/key are configured. Real Supabase mode requires a canonical `institutional_users.linked_profile_id`; metadata alone is not authorization. |
| P1-03 — Viewer-scoped emergency counts          | Repository computes cluster counts/status and summary counts from the full authoritative dataset before applying a student's owner-only row projection. Student API responses omit raw ownership actor IDs.                                                                 |
| P1-01 — Lifecycle stops at submitted            | Added authorized `PATCH /api/complaints/[id]`, transition validation, take-ownership support, response/resolution notes, staff queue access through the existing list route, and status history persistence design.                                                         |
| P2-01/P3-03 — Misleading AI wording             | Submission UI now says deterministic text similarity/grouping rather than AI similarity. Module 2 provenance and standalone behavior are truthful.                                                                                                                          |
| P2-03 — Non-atomic emergency write              | Added an additive service-role RPC migration that atomically cascades existing cluster rows and inserts the new complaint. It is pending application to the configured database.                                                                                            |
| P2-05 — Unverified attachments                  | Uploads now require JPEG/PNG/WebP/GIF magic-byte agreement, use safe generated filenames, bind opaque references to the authenticated owner, and reject arbitrary external/root-relative references. Local disk remains demo storage.                                       |
| P2-06 — Runtime response validation             | Supabase rows and complaint API records are parsed through shared Zod schemas at the repository/API boundaries.                                                                                                                                                             |
| P2-08 — Intelligence provenance/demo candidates | Explicit Gemini without a key fails closed; model output/error fragments are sanitized; model cluster matches are recomputed from explicitly supplied candidates; default demo candidates are removed.                                                                      |
| P3-01 — Empty analysis IDs                      | Module 2 validation now rejects empty `complaint_id` values without changing the shared contract shape.                                                                                                                                                                     |

## Files changed

### Complaint implementation

- `apps/web/lib/complaints/complaint-repository.ts` — global aggregates, typed row mapping, lifecycle transitions, in-memory history, atomic Supabase RPC call.
- `apps/web/lib/complaints/complaint-permissions.ts` — shared server-side staff capability predicate.
- `apps/web/lib/complaints/complaint-projection.ts` — API projection that removes raw actor IDs.
- `apps/web/lib/complaints/attachment-security.ts` — signature checks, safe local paths, owner-bound opaque attachment tokens.
- `apps/web/app/api/complaints/route.ts` — sanitized/validated list/create responses and strict query validation.
- `apps/web/app/api/complaints/[id]/route.ts` — sanitized detail response and authorized lifecycle `PATCH`.
- `apps/web/app/api/complaints/upload/route.ts` — actual byte validation and owner-bound upload references.
- `apps/web/app/complaints/page.tsx` — lifecycle/status/response-note UI for authorized staff and truthful deterministic-clustering copy.
- `packages/contracts/src/complaint.ts` — additive lifecycle request and optional lifecycle fields.

### Authentication and intelligence

- `apps/web/lib/auth/server-identity.ts`
- `apps/web/lib/auth/identity-service.ts`
- `apps/web/app/api/auth/otp/verify/route.ts`
- `apps/web/app/api/auth/session/route.ts`
- `.env.example`
- `modules/complaint-intelligence/src/index.ts`
- `modules/complaint-intelligence/src/ai/gemini.ts`
- `modules/complaint-intelligence/src/ai/prompts.ts`
- `modules/complaint-intelligence/src/ai/schemas.ts`
- `modules/complaint-intelligence/src/clustering/match.ts`
- `modules/complaint-intelligence/src/validation/input.ts`

### Tests and migration

- `apps/web/tests/complaint.test.ts` — updated ownership/attachment expectations and global aggregation regressions.
- `apps/web/tests/complaint-attachment-security.test.ts` — signatures, paths, owner binding, and upload references.
- `apps/web/tests/complaint-lifecycle.test.ts` — student denial, valid/invalid transitions, notes, actor history, and owner read-back.
- `apps/web/tests/auth-hardening.test.ts` — OTP cookie consumption, tampering/expiry, configured canonical links, and spoofing boundaries.
- `modules/complaint-intelligence/tests/validation.test.ts`
- `modules/complaint-intelligence/tests/provider-regressions.test.ts`
- `supabase/migrations/20261009182617_complaint_lifecycle.sql` — additive fields/history and service-role-only atomic lifecycle/complaint-persistence functions.

Pre-existing Lost & Found and shared-documentation changes were not reset, cleaned, or overwritten.

## Lifecycle rules

Server-side transitions are:

```text
submitted    → under_review | rejected
under_review → in_progress | rejected
in_progress  → under_review | resolved | rejected
resolved     → under_review   (reopen)
rejected     → under_review   (reopen)
```

Resolving or rejecting requires a non-empty response note. Authorized staff may set `take_ownership=true`; the server uses the authenticated staff identity and never accepts an arbitrary actor ID from the request. Students can read their own status and response note but cannot mutate lifecycle state.

## Checks run

Final checks after the Phase 2 lifecycle, UI, privacy, and attachment edits:

- `pnpm test` — **PASS**, 299 tests across the participating workspaces (contracts 32, Lost & Found 31, Complaint Intelligence 14, web 222).
- `pnpm typecheck` — **PASS** across workspaces.
- `pnpm lint` — **PASS with warnings**, no lint errors. Existing warnings include Next.js `next lint` deprecation, dynamic `<img>` warnings, and unrelated Lost & Found/worker `any`/unused-argument warnings.
- `pnpm --filter @smart-campus/web build` — **PASS with warnings**, production bundle and complaint routes generated successfully.
- `pnpm --filter @smart-campus/web exec vitest run tests/complaint.test.ts tests/complaint-attachment-security.test.ts tests/complaint-lifecycle.test.ts` — **PASS**, 25 tests.
- `pnpm --filter @smart-campus/web typecheck` — **PASS**.
- `git diff --check` — **PASS**.

No live Supabase, RLS, browser E2E, two-user deployment, or migration-application check was run.

## Remaining limitations and blockers

1. The lifecycle migration/RPC is applied and tested on local Supabase, including
   safe rollback failure injection. Hosted deployment is not verified and must not
   be mutated without separate authorization.
2. New local/demo complaint attachments use private `.data/uploads/complaints` storage (relative to the web app), not the Next.js public directory. The existing `/uploads/complaints/[filename]` URL is rewritten in Next's `beforeFiles` phase to the authenticated, dynamic `/api/complaints/attachments/[filename]` GET handler, before any public static asset lookup. The handler uses `resolveServerIdentity()` and `canManageComplaints()`: only the token-bound owner or authorized complaint staff can read verified private image bytes. All handler responses are `private, no-store`; invalid tokens, filename/extension mismatches, missing files, invalid image bytes, and file symlinks fail closed. Existing public uploads are not moved, deleted, or migrated: legacy unsupported/unissued `.jpeg` references return 401 anonymously or 404 when authenticated rather than exposing static bytes through the complaint URL namespace. This does not restore legacy owner access. The rewrite requires the active server to load the updated Next configuration; independently hosted static copies need separate operator review. Local disk is not durable in serverless/ephemeral hosting. Attachment keys prefer server-only `COMPLAINT_ATTACHMENT_TOKEN_SECRET` with its existing derivation; otherwise they use a domain-separated HMAC-SHA256 derivation from `AUTH_SESSION_SECRET`. Neither configured secret is required offline: a random process-global fallback is shared across route bundles/module reloads, but does not survive a process restart or work across separate processes. Stable configured secrets must agree across instances; changing the effective key invalidates previously issued references. The token format, AES-256-GCM encryption, and signed authentication session are unchanged.
3. Cluster assignment remains read/match based and can race under concurrent submissions. The new persistence RPC prevents cascade/insert partial state but does not serialize JavaScript similarity assignment.
4. No complaint notification delivery, email/SMS/push acknowledgement, or external queue was introduced.
5. Local API multi-user authorization and migration/RPC behavior are verified.
   Browser E2E, authenticated-JWT RLS, concurrency/replay behavior, and hosted
   deployment persistence remain unverified. The owner UI emergency count was fixed
   to use global `similar_count`, with two model regressions; browser rendering is
   still unverified.
6. The existing Module 2 analyzer remains a standalone capability; the core complaint submission path intentionally remains deterministic lexical clustering.

## Manual acceptance steps still required

Against an isolated Supabase project with fictional data and `AUTH_MODE=mock`:

1. Configure the server-only session secret and apply the new migration through the normal migration workflow.
2. Sign in as two separate students with institutional IDs and OTP `123456`; confirm each receives a distinct HTTP-only session and can create/read only their own complaint rows.
3. Submit five similar complaints owned by five different students; confirm each student's permitted visible row reports the same global cluster count/emergency state while other students' text, attachments, and IDs remain absent.
4. Sign in as an authorized faculty/HOD/department coordinator; confirm the staff queue is visible and a staff `PATCH` can take ownership and transition a complaint.
5. Confirm a student receives 403 for the same `PATCH`, invalid transitions return 409, and resolved/rejected transitions require a response note.
6. Confirm status history and response notes survive refresh and that the actor is recorded server-side without being returned as a raw ID.
7. Force an insert/RPC failure in a disposable database and confirm the atomic persistence function leaves no partial emergency cascade.
8. Upload valid and forged image bytes, test owner mismatch, restart the local process, and verify the documented token/storage limitations.

## Current maturity

**Level 3 — Integrated hackathon system, pending live acceptance.**

The local implementation now connects intake, owner-scoped views, global emergency aggregates, staff lifecycle mutation, attachment security, and deterministic analysis boundaries. It is not Level 4 because live migration/RLS/auth/storage/deployment checks, durable attachments, notification delivery, concurrency serialization, and browser multi-user acceptance are still outstanding.
