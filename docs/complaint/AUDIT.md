# CampusGram Complaint Module — Forensic Audit

**Audit date:** 2026-10-09 (Asia/Calcutta)

**Scope:** Complaint submission, feed/listing, attachments, complaint detail, Module 2 intelligence, authentication/authorization boundaries, persistence, migrations/RLS, tests, and operational readiness.

**Method:** Read-only source and documentation inspection plus safe local tests/typecheck/lint/build. No application source, migration, dependency, test, database schema, database policy, or runtime data was modified.

## 1. Executive summary

The repository contains a working **authenticated mock/in-memory complaint submission and lexical-clustering prototype**, not a complete complaint-management system. The primary user journey is connected through:

```text
Complaints UI
  → POST /api/complaints/upload (optional local-disk image)
  → POST /api/complaints
  → server-derived identity
  → Zod request validation
  → in-memory or Supabase repository
  → text-only Jaccard cluster assignment
  → five-report emergency flag/cascade
  → GET /api/complaints feed
```

The separate Module 2 analysis route is also implemented and unit-tested, but it is **not invoked by the complaint submission form and does not persist to `public.complaint_ai_analysis`**. The submission path uses a separate deterministic lexical clustering implementation. Consequently, the UI's “AI-assisted” wording overstates what runs during submission.

The most consequential confirmed risks are:

1. The complaint lifecycle stops at `submitted`: there is no complaint-specific staff queue, assignment mutation, response/resolution note, status transition API, or notification flow.
2. The intended configured-Supabase OTP flow establishes a mock cookie, while normal configured-Supabase identity resolution first requires a real Supabase Auth user; the integration is therefore statically inconsistent and may leave authenticated complaint operations at 401.
3. Cluster counts and emergency flags are recomputed after applying the viewer ownership filter, so an ordinary student can see a globally escalated cluster represented as only their own report.
4. Supabase emergency cascade and insertion are separate operations; a successful cascade followed by a failed insert can leave partial emergency state.
5. Complaint attachments are stored on local disk, MIME validation trusts the client-declared MIME type, and the JSON API accepts arbitrary valid URLs/root-relative paths without proving upload ownership or existence.

The current classification is **Level 2 — Functional prototype**, approaching an integrated hackathon system only for the submission/feed slice. Automated tests and the production build pass, but they do not establish live Supabase persistence, RLS behavior, browser E2E, multi-user authorization, or operational lifecycle completion.

### Finding count

| Severity | Confirmed findings |
| --- | ---: |
| P0 — Critical | 0 |
| P1 — High | 3 |
| P2 — Medium | 8 |
| P3 — Low | 3 |

Severity reflects the code and configuration reviewed, not a live-incident claim. Where a finding depends on deployment state, that dependency is called out explicitly.

## 2. Confirmed architecture and file map

### 2.1 Actual end-to-end flow

| Stage | Actual implementation | Status/evidence |
| --- | --- | --- |
| UI | `apps/web/app/complaints/page.tsx:39-910` | Implemented client page with form, optional image, tabs, feed, cluster modal, image modal, loading/error/success states. |
| Client submission | `page.tsx:185-257` | Uploads an image first, then submits JSON to `/api/complaints`; does not call `/api/complaints/analyze`. |
| Authentication | `apps/web/lib/auth/server-identity.ts:28-108` | Server derives identity from Supabase `auth.getUser()` or a signed mock cookie only when `AUTH_MODE=mock`/test. |
| API create/list | `apps/web/app/api/complaints/route.ts:19-123` | Authenticates, validates create/query input, ignores client `complainant_id`, delegates to repository. Invalid `view` silently falls back to `all`. |
| API detail | `apps/web/app/api/complaints/[id]/route.ts:5-73` | Authenticates, applies the same viewer capability filter, returns one record and visible cluster peers. |
| Upload | `apps/web/app/api/complaints/upload/route.ts:11-104` | Authenticated multipart upload; declared MIME and size checks; writes to `public/uploads/complaints/`. |
| Core business logic | `apps/web/lib/complaints/complaint-repository.ts:96-292` | Selects Supabase when configured, otherwise in-memory; matches text using Module 2's Jaccard helper; calculates threshold 5; persists complaint. |
| Similarity | `apps/web/lib/complaints/similarity-service.ts:21-78`; `modules/complaint-intelligence/src/clustering/similarity.ts:1-27` | Deterministic lexical token-set Jaccard; default web threshold `0.35`; images and metadata are excluded. |
| Module 2 analysis | `apps/web/app/api/complaints/analyze/route.ts:9-69`; `modules/complaint-intelligence/src/index.ts:22-110` | Standalone authenticated analysis endpoint; mock or Gemini provider; response schema validation; no persistence caller found. |
| Persistence | `apps/web/lib/complaints/complaint-repository.ts:105-165,218-257` | Supabase `public.complaints` or process-local array in test/offline mode. Test mode always selects memory (`:57-67`). |
| Database | `supabase/migrations/001_initial_schema.sql:62-149`, `004_complaint_clusters.sql:6-26`, `005_complaint_rls_and_cascade.sql:7-49`, `011_security_advisor_cleanup.sql:6-7` | Complaints, AI-analysis table, status enum, cluster fields/view, RLS and service-role-only cascade intent. Live application of migrations was not checked. |

### 2.2 Integration with the shared application

- **Identity:** complaints depend on the shared institutional identity/session layer; no complaint-local user table was found. The HTTP routes overwrite any browser-supplied `complainant_id` with `identity.userId` (`apps/web/app/api/complaints/route.ts:96-101`).
- **Contracts:** request, response, category, status, attachment, and analysis schemas are in `packages/contracts/src/complaint.ts:7-294`.
- **Database:** complaints reference `public.profiles`; `complaint_ai_analysis` references `public.complaints` (`supabase/migrations/001_initial_schema.sql:78-115`).
- **Module boundary:** Module 2 is UI-independent and exports `analyzeComplaint`, similarity helpers, and candidate helpers (`modules/complaint-intelligence/src/index.ts:10-13`). The web repository imports only the Jaccard helper for submission clustering.
- **Other campus modules:** the complaint UI links to the separate emergency module (`apps/web/app/complaints/page.tsx:294-301`), but no complaint-to-notification or complaint-to-staff workflow integration was found. Lost & Found code is not part of the complaint flow.

### 2.3 Documentation versus implementation

The following documentation statements are not proof and do not match the current code in all cases:

| Documentation claim | Evidence of discrepancy |
| --- | --- |
| `ARCHITECTURE.md:47-50,166-169` says the route saves canonical complaint and AI result. | No application caller inserts/selects `complaint_ai_analysis`; `/api/complaints/analyze` only returns analysis (`analyze/route.ts:43-50`). |
| `docs/complaint/MEMORY.md:64,97,542` describes campus-wide authenticated complaint visibility. | The API/repository restrict ordinary viewers to their own `complainant_id` (`route.ts:34-42`; repository `:108-110,136-139`). The SQL policy is broader, but the application path is narrower. |
| `MEMORY.md:66,541-545` says anonymous/demo submissions are accepted. | `POST /api/complaints` requires a resolved identity and returns 401 otherwise (`route.ts:74-80`). |
| `MEMORY.md:341` lists `triaged`. | Contract and SQL use `under_review`, not `triaged` (`packages/contracts/src/complaint.ts:29-35`; `001_initial_schema.sql:63-69`). |
| `MEMORY.md:387-415` describes authenticated and service-role cascade execution. | Later migration `011_security_advisor_cleanup.sql:6-7` revokes authenticated execution and grants service role only. |
| `MEMORY.md:568` says 15 complaint tests. | The current `apps/web/tests/complaint.test.ts` contains 16 tests and the executed web suite contained 206 total tests. |

## 3. Complaint lifecycle and feature matrix

Classification meanings: **Working end to end** means connected and tested locally; **Implemented but partially integrated** means a source path exists but is not part of the primary flow or lacks live verification; **UI-only/API-only** means disconnected from the other half; **Mocked or simulated** means deterministic/offline behavior; **Missing** means no implementation was found; **Not verified** means the source suggests a capability but the required runtime proof was not performed.

| Feature | Classification | Evidence and actual behavior |
| --- | --- | --- |
| Complaint submission | Working end to end (mock/local path) | Form validates trimmed text length, uploads optional file, posts JSON, refreshes feed (`page.tsx:185-257`). Route validates and repository creates (`route.ts:72-109`). Live DB/browser proof absent. |
| Form validation | Working end to end (source + tests) | Client and `CreateComplaintRequestSchema` enforce text length ≥5; category and attachment shape are schema-checked (`complaint.ts:236-246`). |
| Categories | Working end to end for controlled values | UI and contract use eight values (`page.tsx:352-371`; `complaint.ts:7-16`). Classification rules are separate and first-match substring based (`classify.ts:9-108`). |
| Priority/severity | Implemented but partially integrated | Module 2 mock/Gemini analysis has severity; core submission uses only cluster-volume emergency threshold, not AI severity (`gemini.ts:15-82`; repository `:191-216`). |
| Complaint ID generation | Working end to end locally | Repository uses `crypto.randomUUID()` (`complaint-repository.ts:198-216`); Supabase has UUID default in SQL (`001_initial_schema.sql:78-80`). |
| Status tracking | UI-only/schema-only | Records start as `submitted`; no complaint PATCH/PUT/status mutation path was found. Contract/SQL define statuses but code never advances them (`complaint-repository.ts:201-216`; `complaint.ts:29-36`). |
| Student history/detail | Implemented but partially integrated | Detail API exists with ownership filtering (`[id]/route.ts:24-58`), but the UI page does not link to or render a complaint detail/history route. |
| Administrative/staff queue | Missing | No complaint admin page or queue route was found; privileged roles only broaden list visibility (`route.ts:34-42`). |
| Assignment/responsibility | Schema-only | `assigned_to` exists in SQL, but no complaint route/repository mutation writes it; Module 2 recipient suggestion is returned only by standalone analysis. |
| Status transitions | Missing | No route, state machine, transition allow-list, or server-side transition authorization exists for complaints. |
| Comments/responses/resolution notes | Missing | No complaint comment/response/resolution table, route, UI, or repository operation was found. |
| Reopen/reject/close/escalate | Partially integrated | Reject/close/reopen operations are missing. Only automatic cluster-volume emergency flagging exists; it is not a staff lifecycle state. |
| Attachments/evidence | Implemented but partially integrated | Local filesystem upload and feed rendering exist; it is not durable cloud storage and the JSON route accepts arbitrary URLs. |
| Notifications/acknowledgements | Missing | No complaint-specific notification dispatcher, acknowledgement, email, SMS, push, or realtime path was found. |
| Search/filter/pagination | Partially integrated | `view=all|normal|emergency` exists; no text search, category filter, date filter, cursor/offset pagination, or server-side page limit exists. |
| Emergency grouping/dashboard | Working end to end in local mock path | Jaccard clustering, threshold 5, cascade, and client-side emergency cluster cards are connected and covered by tests (`complaint.test.ts:90-150,461-508`). |
| Duplicate/retry handling | Partially integrated | Duplicate text groups deterministically in a single sequential process; no idempotency key or concurrent write protection exists. |
| Empty/loading/error/success states | Implemented in UI | Feed loading/error/empty states and submission error/success states exist (`page.tsx:86-111,425-475,552-665`). They are not browser-verified here. |

## 4. Authentication, authorization, and privacy review

### 4.1 Identity and trust boundaries

Positive controls confirmed in source:

- `resolveServerIdentity()` explicitly rejects unauthenticated requests and does not trust browser storage, request headers, or caller identity fields (`apps/web/lib/auth/server-identity.ts:20-30,38-42,77-80`).
- In mock mode, requests still require a signed `campusgram_mock_session` HTTP-only cookie; no default demo identity is granted (`server-identity.ts:82-105`).
- Complaint creation overwrites `complainant_id` with the server-derived identity (`apps/web/app/api/complaints/route.ts:96-101`).
- Detail/list APIs calculate privileged visibility from server-derived role/tags, not from request body values (`route.ts:34-42`; `[id]/route.ts:24-33`).
- Upload, create, list, detail, and analyze endpoints all check identity before their main operation.

### 4.2 Effective authorization model

The effective Next.js application behavior is:

- Students without `admin`, `faculty`, or `staff` role and without `HOD`/`DEPARTMENT_COORDINATOR` tags are filtered to their own `complainant_id` in the repository (`complaint-repository.ts:108-110,136-139`).
- Privileged users can read all records through the application path (`route.ts:34-42`).
- A student cannot retrieve another student's complaint through the detail route because lookup occurs after that filter (`[id]/route.ts:29-46`).
- There is no status/assignment mutation endpoint to audit for privilege enforcement.

This is narrower than migration `005`'s database policy, which grants all authenticated users `SELECT` (`005_complaint_rls_and_cascade.sql:7-15`). Because the repository uses a service-role client in `AUTH_MODE=mock` and applies its own filter, database-policy behavior is not equivalent to API behavior.

### 4.3 Static risks and privacy observations

- `getComplaints()` maps and returns `complainant_id` (`complaint-repository.ts:116-131`). This is visible to any privileged API consumer and is not masked. Whether privileged users should receive raw profile UUIDs is a policy decision; the exposure is confirmed, but a live response was not inspected.
- The standalone analysis prompt includes optional `complainant_context`, including `user_id`, when present (`modules/complaint-intelligence/src/ai/prompts.ts:30-45`). No minimization or redaction layer is present before Gemini. Policy acceptability and live provider configuration were not verified.
- Attachment URLs are rendered directly in browser `<img>` elements (`apps/web/app/complaints/page.tsx:710-728,844-863`); the API does not establish that a URL belongs to the authenticated submitter.
- Gemini JSON parse errors include the first 200 characters of raw model output and are returned through the analysis error envelope (`modules/complaint-intelligence/src/ai/gemini.ts:118-125`; `apps/web/app/api/complaints/analyze/route.ts:51-67`). This is a confirmed disclosure path for model/user-derived fragments; exploitability depends on provider behavior and deployment exposure.

### 4.4 Configured Supabase authentication discrepancy

The OTP verification route sets a `campusgram_mock_session` cookie, while `resolveServerIdentity()` in configured mode first calls Supabase `auth.getUser()` and only considers the mock cookie when `AUTH_MODE=mock` or tests (`server-identity.ts:38-42,82-96`; OTP cookie-setting route was source-inspected). Therefore the documented lookup → OTP → complaint flow is not proven to establish a normal Supabase Auth session. This is a confirmed source-level integration mismatch; whether the active deployment sets `AUTH_MODE=mock` or separately creates Supabase sessions is unverified.

## 5. Database and persistence review

### 5.1 Schema and migration history

| Object | Actual definition | Audit interpretation |
| --- | --- | --- |
| `public.complaints` | `001_initial_schema.sql:78-91` | UUID complaint ID, nullable `complainant_id`, text, `complaint_status`, category/subcategory, location, `assigned_to`, JSONB attachments, timestamps. |
| `public.complaint_ai_analysis` | `001_initial_schema.sql:94-115` | Stores provider/model, analysis fields, severity/confidence JSON, and tags; references complaints with `ON DELETE CASCADE`. No unique constraint on `complaint_id` is visible. |
| Status enum | `001_initial_schema.sql:63-69` | `submitted`, `under_review`, `in_progress`, `resolved`, `rejected`. |
| Cluster fields/indexes | `004_complaint_clusters.sql:6-14` | Adds nullable `cluster_id`, non-null `is_emergency` default false, B-tree indexes. |
| Cluster view | `004_complaint_clusters.sql:17-26` | Counts rows by cluster and returns first/last timestamps; application repository does not use this view. |
| Complaint RLS | `001_initial_schema.sql:117-149`, replaced for SELECT by `005:7-15` | RLS enabled. Initial own/assigned/privileged read policy is replaced by campus-wide authenticated SELECT. Insert requires `auth.uid() = complainant_id` at the SQL layer. |
| Emergency RPC | `005:20-49`, permission cleanup `011:6-7` | `SECURITY DEFINER`, exact cluster update, fixed search path; final migration intent grants execution only to `service_role`. |

The database columns are broader than the Zod contracts: category, provider, JSONB fields, severity score, confidence values, and attachment structure have no corresponding visible SQL `CHECK` constraints. Runtime protection therefore depends on application callers.

### 5.2 Persistence selection and durability

- Tests force in-memory mode (`complaint-repository.ts:57-67`). The in-memory array is process-local and resettable (`:289-292`); it does not survive restart.
- Non-test Supabase selection depends on non-placeholder `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`:57-67`). This establishes intended selection logic, not that a live project is reachable or migrated.
- Supabase reads select `*` and map rows with TypeScript casts rather than `ComplaintRecordSchema.parse` (`:105-131`). A malformed stored row or attachment JSON would not be caught at the API boundary.
- Supabase create computes clustering, optionally calls the service-role cascade, then inserts the complaint (`:218-247`). The cascade and insert are not in one transaction.
- The application returns success only after the insert resolves; persistence errors are converted to `PERSISTENCE_FAILED`/500 by the create route (`apps/web/app/api/complaints/route.ts:110-121`). This is a positive control for the direct create path.

### 5.3 Data integrity and concurrency

Confirmed source-level limitations:

1. **Cluster assignment race:** create reads all candidates, matches, and later inserts (`complaint-repository.ts:178-196,232-245`). Concurrent identical submissions can both choose different new cluster IDs. No lock, idempotency key, unique constraint, or serializable transaction is visible.
2. **Partial emergency cascade:** the service-role RPC runs before the new insert (`:223-230` then `:232-247`). If the insert fails, prior rows may remain `is_emergency=true` without the fifth stored complaint. This scenario is not reproduced against a live database.
3. **Viewer-scoped counts:** `getComplaints()` applies the ownership filter before `recalculateClusterCounts()` (`:108-110,136-143`). A student who sees only one member of a globally escalated cluster receives `similar_count=1` and `is_emergency=false` for that visible subset. This conflicts with the global threshold semantics documented for the system.
4. **Candidate scope:** all loaded complaints are candidates, including resolved/rejected records; no active-status or time-window filter is applied (`:178-189`).
5. **Cluster bridging:** matching uses the best individual complaint, not a cluster-level aggregate (`similarity-service.ts:51-68`), so a new text can bridge clusters through one candidate.

### 5.4 Attachments and evidence storage

The actual path is browser file → authenticated upload route → local `public/uploads/complaints` → JSON attachment metadata (`apps/web/app/api/complaints/upload/route.ts:65-90`). It is not Supabase Storage and is not durable across typical ephemeral/serverless deployments. The upload route trusts `blob.type` (`:37-49`) and does not inspect magic bytes. The complaint JSON schema accepts any absolute URL or root-relative path (`packages/contracts/src/complaint.ts:42-51`), without verifying that it came from the upload route, exists, belongs to the caller, or matches the declared metadata.

## 6. Complaint intelligence and automation review

### 6.1 Actual Module 2 pipeline

```text
POST /api/complaints/analyze
  → authenticated route
  → ComplaintAnalysisRequestSchema
  → analyzeComplaint()
  → input validation
  → provider selection
  → deterministic mock OR Gemini
  → ComplaintAnalysisResponseSchema
  → JSON response
```

Evidence: `apps/web/app/api/complaints/analyze/route.ts:9-50`; `modules/complaint-intelligence/src/index.ts:22-110`.

The primary form does not call this route (`apps/web/app/complaints/page.tsx:201-228`). No repository-wide caller was found that writes the returned object to `public.complaint_ai_analysis`. The database table is therefore schema-only in the current implementation.

### 6.2 Feature-level assessment

| Intelligence feature | Actual implementation | Classification |
| --- | --- | --- |
| Category/subcategory | Ordered keyword substring rules; first matching rule wins (`analysis/classify.ts:9-108`). | Mocked or simulated deterministic heuristic. |
| Severity | Ordered keyword lists with fixed scores 9.5/7.8/5.0/2.5 (`analysis/severity.ts:3-71`). | Mocked or simulated heuristic; not calibrated. |
| Location extraction | Regexes for room/floor/block/building; `area` always null in the inspected rule path (`analysis/location.ts`). | Implemented but partial. |
| Entity extraction | Rule-based equipment/fixture/person/title matching (`analysis/entities.ts`). | Mocked or simulated heuristic. |
| Recipient routing | Fixed category-to-department/role map (`ai/gemini.ts:25-56`). | Implemented in analysis result only; does not assign a real complaint. |
| Duplicate detection in Module 2 | Jaccard against three hard-coded demo candidates by default; default candidate inclusion threshold 0.25 and duplicate flag threshold 0.5 (`clustering/match.ts:12-67`). | Implemented but partially integrated; not database-backed. |
| Duplicate detection in submission | Web repository compares current complaint texts at threshold 0.35 (`similarity-service.ts:21-78`). | Working local prototype, separate from Module 2 analysis. |
| Image intelligence | Prompt sends only `has_images`/`has_documents`, mock uses text only (`ai/prompts.ts:30-45`; `ai/gemini.ts:15-23`). | Missing from actual implementation. |
| Manual-review signal | No explicit manual-review field or workflow was found in the output contract or app flow. | Missing. |
| Notifications/routing automation | No complaint-specific queue/notification/assignment integration. | Missing. |

### 6.3 Provider and validation observations

- Provider selection defaults to mock unless `AI_PROVIDER=gemini` and an API key are present (`modules/complaint-intelligence/src/index.ts:51-56`).
- If a caller explicitly passes `provider: "gemini"` without a key, the code executes mock analysis but reports `processing.provider: "gemini"` with `model: "mock-deterministic-v1"` (`index.ts:54-75,78-89`). This is a confirmed provenance bug.
- Gemini output is JSON-parsed and Zod-validated (`ai/gemini.ts:109-143`), but a structurally valid model-supplied `cluster_match` is accepted without recomputing it against the complaint database (`:127-143`).
- `ComplaintAnalysisRequestSchema` requires `complaint_id: z.string()` but not a non-empty string (`packages/contracts/src/complaint.ts:153-165`), contrary to `INTEGRATION_CONTRACT.md:51-56`.
- The exported `analyzeComplaint()` accesses `request.complaint_id` while constructing an invalid-input response (`index.ts:28-46`); the route pre-parses input, but a nullish direct runtime call could throw before returning a structured error.
- Mock confidence values `0.88` and `0.85` are fixed constants (`ai/gemini.ts:73-81`) and have no calibration evidence.
- The lexical tokenizer lowercases ASCII text and drops tokens of length ≤2 (`clustering/similarity.ts:1-7`), so single-letter block identifiers are lost; this is documented but remains a correctness limitation.

## 7. Critical user journey verification matrix

Status definitions: **Verified** means directly exercised by an executed local check; **Partially verified** means source and/or unit/route tests support part of the journey but an important runtime boundary was not exercised; **Failed** means the requested behavior is absent or demonstrably disconnected; **Not tested** means no safe verification was performed.

| # | Journey | Status | Evidence/blocker |
| ---: | --- | --- | --- |
| 1 | Student submits a complaint | Partially verified | Mock-cookie route tests and `pnpm test` exercise create/validation; no browser walkthrough or live Supabase write was performed. |
| 2 | Student sees the submitted complaint and persisted status | Partially verified | In-memory repository tests read back records and status defaults to `submitted`; live durability and page refresh against Supabase were not verified. |
| 3 | Student attempts another student's complaint | Partially verified | `complaint.test.ts:333-360` exercises 401 for unauthenticated and 404 for another mock student through the detail handler; no browser or live RLS test. |
| 4 | Authorized staff/admin views and processes a complaint | Partially verified | Source computes privileged list visibility (`route.ts:34-42`); no staff queue or processing mutation exists, and no live role/session test ran. |
| 5 | Staff updates status and adds response/resolution | Failed | No complaint-specific mutation route, response/notes storage, or UI was found. |
| 6 | Student sees updated status and response | Failed | No update path, response model, or student refresh surface exists. |
| 7 | Invalid/unauthorized status transitions are rejected | Failed | No complaint status transition endpoint/state machine exists to enforce or reject transitions. |
| 8 | Database/API failure is shown honestly rather than false success | Partially verified | Create maps persistence errors to 500 and does not return success before insert (`route.ts:110-121`; repository `:246-253`). No live DB failure injection, partial cascade reproduction, or browser display check was performed. |
| 9 | Classification/prioritization/routing runs when enabled | Partially verified | Module 2 mock analysis is unit-tested and standalone; core submission does not invoke it, does not persist it, and Gemini was not live-tested. |
| 10 | Notifications/acknowledgements are delivered | Failed | No complaint notification/acknowledgement implementation was found. |

## 8. Test, typecheck, lint, and build results

All commands below were executed from the repository root. No command intentionally reset, seeded, migrated, mutated, or queried a live database.

| Exact command | Result | Evidence/limitation |
| --- | --- | --- |
| `pnpm --filter @smart-campus/web test -- tests/complaint.test.ts` | **PASS** | Vitest discovered the full web suite rather than only the requested file: 13 files, 206 tests; `tests/complaint.test.ts` had 16 passing tests. |
| `pnpm --filter @smart-campus/complaint-intelligence test` | **PASS** | 3 files, 7 tests. |
| `pnpm --filter @smart-campus/complaint-intelligence typecheck` | **PASS** | `tsc --noEmit`, no output/errors. |
| `pnpm --filter @smart-campus/web typecheck` | **PASS** | `tsc --noEmit`, no output/errors. |
| `pnpm test` | **PASS** | 276 tests total across 8 participating workspaces: contracts 32, Module 2 7, Lost & Found 31, web 206. |
| `pnpm typecheck` | **PASS** | Recursive workspace typecheck completed without errors. |
| `pnpm lint` | **PASS with warnings** | No lint errors. Warnings include five `<img>` warnings in `apps/web/app/complaints/page.tsx`, plus unrelated workspace warnings and Next.js `next lint` deprecation. |
| `pnpm --filter @smart-campus/web build` | **PASS with warnings** | Next.js production build compiled, generated 48 static pages and complaint API/page routes. `<img>` optimization warnings remained. |
| `git diff --check` | **PASS** | No whitespace errors before report creation. |

### Test coverage limitations

- Web tests force memory storage in test mode, so they do not prove Supabase persistence, RLS, SQL RPC grants, constraints, or the cluster summary view.
- Module 2 tests cover classification, lexical matching, and input validation, but not live Gemini, malformed Gemini output, provider provenance, analysis persistence, or prompt privacy.
- No browser E2E, multi-user live authorization, live Supabase policy test, concurrent submission test, upload magic-byte test, or failure-injection test was run.
- Passing build/typecheck/test results demonstrate code validity for the checked paths, not production readiness.

## 9. Severity-ranked findings

### P1-01 — Complaint lifecycle cannot be processed after submission

- **Severity:** P1 — High
- **References:** `apps/web/app/api/complaints/route.ts:66-123`; `apps/web/lib/complaints/complaint-repository.ts:201-216`; `apps/web/app/complaints/page.tsx:39-910`
- **Evidence/reproduction:** Submit any valid complaint through the implemented route. `createComplaint()` always constructs `status: "submitted"`; repository-wide route discovery found no complaint PATCH/PUT/status/assignment/response endpoint. The UI has no staff queue or status controls.
- **Expected behavior:** An authorized staff member should be able to inspect, assign, transition, reject/resolve/reopen where supported, add a response/resolution note, and leave a durable audit trail; the student should later see the result.
- **Actual behavior:** A complaint can be created and listed, but there is no connected staff processing lifecycle. SQL/contracts define statuses, but no application code advances them.
- **Impact:** Core grievance management stops at intake. Operational staff cannot complete or communicate resolution using this module.
- **Confidence:** Confirmed source finding; no live runtime mutation was attempted.
- **Recommended fix direction (not implemented):** Define the authoritative lifecycle/state transition policy, add server-authorized mutation and response/audit boundaries, then connect staff and student views.
- **Test needed:** Two-role integration test covering allowed and rejected transitions, assignment authorization, response persistence, student read-back, and audit history.

### P1-02 — Configured Supabase OTP/session path is internally inconsistent

- **Severity:** P1 — High
- **References:** `apps/web/lib/auth/server-identity.ts:38-42,82-105`; `apps/web/app/api/auth/otp/verify/route.ts:32-42`; `apps/web/lib/supabase/server.ts:45-52`
- **Evidence/reproduction:** The OTP verify route sets a signed `campusgram_mock_session` cookie. In a configured Supabase environment, `resolveServerIdentity()` first requires `supabase.auth.getUser()` and only enables mock-cookie fallback when `AUTH_MODE=mock` or tests. `createApplicationClient()` also uses service-role only in `AUTH_MODE=mock`.
- **Expected behavior:** The documented institutional ID → OTP → authenticated session flow should produce the session consumed by complaint routes in the intended configured deployment, or the deployment should explicitly and consistently be mock mode.
- **Actual behavior:** Source code contains two session modes whose handoff is not guaranteed: OTP creates a mock application cookie, while normal configured mode expects a real Supabase Auth session.
- **Impact:** A configured deployment may allow login UI progression but return 401 for complaint list/create/upload/analyze requests unless a separate Supabase Auth session exists. The active environment was not inspected for secret values or mode.
- **Confidence:** Confirmed source-level mismatch; live occurrence and deployment configuration are unverified.
- **Recommended fix direction (not implemented):** Choose one explicit session authority per environment, document the mode boundary, and exercise the complete flow with a real/staging identity.
- **Test needed:** Configured-Supabase integration test from OTP verification through a complaint GET/POST, plus a negative test proving no cookie/header impersonation.

### P1-03 — Global emergency state is presented with viewer-scoped counts

- **Severity:** P1 — High
- **References:** `apps/web/lib/complaints/complaint-repository.ts:105-110,136-163`; `apps/web/app/api/complaints/route.ts:34-42`; `supabase/migrations/004_complaint_clusters.sql:17-26`
- **Evidence/reproduction:** For a non-privileged viewer, the repository filters records to `complainant_id` before calling `recalculateClusterCounts()`. The recalculation then counts only visible records and derives `is_emergency` from that subset. A five-member global cluster can therefore be represented to a student as one visible report with `similar_count=1` and `is_emergency=false`.
- **Expected behavior:** Emergency classification and cluster volume should be based on the authoritative global cluster, while the response should reveal only the records the viewer is allowed to see.
- **Actual behavior:** Ownership filtering changes the computed cluster count and emergency flag. This conflicts with the stated volume-based global emergency rule and produces different status/counts for different viewers.
- **Impact:** Students may not see that their issue is part of an escalated incident; the feed can under-report emergency volume and mislead users about priority.
- **Confidence:** Confirmed source behavior; no live multi-user request was executed.
- **Recommended fix direction (not implemented):** Separate global aggregate computation from private row projection and specify whether ordinary users should see a campus-wide sanitized feed or only personal history.
- **Test needed:** Multi-user integration test creating five separate owners, then comparing staff and student aggregate/status responses without exposing unauthorized rows.

### P2-01 — Complaint submission bypasses Module 2 analysis and AI-result persistence

- **Severity:** P2 — Medium
- **References:** `apps/web/app/complaints/page.tsx:201-228,242-247`; `apps/web/app/api/complaints/analyze/route.ts:43-50`; `supabase/migrations/001_initial_schema.sql:93-115`; `ARCHITECTURE.md:47-50`
- **Evidence/reproduction:** The form calls `/api/complaints/upload` and `/api/complaints`, never `/api/complaints/analyze`. No repository caller writes `complaint_ai_analysis`. The core result is lexical cluster data, while the UI success message says “clustered with AI similarity.”
- **Expected behavior:** Either the primary flow should invoke and persist the declared intelligence result, or the UI/documentation should accurately describe the deterministic clustering path.
- **Actual behavior:** Module 2 analysis is a standalone API/library capability disconnected from canonical complaint creation and storage.
- **Impact:** Severity, routing, entities, and Module 2 duplicate results do not affect real complaint workflow; operators cannot rely on the documented AI analysis record.
- **Confidence:** Confirmed source/documentation mismatch.
- **Recommended fix direction (not implemented):** Establish one authoritative submission pipeline and provenance model; avoid presenting lexical similarity as model-based analysis.
- **Test needed:** End-to-end test asserting complaint creation invokes the intended analyzer, persists one validated result, and returns provider provenance; or a contract/UI test asserting deterministic mode wording.

### P2-02 — Module 2 duplicate analysis uses demo candidates and conflicting thresholds

- **Severity:** P2 — Medium
- **References:** `modules/complaint-intelligence/src/clustering/match.ts:12-67`; `apps/web/app/api/complaints/analyze/route.ts:43-46`; `apps/web/lib/complaints/similarity-service.ts:21-68`
- **Evidence/reproduction:** The analysis route passes no `historicalCandidates`, so Module 2 defaults to three hard-coded `CMP-DEMO-*` issues. Module 2 includes candidates at 0.25 and flags duplicates at 0.5, while submission clustering uses 0.35 and current complaint rows.
- **Expected behavior:** Duplicate results for a live complaint should use an authoritative candidate source and a documented, consistent interpretation of thresholds.
- **Actual behavior:** The standalone analysis route can return matches against fictional demo issues and disagree with the submission route about the same text.
- **Impact:** Duplicate IDs/confidence may be misleading and cannot drive routing or deduplication reliably.
- **Confidence:** Confirmed source behavior; no live external caller was tested.
- **Recommended fix direction (not implemented):** Define candidate ownership, status/time scope, threshold semantics, and provider provenance before exposing duplicate results operationally.
- **Test needed:** Fixture-backed analysis integration test using current complaint candidates, plus boundary tests for 0.25/0.35/0.5 behavior.

### P2-03 — Emergency cascade and complaint insert are not atomic

- **Severity:** P2 — Medium
- **References:** `apps/web/lib/complaints/complaint-repository.ts:218-253`; `supabase/migrations/005_complaint_rls_and_cascade.sql:20-43`
- **Evidence/reproduction:** On a threshold-crossing Supabase write, the service-role `cascade_complaint_emergency` RPC runs first. The new complaint is inserted afterward. An insert failure after a successful RPC leaves prior rows updated without the new row.
- **Expected behavior:** Cluster escalation and creation of the threshold-crossing complaint should commit or roll back together.
- **Actual behavior:** The operations use separate calls with no transaction boundary in the reviewed code.
- **Impact:** Emergency state and cluster membership can diverge after a persistence failure. The code correctly avoids false success, but it cannot undo the earlier cascade.
- **Confidence:** Confirmed static transaction gap; live failure not reproduced.
- **Recommended fix direction (not implemented):** Move the aggregate transition and insert into one database transaction/function with failure-safe semantics and concurrency control.
- **Test needed:** Database integration test that forces insert failure after the threshold decision and verifies no partial cascade remains.

### P2-04 — Complaint images use non-durable local filesystem storage

- **Severity:** P2 — Medium
- **References:** `apps/web/app/api/complaints/upload/route.ts:65-90`; `docs/complaint/MEMORY.md:617-620`
- **Evidence/reproduction:** Uploads are written under `process.cwd()/public/uploads/complaints` with `fs.writeFile`; no Supabase Storage call is present.
- **Expected behavior:** Evidence intended to remain available after redeploy/cold start should use durable, access-controlled storage.
- **Actual behavior:** The upload route returns success after local disk write only.
- **Impact:** Attachments may disappear or be unavailable on serverless/ephemeral deployments; local files may also outlive failed complaint creation as orphaned evidence.
- **Confidence:** Confirmed implementation; deployment-specific data loss is unverified.
- **Recommended fix direction (not implemented):** Select a durable storage adapter, define access policy and cleanup/orphan behavior, and keep attachment metadata tied to the complaint transaction.
- **Test needed:** Isolated deployment/storage integration test covering upload, complaint creation failure cleanup, restart/redeploy persistence, and unauthorized access.

### P2-05 — Attachment validation trusts client metadata and arbitrary URLs

- **Severity:** P2 — Medium
- **References:** `apps/web/app/api/complaints/upload/route.ts:35-49`; `packages/contracts/src/complaint.ts:42-51`; `apps/web/tests/complaint.test.ts:189-212`
- **Evidence/reproduction:** Upload checks `blob.type` supplied by the multipart payload and never checks file signatures. Separately, the complaint JSON endpoint accepts any absolute URL or root-relative path; an executed test intentionally submits `https://example.com/uploads/complaints/pipe.jpg` and receives 201.
- **Expected behavior:** Server-side validation should verify content type and only allow authorized, existing attachment references for the current operation.
- **Actual behavior:** A caller can declare a permitted MIME type for arbitrary bytes and can attach a URL not produced by the upload route.
- **Impact:** Invalid/misleading evidence, external content injection into the feed, broken privacy ownership, and potential storage/availability abuse. No server-side fetch/SSRF was observed.
- **Confidence:** Confirmed validation gap; exploit impact in a live deployment is unverified.
- **Recommended fix direction (not implemented):** Validate magic bytes, constrain size/count, issue server-owned attachment references, and enforce ownership/access on retrieval.
- **Test needed:** Upload tests with forged MIME/incorrect magic bytes, external/root-relative unauthorized URLs, and attachment ownership cases.

### P2-06 — Database rows are not runtime-validated at the complaint API boundary

- **Severity:** P2 — Medium
- **References:** `apps/web/lib/complaints/complaint-repository.ts:116-131`; `apps/web/app/api/complaints/route.ts:44-50,103-109`; `packages/contracts/src/complaint.ts:218-292`
- **Evidence/reproduction:** Supabase rows are mapped with `any` and attachment casts; list/create routes construct typed objects but do not call `ComplaintRecordSchema`, `ComplaintListResponseSchema`, or `CreateComplaintResponseSchema` parsing before returning.
- **Expected behavior:** Data read from persistence should be validated against the shared contract before crossing the API boundary.
- **Actual behavior:** Malformed status/category/attachment JSON or incompatible legacy rows can be returned or fail later in UI code without a controlled contract error.
- **Impact:** Contract drift can become a data-integrity or availability issue, especially because SQL uses broad `TEXT`/`JSONB` fields.
- **Confidence:** Confirmed source gap; malformed live rows were not injected.
- **Recommended fix direction (not implemented):** Validate mapped records/responses and define migration/repair behavior for invalid stored data.
- **Test needed:** Repository/API test with malformed row shapes and assertions for safe error envelopes rather than invalid response payloads.

### P2-07 — Multiple complaint data disclosure paths lack minimization

- **Severity:** P2 — Medium
- **References:** `apps/web/lib/complaints/complaint-repository.ts:116-131`; `modules/complaint-intelligence/src/ai/prompts.ts:33-42`; `modules/complaint-intelligence/src/ai/gemini.ts:118-125`; `apps/web/app/complaints/page.tsx:710-728,844-863`
- **Evidence/reproduction:** API mapping includes raw `complainant_id`; the Gemini prompt includes caller-supplied `complainant_context`; Gemini parse errors include the first 200 characters of raw output; attachment URLs are rendered directly. The source does not show redaction or a privacy projection for these fields.
- **Expected behavior:** Complaint APIs and external model prompts should disclose only the minimum necessary data, with errors sanitized and attachment access controlled.
- **Actual behavior:** Several raw/derived values cross boundaries without a visible minimization layer.
- **Impact:** Identifier leakage, unnecessary personal-context exposure to a model provider, and accidental model/user-content disclosure in errors. Whether privileged UUID exposure is allowed by policy is unverified.
- **Confidence:** Confirmed source-level exposure paths; live payloads/provider logs were not inspected.
- **Recommended fix direction (not implemented):** Define privacy-safe response projections and model-input allowlists; sanitize errors and audit attachment access.
- **Test needed:** Contract tests asserting forbidden fields are absent for each role and prompt/error tests asserting no identity/secret/private text leakage.

### P2-08 — Provider provenance and model-supplied duplicate metadata can be misleading

- **Severity:** P2 — Medium
- **References:** `modules/complaint-intelligence/src/index.ts:51-89`; `modules/complaint-intelligence/src/ai/gemini.ts:127-143`
- **Evidence/reproduction:** Explicit `provider: "gemini"` without an API key enters the mock branch but reports provider `gemini` and model `mock-deterministic-v1`. If Gemini supplies a structurally valid `cluster_match`, the code accepts it rather than recomputing it against current complaints.
- **Expected behavior:** Response provenance should identify the actual provider/model, and operational duplicate references should be grounded in an authoritative candidate source.
- **Actual behavior:** Metadata can claim Gemini for mock output, and model-supplied IDs/titles/statuses can be returned after shape validation alone.
- **Impact:** Operators and downstream code may make decisions based on false provenance or unverified duplicate references.
- **Confidence:** Confirmed source behavior; no live Gemini call was made.
- **Recommended fix direction (not implemented):** Make provider fallback explicit in the result and treat model output as untrusted until reconciled with authorized database candidates.
- **Test needed:** Provider option matrix and Gemini fixture tests asserting provenance, candidate reconciliation, and rejection of unknown complaint IDs.

### P3-01 — Analysis contract does not enforce a non-empty complaint ID

- **Severity:** P3 — Low
- **References:** `packages/contracts/src/complaint.ts:153-165`; `INTEGRATION_CONTRACT.md:51-56`
- **Evidence/reproduction:** `complaint_id` is `z.string()` with no `.min(1)`, while the integration contract requires a non-empty identifier.
- **Expected behavior:** Empty identifiers should be rejected before analysis.
- **Actual behavior:** Empty strings satisfy the visible request schema.
- **Impact:** Invalid correlation IDs can enter logs/results and make persistence or traceability ambiguous.
- **Confidence:** Confirmed contract discrepancy.
- **Recommended fix direction (not implemented):** Align the runtime schema and contract, then add an isolated boundary test.
- **Test needed:** Valid-text/empty-ID request test.

### P3-02 — Heuristic classification/tokenization has documented false-grouping limitations

- **Severity:** P3 — Low
- **References:** `modules/complaint-intelligence/src/analysis/classify.ts:96-108`; `modules/complaint-intelligence/src/clustering/similarity.ts:1-27`; `docs/complaint/MEMORY.md:630-632`
- **Evidence/reproduction:** Classification uses substring matching (`"light"` can match inside another word), while tokenization drops all tokens ≤2 characters, including block identifiers such as A/B. Jaccard is lexical, not semantic.
- **Expected behavior:** Location-sensitive grouping and classification should avoid common false positives and preserve meaningful identifiers.
- **Actual behavior:** Rule order and token filtering can misclassify or merge distinct issues.
- **Impact:** Incorrect category/routing or cluster membership, especially around short campus identifiers.
- **Confidence:** Confirmed algorithmic limitation; product tolerance is a design decision.
- **Recommended fix direction (not implemented):** Calibrate taxonomy/tokenization with representative campus fixtures and document non-semantic behavior in the UI.
- **Test needed:** Regression corpus covering substring collisions, single-character blocks, synonyms, and unrelated same-keyword issues.

### P3-03 — Complaint UI retains image optimization lint warnings and incomplete operational wording

- **Severity:** P3 — Low
- **References:** `apps/web/app/complaints/page.tsx:403,613,718,852,899`; `page.tsx:242-247,465-469`; lint/build output
- **Evidence/reproduction:** `pnpm lint` and `pnpm --filter @smart-campus/web build` both reported five `<img>` warnings in the complaint page. The UI displays “Analyzing & Grouping...” and “clustered with AI similarity” although the submission path performs lexical grouping only.
- **Expected behavior:** Production UI should use the project’s approved image strategy and accurately communicate processing/provenance.
- **Actual behavior:** Build succeeds with warnings and the wording can imply an AI model ran when it did not.
- **Impact:** Performance/accessibility polish and user trust are reduced; this is not a core security failure.
- **Confidence:** Confirmed lint/UI wording finding.
- **Recommended fix direction (not implemented):** Align image rendering with deployment policy and label deterministic clustering/provider state truthfully.
- **Test needed:** UI test for loading/success copy and lint policy check for complaint attachment rendering.

## 10. Maturity assessment

Scores are engineering assessments of the complaint module as audited, not benchmarks. A passing build or unit test does not by itself increase a maturity score.

| Dimension | Score /5 | Justification |
| --- | ---: | --- |
| Functional completeness | 2 | Submission, listing, clustering, upload, and detail API exist; assignment, responses, staff processing, notifications, and closure are absent. |
| End-to-end integration | 2 | UI → authenticated API → repository is connected in mock/local mode, but Module 2 analysis and AI persistence are disconnected from submission. |
| Authentication and authorization | 3 | Server-derived identity and ownership overwrite are good controls; configured OTP/session mismatch and lack of live multi-user verification prevent a higher score. |
| Privacy and data protection | 2 | Student detail filtering exists, but raw IDs, model context, attachment URL trust, and unverified RLS/policy behavior remain. |
| Persistence and database integrity | 2 | Supabase schema and repository path exist, but tests use memory, SQL is weakly constrained, and cascade/insert are non-atomic. |
| Complaint lifecycle enforcement | 1 | SQL status enum exists, but no application transition, assignment, response, audit, reopen, or closure workflow exists. |
| Intelligence/automation maturity | 2 | Deterministic heuristics and Gemini adapter are implemented, but core submission bypasses analysis and duplicate candidates default to demo data. |
| Reliability and recovery | 2 | Honest direct create error handling and race-safe UI refresh exist; no transactionality, idempotency, durable attachments, rate limit, retry queue, or notification recovery exists. |
| UI/UX completeness | 3 | Form, tabs, modals, loading/error/empty/success states are substantial; no status history/admin UI and no browser/accessibility acceptance was performed. |
| Automated test quality | 3 | 276 tests pass and cover local routes/heuristics; no live DB/RLS, concurrency, Gemini, browser E2E, or lifecycle tests. |
| Production readiness | 1 | Local-disk evidence, missing operational lifecycle, unverified live auth/RLS, and absent abuse/notification/recovery controls block production use. |

### Classification

**Level 2 — Functional prototype.**

The module is beyond a static mockup because authenticated mock/local submission, validation, persistence abstraction, clustering, emergency threshold logic, and feed UI are connected and tested. It is not yet Level 3 across the complaint domain because the operational lifecycle, live persistence/auth verification, and Module 2 integration are incomplete. It is far from Level 4/5 because durable evidence storage, transaction/concurrency controls, operational authorization, notifications, auditability, and production runtime verification are absent.

## 11. Known limitations and unverified areas

The following were deliberately not claimed as verified:

- No live Supabase connection, migration application, schema inspection, RLS query, service-role RPC, or database mutation was performed.
- No browser E2E walkthrough was run. The UI was source-reviewed only.
- No two-student/staff live authorization test was run.
- No production Gemini request was made, and no API key or environment secret was read or printed.
- No concurrency, insert-failure injection, server restart, ephemeral deployment, or local-file persistence test was run.
- Active values of `.env.local`, Supabase credentials, `AUTH_MODE`, `AI_PROVIDER`, and `SUPABASE_SERVICE_ROLE_KEY` were not disclosed or inspected.
- The current branch already had unrelated pre-existing modifications before the audit, primarily in Lost & Found and shared documentation. They were not attributed to the complaint module and were not changed.
- Static migration intent is not proof that migration `011` is applied to the active database.
- The report does not assert that raw UUID exposure violates an institution-specific policy; it records the source-level exposure and recommends an explicit policy decision.

## 12. Prioritized remediation roadmap

This is a recommendation only; no remediation was implemented during the audit.

### Priority 0 — Establish the authoritative runtime and security contract

1. Choose and document the session authority for mock versus configured Supabase deployments; prove OTP → session → complaint API with an isolated staging identity.
2. Decide whether student feeds are personal history or a sanitized campus-wide feed, then separate global cluster aggregates from row-level projections.
3. Define complaint lifecycle states, actor capabilities, assignment, responses, resolution/reopen/reject semantics, and audit requirements before adding UI.

### Priority 1 — Make complaint creation durable and consistent

1. Make threshold escalation plus complaint insertion atomic and concurrency-safe.
2. Replace local-disk evidence with durable, access-controlled storage and define orphan cleanup.
3. Bind attachment references to server-issued ownership and validate file bytes, count, size, and retrieval permissions.
4. Validate persisted records and API responses against shared Zod contracts.

### Priority 2 — Reconcile the intelligence boundary

1. Decide whether Module 2 analysis is part of submission. If yes, persist one validated analysis and use authorized current candidates; if no, remove “AI-assisted” claims from the core flow.
2. Make provider provenance truthful, sanitize Gemini errors, minimize model input, and reconcile model duplicate suggestions against database candidates.
3. Establish threshold semantics and a representative campus evaluation corpus for the lexical heuristics before using results for operational routing.

### Priority 3 — Complete operational readiness

1. Add staff queue/search/filter/pagination, notifications/acknowledgements, retry/idempotency, rate limits, audit logs, and observability that excludes private content.
2. Add live Supabase/RLS, two-role browser E2E, concurrency/failure-injection, attachment security, and deployment persistence checks.
3. Resolve contract/documentation drift and lint/UI wording warnings.

## 13. Recommended next step

Before changing implementation, run a controlled acceptance pass against an isolated Supabase project with fictional records and two authenticated identities (student and authorized staff). The acceptance gate should prove:

1. OTP/session establishment reaches complaint GET/POST in the intended environment.
2. A student cannot read another student's private record, while the intended global cluster aggregate remains correct.
3. Five separate reports produce one consistent emergency aggregate for permitted viewers.
4. A configured database failure cannot leave partial emergency state.
5. The product decision is explicit: either connect Module 2 analysis/persistence to submission or relabel the current flow as deterministic lexical clustering.
6. The staff lifecycle and student read-back requirements are agreed before implementation begins.

Until that acceptance pass and lifecycle decision are complete, the complaint module should be treated as a demo/prototype path rather than an operational grievance system.
