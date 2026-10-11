# CampusGram Complaint System — Text Analysis Intelligence Audit

**Date:** 2026-10-11 (Asia/Calcutta)

**Revision inspected:** local `main`, HEAD `65c06fc`

**Scope:** forensic source review and offline fictional-data evaluation only.

Evidence labels: **SOURCE** = inspected implementation; **EXECUTED** = exercised
offline in this audit; **PRIOR RECEIPT** = earlier acceptance documentation;
**NOT VERIFIED** = no relevant execution/evidence establishing the claim.

## 1. Executive summary

The real complaint flow is **deterministic text-only Jaccard grouping plus report
volume escalation**, not an integrated AI classifier. The user selects category;
the server stores it without text classification. Five rows in a cluster trigger
`is_emergency`, regardless of distinct owners, safety content, status, or age.

The separate authenticated `/api/complaints/analyze` endpoint offers mock keyword
classification/extraction and an optional Gemini adapter. No production UI caller,
analysis-table writer, automated department assignment, or severity-to-lifecycle
integration was found. The current complaints UI correctly says the analyzer is
not invoked by submission, although other project documents overstate integration.

**Most important confirmed observations:**

- Different locations can score **1.000** because single-letter block IDs disappear;
  a negated incident can score **0.667** against the incident it denies.
- Paraphrases, spelling variants, and Malayalam-script text lose recall. A mixed-text
  match can succeed accidentally after all Malayalam meaning is discarded.
- Five submissions from **one owner** escalate; resolved reports still contribute.
  A lone electrical hazard remains non-emergency in the complaint path.
- Standalone rules classify harassment as electrical maintenance when `ac` occurs
  inside “faced”; a non-urgent fire-drill poster becomes critical; an unconscious
  student is rated low. These rules currently do **not** drive the submission queue.
- Fixed mock confidences `0.85`/`0.88` and Jaccard-as-`confidence` are not calibrated.

On a deliberately difficult **20-pair exploratory set**, submission matching yielded
TP=5, FP=8, TN=2, FN=5; precision **38.46%**, recall **50.00%**, F1 **43.48%**.
These are stress-set measurements, **not an estimated production accuracy**.

**Preservation:** the three pre-existing modified Complaint documents remain
unchanged. This new report is the only workspace addition for this audit. No source,
dependencies, tests, fixtures, environment/configuration, schema, or migrations were
edited; no commit/push/reset/stash/branch switch occurred. No database was contacted,
no external AI call occurred, and no real student data or secret was included in
evaluation inputs/results or this report. No private environment file was loaded.
The pre-existing app/browser processes were not controlled by this audit.

## 2. Actual architecture and end-to-end data flow

### 2.1 Integrated submission path

1. **Input:** `apps/web/app/complaints/page.tsx:232–304`, `handleSubmit()` trims
   description and checks at least five characters. The category dropdown defaults
   to `infrastructure` and is user-controlled. Optional image upload is separate.
2. **HTTP:** the form calls `/api/complaints/upload`, then `POST /api/complaints`;
   it never calls the analyzer (`page.tsx:253,267,338–341`).
3. **Validation/identity:** `apps/web/app/api/complaints/route.ts`, `POST()` resolves
   server identity, parses `CreateComplaintRequestSchema`, validates owner-bound
   attachments, and replaces caller ownership with the authenticated identity.
   The shared text schema checks raw string length, not trimmed/informative content.
4. **Candidate acquisition:** `apps/web/lib/complaints/complaint-repository.ts`,
   `createComplaint()` calls `getComplaints("all")` without an owner projection,
   builds `{id,text,cluster_id}` candidates, and calls `findMatchingCluster()`.
5. **Matching:** `apps/web/lib/complaints/similarity-service.ts` delegates to
   `computeJaccardSimilarity()` from Module 2. Only text is scored: not image,
   category, explicit location, owner, date, status, or any model output.
6. **Decision/storage:** repository `createComplaint()` adopts the best candidate's
   cluster or creates a random/time-based cluster ID. Count is existing cluster rows
   plus one; threshold is five. It stores raw supplied text/category/location,
   `subcategory=null`, `status="submitted"`, cluster/emergency metadata,
   attachments, server owner, and timestamps. Count is derived/recomputed and
   returned, not stored as a Supabase `similar_count` column. It does not store similarity score,
   matched candidate ID, explanations, severity, sentiment, or model provenance.
7. **Persistence:** configured mode calls service-role
   `persist_complaint_with_emergency`; unconfigured/test mode uses process-local
   `persistToMemory()`. The RPC atomically cascades and inserts, but does not perform
   NLP or serialize the earlier read/match decision. Source:
   `supabase/migrations/20261009182617_complaint_lifecycle.sql:96–140`.
8. **Feed/detail:** `getComplaints()` recomputes row-count metadata, then owner-filters
   student rows. `GET` list/detail validate shared output schemas and use
   `projectComplaintForApi()` to omit actor/ownership columns. UI displays supplied
   category, lifecycle status/notes, text, images and aggregate counts; no analyzer
   assessment is displayed. `complaintGroupCounts()` distinguishes global count from
   permitted visible rows. Detail reuses stored cluster membership, not a new match.
9. **Lifecycle:** staff `PATCH` uses `updateComplaintLifecycle()` and the established
   transition matrix; it does not use NLP scores, model confidence, or emergency
   classification. Assignment is staff `take_ownership`, not automated dispatch.

### 2.2 Separate analyzer path

`apps/web/app/api/complaints/analyze/route.ts`, `POST()` authenticates and validates
`ComplaintAnalysisRequestSchema`, then calls `analyzeComplaint(parsed.data)` with
**no historical candidates/options**. It returns analysis but does not persist it.
`complaint_id` is an input/echo, not a lookup of a canonical complaint record.

`modules/complaint-intelligence/src/index.ts`, `analyzeComplaint()` validates again,
chooses provider, executes `generateMockAnalysis()` or `runGeminiAnalysis()`, and
validates `ComplaintAnalysisResponseSchema`. Mock processing combines:

- `analysis/classify.ts::ruleBasedClassify()` → category/subcategory;
- `analysis/severity.ts::ruleBasedSeverity()` → level, fixed score, keyword reason;
- `analysis/location.ts::ruleBasedLocation()` → regex building/floor/room;
- `analysis/entities.ts::ruleBasedEntities()` → equipment/facility/person matches;
- `clustering/match.ts::findSimilarCandidates()` → lexical candidate suggestions;
- `ai/gemini.ts::generateMockAnalysis()` → truncated first-sentence title, full-text
  echoed summary, static category→department/role suggestion, tags/confidences.

`runGeminiAnalysis()` defaults to `gemini-2.5-flash`, sends a combined instructional
and JSON-input string through one **user-role** message, parses JSON/fences, validates
`RawGeminiAnalysisSchema`, discards model cluster claims, and recomputes them locally.
Images/documents are represented only by presence flags: no actual attachment bytes
or URLs are sent/fetched by this adapter. No live model quality was evaluated.

`supabase/migrations/001_initial_schema.sql:93–115` defines
`complaint_ai_analysis`; no application insert/select caller was found. Schema
existence is not integrated analysis persistence. `searchCandidates()` is merely
an async wrapper over a supplied array, not database/vector retrieval.

## 3. Feature inventory and evidence

| Capability                                         | Implementation/integration                                                           | Test/evaluation evidence                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Text intake/minimum length                         | Integrated UI and shared/server schema; UI trims, schemas do not                     | SOURCE; whitespace bypass EXECUTED                      |
| Lexical duplicate/group assignment                 | Integrated `findMatchingCluster()` and Jaccard                                       | EXECUTED, 20 labelled pairs                             |
| Semantic/paraphrase similarity, TF-IDF, embeddings | Absent in complaint grouping; Lost & Found embeddings are unrelated                  | SOURCE                                                  |
| Category classification                            | Ordered substring rules or optional Gemini; standalone only                          | EXECUTED mock, 14 texts; live Gemini NOT VERIFIED       |
| Department routing                                 | Static mock suggestion/model string; no dispatch or assignment integration           | EXECUTED suggestions; SOURCE callers                    |
| Severity/urgency                                   | Keyword-based standalone severity; no separate calibrated urgency classifier         | EXECUTED, 13 labelled texts plus one uncertain case     |
| Sentiment classification                           | Absent: no field, processor, or complaint UI                                         | SOURCE search                                           |
| Priority                                           | Integrated volume flag only; not NLP priority                                        | EXECUTED in isolated process                            |
| Life-safety SOS priority                           | Separate Module 4 `emergency-service.ts::calculatePriority()` uses type/keywords     | SOURCE only; not invoked by complaint create            |
| Location/entities                                  | Regex heuristics, standalone only; API-supplied location stored separately           | EXECUTED representative room/block/entities             |
| Incident aggregation                               | Flat cluster membership/count, no related-incident hierarchy                         | EXECUTED bridge/wider-outage examples                   |
| Distinct-owner corroboration                       | Absent, despite UI wording                                                           | EXECUTED one-owner/five-row case                        |
| Low-confidence/manual review/abstention            | No operational gate or queue flag                                                    | SOURCE; vague input still success at 0.85 EXECUTED      |
| Provider failure handling                          | Generic failed envelope after SDK/parse/schema failures; one env-selection downgrade | EXECUTED fake SDK; existing mocked provider tests       |
| Analysis persistence/display                       | Table/contract documented; no write or analyzer UI consumer                          | SOURCE; live integration NOT VERIFIED                   |
| Confidence calibration/quality benchmark           | No calibration artifact or labelled NLP benchmark found                              | SOURCE; this audit's preliminary set is not calibration |

Existing Module 2 tests are two classification, two clustering, five validation and
five provider regressions. They check a few positive cases, structure/provenance,
sanitization, and authoritative candidate reconciliation—not NLP quality across
locations, languages, negation, spelling, or temporal recurrence. Some test names
say “semantically similar” although computation remains lexical. Complaint tests
cover grouping/count/privacy, not a comprehensive labelled intelligence benchmark.
Institutional seeds are directory fixtures, not NLP gold data; repository demo
complaints have manually populated category/location/cluster fields. Their existence
does not show those values were inferred correctly.

## 4. Algorithms, thresholds, and limitations

### Jaccard preprocessing and formula

`modules/complaint-intelligence/src/clustering/similarity.ts:1–27`:

```text
lowercase → replace every character outside [a-z0-9 and whitespace] with space
→ split whitespace → discard tokens with length <= 2 → deduplicate into a Set
score = |A ∩ B| / (|A| + |B| - |A ∩ B|), rounded to three decimal places
if either token set is empty, score = 0 (including two empty sets)
```

No stop-word list, Unicode normalization/transliteration, stem/lemma, synonym,
spelling correction, frequency weighting, or character n-grams exist. Common words
like “the”, “there”, “please” remain; “no”, “AC”, block A/B and Wi-Fi's `wi`/`fi`
disappear. “not” survives but does not prevent high similarity to a positive statement.
Punctuation splits words rather than preserving identifiers; `wifi` differs from
`wi-fi`. Order and repetitions are ignored, so changing word count alone cannot
increase a set score. Malayalam-script letters are removed, not translated.

### Matching policies are different

- **Submission:** default **0.35**, shared
  `DEFAULT_COMPLAINT_SIMILARITY_THRESHOLD`; `getSimilarityThreshold()` reads an
  optional process override. `parseFloat` accepts a numeric prefix such as
  `0.35junk` (EXECUTED); range checks only reject invalid/out-of-range parsed values.
  No dataset-derived rationale for 0.35 was found. This audit evaluated the unchanged
  default; the running app's private environment override was **NOT VERIFIED/read**.
- `findMatchingCluster()` scans every supplied candidate, keeps only the highest
  strictly greater score, and accepts it at `>= threshold`. Equal scores select
  the first candidate; repository candidate order is newest-first. It does not
  compare the query to a cluster centroid or all peers. Random IDs/timestamps vary;
  fixed-input similarity is deterministic but membership can depend on history/order.
- **Standalone:** `findSimilarCandidates()` compares text against **title + text**,
  lists candidates at **0.25**, but sets duplicate/`CLUSTER-<candidate_id>` only at
  **0.50**. Its `confidence` is the best Jaccard score, not a probability. It does
  not adopt the canonical persisted cluster ID or use the submission env override.
  No candidates means an empty match even for an obvious duplicate; the HTTP
  analyzer supplies none. Adding an unrelated title changed an exact duplicate's
  standalone flag from true to false (EXECUTED).
- Matches are mechanically explainable via token overlap, but overlap evidence,
  runner-up margin, rule version, and score are not persisted/displayed in the
  submission path. A match/no-match is forced; there is no uncertain review band.

### Other methods

`ruleBasedClassify()` lowercases and takes the first rule having any substring.
Rule order is infrastructure → IT → sanitation → hostel → academic → security.
No administration rule exists despite the enum/recipient mapping; fallback is other.
No word boundaries, negation, weights, multilingual vocabulary or multi-label logic
exist. Location words can accidentally change category (`academic` contains `ac`).

`ruleBasedSeverity()` similarly picks the first critical/high/medium substring,
returning exactly 9.5/7.8/5.0, else low 2.5. It does not distinguish quoted,
historical, resolved, negated or hypothetical danger, or affected-person count.
There is no sentiment model. Regex location only recognizes limited room/lab/hall,
floor and block/tower/wing/building forms; “library” generally produces no extracted
building. `raw_mention` is reconstructed normalized text, not an original span.
Entities use a small deduplicated regex dictionary, not general NER; the prefixed
person regex is limited. Numeric/structured output validation does not establish
semantic correctness.

Mock recipient confidence is always **0.88**, overall confidence always **0.85**;
severity scores are rule constants. Model confidences are self-reported and bounded
by Zod only. None were calibrated or empirically validated in the repository. No
thresholded operational action occurs when confidence is low.

## 5. Evaluation dataset and actual results

### 5.1 Protocol and labels fixed before execution

The temporary `/tmp/omnirush/text-audit-eval.cjs` declared all expected labels before
its first execution. It loaded existing TypeScript functions through the installed
TypeScript compiler in memory, with `NODE_ENV=test` in that child process, explicit
mock analysis, throwing database stubs and blocked network APIs. It did not load env
files, instantiate a real provider client, contact the running app, or write any
evaluation fixture to workspace/DB. A fake SDK exercised three provider responses.
Authentication was mocked only for the malformed-JSON route reproduction; this is
not a fresh authentication or browser acceptance test.

**Duplicate gold:** same physical incident/location/time, not merely shared category
or vocabulary. Dormitory Alpha is stipulated to mean Block A in D02. Monday/Friday
in D18 are distinct incidents, not two reports of an unresolved single outage. D10
can describe **one wider water outage**, but the two distinct locations should remain
separate local reports with a possible parent incident, not automatically be declared
the same local duplicate. These human labels are illustrative and require stakeholder
ratification before use as a real benchmark. The set intentionally stresses failures;
it is not representative, independently annotated, or statistically powered.

Each query was compared against **one** fixed candidate, eliminating retrieval/order
confounds for pair metrics. For the standalone comparison the candidate title equals
its text, so set deduplication prevents artificial title weighting. Additional
title/ordering/aggregation examples were evaluated separately. No threshold was tuned.

### 5.2 Pairwise duplicate detection

`Submit` = `findMatchingCluster()` at the existing default 0.35.
`Analyzer` = `findSimilarCandidates()` duplicate flag at its existing 0.50.
Each expected outcome below was prelabelled; `yes/no` denotes duplicate, not urgency
or shared wider-incident membership.

| ID  | Candidate text                                     | Query text                                                      | Expected duplicate | Jaccard | Submit | Analyzer |
| --- | -------------------------------------------------- | --------------------------------------------------------------- | ------------------ | ------- | ------ | -------- |
| D01 | Water leak in hostel Block A.                      | WATER LEAK in HOSTEL block A!!!                                 | yes                | 1.000   | yes    | yes      |
| D02 | There is no water supply in hostel Block A         | The taps in dormitory Alpha have run dry                        | yes                | 0.000   | no     | no       |
| D03 | Water leak in hostel Block A.                      | Water leak in hostel Block B.                                   | no                 | 1.000   | yes    | yes      |
| D04 | Water leak beside north library entrance           | No water leak beside north library entrance; only a broken sign | no                 | 0.667   | yes    | yes      |
| D05 | Broken projector in room 204.                      | help please                                                     | no                 | 0.000   | no     | no       |
| D06 | Projector not working in classroom 204             | projctr nt wrking clsrm 204 pls                                 | yes                | 0.111   | no     | no       |
| D07 | No water in hostel A washroom                      | Hostel A washroom ൽ വെള്ളം ഇല്ല                                 | yes                | 0.667   | yes    | yes      |
| D08 | ഹോസ്റ്റൽ എയിൽ വെള്ളം ഇല്ല                          | ഹോസ്റ്റൽ എയിൽ വെള്ളം ലഭിക്കുന്നില്ല                             | yes                | 0.000   | no     | no       |
| D09 | Smoke from sparking switchboard in Lab 102 Block A | Routine switchboard inspection in Lab 102 Block A               | no                 | 0.444   | yes    | no       |
| D10 | No water supply in hostel A                        | No water supply in hostel B                                     | no                 | 1.000   | yes    | yes      |
| D11 | WiFi router offline in central library             | Garbage overflow outside south hostel gate                      | no                 | 0.000   | no     | no       |
| D12 | Library Wi-Fi keeps disconnecting on second floor  | Library wireless connection drops repeatedly upstairs           | yes                | 0.100   | no     | no       |
| D13 | Wi-Fi router unavailable in library                | wifi router unavailable in library                              | yes                | 0.750   | yes    | yes      |
| D14 | Please fix broken projector in room 204            | Please fix broken window in room 205                            | no                 | 0.500   | yes    | yes      |
| D15 | Broken fan in room 102                             | Broken broken broken fan fan in room 102                        | yes                | 1.000   | yes    | yes      |
| D16 | There is a problem in the campus today             | There is a problem in the campus tomorrow                       | no                 | 0.667   | yes    | yes      |
| D17 | No water in hostel A washroom                      | hostel A washroom vellam illa pls                               | yes                | 0.333   | no     | no       |
| D18 | Library network outage on Monday                   | Library network outage on Friday                                | no                 | 0.600   | yes    | yes      |
| D19 | AC is off                                          | ac is off                                                       | yes                | 1.000   | yes    | yes      |
| D20 | Library internet is working                        | Library internet is not working                                 | no                 | 0.750   | yes    | yes      |

Notes: D07's Malayalam means water unavailable, but the matcher keeps only
`hostel,washroom`; its correct decision does not prove bilingual understanding.
D08 keeps **zero tokens on both sides**. D17 uses Romanized Malayalam “vellam illa”
(no water). D19's score comes entirely from **`off`**; equipment `AC` disappeared.
D16 is intentionally under-specified, not evidence supporting one shared incident.

| Preliminary task          | Positives / negatives | TP  | FP  | TN  | FN  | Precision | Recall | F1     |
| ------------------------- | --------------------- | --- | --- | --- | --- | --------- | ------ | ------ |
| Submission pair match     | 10 / 10               | 5   | 8   | 2   | 5   | 38.46%    | 50.00% | 43.48% |
| Standalone duplicate flag | 10 / 10               | 5   | 7   | 3   | 5   | 41.67%    | 50.00% | 45.45% |

Precision = TP/(TP+FP), recall = TP/(TP+FN), F1 = 2TP/(2TP+FP+FN).
The small threshold difference changes D09 only here. This is **not** evidence that
0.50 is universally better or should replace 0.35; it is not threshold calibration.
Pairwise metrics do not measure retrieval recall, cluster purity, or parent-incident
aggregation. No meaningful population confidence interval is claimed.

### 5.3 Standalone classification and urgency

Expected category is the preselected primary operational domain. Expected severity
is reviewer judgement for the stipulated fictional situation; C12 is too vague to
label severity and is excluded from severity/urgency metrics. With no medical
category, C09's gold uses security/safety as the intended responsible domain—a
taxonomy decision that must be confirmed institutionally, not assumed universal.

Department abbreviations: **M** Campus Maintenance & Civil Works; **IT** Campus IT &
Network Operations; **E** Estate & Housekeeping; **G** Student Grievance Cell.
All actual outputs came from `analyzeComplaint(...,{provider:"mock"})`, not the
submission path. Expected duplicate decisions are independent of this table.

| ID  | Text                                                                 | Expected category | Expected severity | Actual category | Actual severity | Suggested dept |
| --- | -------------------------------------------------------------------- | ----------------- | ----------------- | --------------- | --------------- | -------------- |
| C01 | Electric shock from switchboard in Lab 102 Block A.                  | infrastructure    | critical          | infrastructure  | critical        | M              |
| C02 | Hostel Wi-Fi router is continuously disconnecting since morning.     | it_services       | medium            | it_services     | low             | IT             |
| C03 | Garbage piles beside the north gate.                                 | sanitation        | medium            | sanitation      | low             | E              |
| C04 | I faced harassment near the main gate.                               | security          | high              | infrastructure  | low             | M              |
| C05 | Exam timetable is missing from the portal.                           | academic          | medium            | it_services     | low             | IT             |
| C06 | Fee reimbursement has been pending for three months.                 | administration    | low               | other           | low             | G              |
| C07 | Gas leak in the chemistry lab; students feel dizzy.                  | infrastructure    | critical          | other           | high            | G              |
| C08 | Please replace the faded fire drill poster; there is no fire.        | infrastructure    | low               | infrastructure  | critical        | M              |
| C09 | A student is unconscious and cannot breathe beside library entrance. | security          | critical          | other           | low             | G              |
| C10 | ഹോസ്റ്റലിൽ വെള്ളം ഇല്ല                                               | hostel            | high              | other           | low             | G              |
| C11 | hostel washroomil vellam illa                                        | sanitation        | high              | sanitation      | low             | E              |
| C12 | help please                                                          | other             | ?                 | other           | low             | G              |
| C13 | Projector not working in room 204.                                   | infrastructure    | medium            | other           | medium          | G              |
| C14 | Please repair the internet connection in the academic block.         | it_services       | medium            | infrastructure  | low             | M              |

Observed category agreement **6/14 (42.86%)**; exact severity agreement **3/13
(23.08%)**. These are preliminary agreement counts against the stated reviewer
labels, not validated multi-class performance. Administration is unreachable in
mock rules; category collisions systematically imply wrong recipient suggestions.

For a separately defined **urgent = high or critical** binary task: gold positives
6, negatives 7; TP=2, FP=1, TN=6, FN=4; preliminary precision **66.67%**, recall
**33.33%**, F1 **44.44%**. This does not quantify real emergency dispatch accuracy.
Every successful mock output still reported overall confidence **0.85**, recipient
confidence **0.88**, and an empty candidate cluster when none was supplied.

Extraction observations: C01 produced `Block A`, room `102`, switchboard entity;
C13 produced room `204` and projector entity despite category other. All other
14-text-set locations were null. Entity recognition and category classification use
different vocabularies. No extraction precision/recall was computed: this small set
was not exhaustively annotated for spans/entities.

### 5.4 Supplementary behavioral/security evaluations — EXECUTED

| Predefined question/expected safe behavior                                            | Actual observation                                                                                                                 | Scope                                                                       |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Blank content should fail/abstain                                                     | Five spaces passed create schema and completed mock analysis                                                                       | Schema/module execution, not HTTP create                                    |
| Reversing equally plausible different locations should not silently change membership | Equal-score candidates reversed changed chosen cluster A → B                                                                       | Actual `findMatchingCluster()`                                              |
| Unrelated title should not overturn an exact text duplicate                           | Ordinary title flag true; nine-word unrelated title flag false                                                                     | Actual `findSimilarCandidates()`                                            |
| Stable mock analysis should reproduce semantic output                                 | Repeated identical requests had identical `analysis` objects                                                                       | Metadata times/IDs excluded                                                 |
| Explicit unavailable live provider should fail, not look like live success            | `AI_PROVIDER=gemini` without key/options returned success/mock; explicit `{provider:"gemini"}` failed with configuration error     | Child-process env only; provider was visibly labelled mock                  |
| Provider failure/malformed output should fail without fragments                       | Fake SDK rejection and bad JSON returned sanitized `PROCESSING_FAILED`                                                             | Simulated SDK, **not live Gemini**                                          |
| Valid-shaped but inconsistent model output should not be authoritative                | Fake model `level=low, score=9.5`, arbitrary recipient/confidence=1 passed; fabricated cluster was correctly discarded             | Semantic-validation gap, not demonstrated prompt-injection success          |
| Malformed JSON should yield safe validation error                                     | Offline analyzer `POST()` returned 500 with `Unexpected token 'F', "FICTIONAL_"... is not valid JSON`                              | Real JSON parsing; auth mocked; caller fragment, not proven cross-user leak |
| Single genuine hazard should receive safety triage distinct from volume               | C01 mock severity critical; actual repository creation `is_emergency=false`; supplied category academic retained, subcategory null | Isolated repository, not live dispatch                                      |
| “Five distinct members” should exclude repeats by one member                          | Five identical reports, one owner: count 5, emergency true                                                                         | Actual memory-mode repository                                               |
| Closed historical cluster should not imply a new active five-owner incident           | Five seed-process rows set resolved, then new report: group_count=6/emergency true                                                 | Process-local fixture only                                                  |
| Cluster members should remain coherent                                                | A=`water leak north library entrance`; B adds `broken projector room`; C=`broken projector room`: all one cluster while J(A,C)=0   | Greedy bridge: J(A,B)=0.625, J(B,C)=0.375                                   |
| Concurrent identical reports should converge                                          | Five concurrent `createComplaint()` calls produced 5 clusters, 0 emergencies                                                       | Actual in-memory async race; DB concurrency **NOT VERIFIED**                |

Membership privacy implications and stronger dispatch policy require product
decisions; the audit did not alter emergency, ownership or lifecycle behavior.

### 5.5 Exploratory CPU cost

`findMatchingCluster()` only; Node **v24.19.0**, synthetic short-text candidates,
one warm-up and five timed runs per size. Candidate array construction/transpilation,
DB transfer, aggregation, sorting, HTTP, cold-start and provider latency excluded.

| Candidate rows | Median ms | Min ms | Max ms |
| -------------- | --------- | ------ | ------ |
| 100            | 0.289     | 0.278  | 0.435  |
| 1,000          | 2.154     | 1.505  | 4.586  |
| 5,000          | 9.183     | 7.468  | 12.081 |
| 10,000         | 12.956    | 12.559 | 13.556 |

These are one-host microbenchmarks, not an SLA or proof that production scales.
CPU matching is roughly O(N·T), retokenizing query/candidates each comparison.
Repository reads/sorts all returned rows for create/list/detail and recomputes
aggregates; sequential intake can approach quadratic total comparison work. DB
indexes on cluster ID do not index or accelerate this JavaScript text scan.

Important separate source risk: `getComplaints()` uses unpaginated `.select("*")`;
`supabase/config.toml:18` sets API `max_rows=1000`. Past that configured limit,
authoritative global counts/candidates can become only a returned slice. Actual
over-1,000-row API/DB behavior and production settings are **NOT VERIFIED** here.

## 6. Severity-ranked findings and failure examples

Severity reflects consequences **if the current behavior is used operationally**,
not a claim of production exploitation. Standalone-only model findings have lower
current blast radius than the integrated clustering/count findings.

| ID / severity                          | Finding, trigger and consequence                                                                                                             | Evidence and smallest next decision                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 — HIGH                             | Volume is not safety triage: a lone electrical hazard shows non-emergency/“Normal Priority”; five routine reports show emergency             | EXECUTED C01/repository. `complaint-repository.ts::createComplaint():239–255`; `page.tsx:502`. Decide separate safety triage and volume escalation; preserve the dedicated SOS path. Do not label normal volume as safe.                                                                                                                                                                              |
| F02 — HIGH                             | Rows are presented as distinct corroborating members; one owner can create all five. Closed/old reports also count                           | EXECUTED repeated-owner and resolved cases. Repository `recalculateClusterCounts():98–114`, `createComplaint():239–244`; UI `page.tsx:599`. Define independent corroboration, active-status/time window, duplicate/replay rules before changing aggregation.                                                                                                                                          |
| F03 — HIGH                             | Cross-location, negation and generic-vocabulary false matches can bundle distinct incidents and distort emergency counts                     | EXECUTED D03/D04/D14/D20. `similarity.ts::tokenize`, `similarity-service.ts::findMatchingCluster`. Records are not deleted, but staff emergency cards can hide distinctions; preserve location/negation and use uncertain review.                                                                                                                                                                     |
| F04 — HIGH, scale-dependent            | Unpaginated reads can undercount/exclude older candidates at the configured API row cap                                                      | SOURCE repository `getComplaints():163–186`; config `max_rows=1000`. Over-cap execution NOT VERIFIED. Separate authorized aggregate computation from bounded retrieval; test >1,000 rows before global-authority claims.                                                                                                                                                                              |
| F05 — HIGH, deployment-dependent       | Application owner projection is not the same as private database RLS                                                                         | SOURCE `005001_complaint_rls_and_cascade.sql:12–15` permits authenticated campus-wide SELECT; `lib/supabase/server.ts::createApplicationClient` differs for mock/real JWT. Later `011_security_advisor_cleanup.sql` narrows cascade execution, not this read policy. Direct JWT exposure/grants NOT VERIFIED in this audit. Require a separate authorized RLS review before real-auth privacy claims. |
| F06 — MEDIUM/HIGH by audience          | English paraphrases, typos, Malayalam and transliteration miss duplicates or discard safety meaning                                          | EXECUTED D02/D06/D08/D12/D17 and C10/C11. ASCII tokenizer/rules; no language support. Prioritize Unicode/domain normalization and bilingual labels; do not claim a multilingual model from input acceptance alone.                                                                                                                                                                                    |
| F07 — MEDIUM, standalone               | First-substring category and context-free severity produce misleading recipient/risk suggestions                                             | EXECUTED C04 `ac` in faced → maintenance; C05 portal outranks academic; C08 negated fire → critical; C09 unconscious → low. `ruleBasedClassify`, `ruleBasedSeverity`, `generateMockAnalysis`. Fix boundaries/context/coverage and add abstention before integrating dispatch.                                                                                                                         |
| F08 — MEDIUM                           | Greedy linkage, order and race yield incoherent/non-reproducible clusters                                                                    | EXECUTED bridge (endpoint score 0), reversed ties, five concurrent memory clusters. `findMatchingCluster():54–59`; repository read→match→insert. Define clustering consistency and stable tie policy; serialize authoritative assignment only with separate implementation authorization. DB race reproduction NOT VERIFIED.                                                                          |
| F09 — MEDIUM, standalone/provider      | Confidence and numeric shape can look authoritative without reliability or semantic constraints                                              | EXECUTED all mock confidences fixed; fake model low/9.5 and arbitrary recipient accepted. `gemini.ts:73–80,125–139`; contracts severity/recipient schemas. Treat scores as signals, validate catalog/domain invariants and add human review/calibration.                                                                                                                                              |
| F10 — MEDIUM, conditional external use | Raw complaint text and user recipient hint reach a provider without a found disclosure/retention policy; prompt instructions share user role | SOURCE prompts and `runGeminiAnalysis`. Text-based PII and instruction-injection remain possible; successful live injection/exfiltration NOT VERIFIED. Decide data policy, minimization, approved deployment and instruction separation before enabling/connecting this path.                                                                                                                         |
| F11 — MEDIUM                           | Input/operational guards are incomplete; malformed analyzer body echoes a fragment in HTTP 500                                               | EXECUTED spaces success and `FICTIONAL_` fragment. Schemas have no complaint maximum/trim; analyzer catch `route.ts:51–67` returns `error.message`; no route-level rate/body limit, explicit timeout or generation/token bound found. Add generic errors, meaningful-content limits and provider budgets; infrastructure limits NOT VERIFIED.                                                         |
| F12 — LOW/MEDIUM                       | Environment-selected unavailable Gemini silently degrades to successful mock rather than configuration failure                               | EXECUTED env Gemini/no key → `success=true,provider=mock`; options Gemini/no key → failure. `index.ts:52–72`. Provider is labelled mock, so this is not a false vendor identity; require an explicit unavailable/degraded contract and deployment health check.                                                                                                                                       |
| F13 — LOW, maintainability             | Thresholds/contracts/docs disagree, and explanations/model versions are not durable                                                          | SOURCE 0.35 vs 0.25/0.50; root `MEMORY.md:42` claims semantic similarity, 1–5 severity and dispatch, contrary to code/0–10 schema. Current complaints UI is more accurate. Align documentation and retain decision versions/evidence without exposing private peers.                                                                                                                                  |

The audit did **not** alter authorization, threshold, clustering, emergency logic,
lifecycle, RLS or provider behavior. Future fixes need explicit scope/ownership
alignment, especially shared contracts/database aggregation.

## 7. Security, privacy and provider review

### Confirmed protections

- Submission is authenticated, ownership is server-derived, attachments owner-bound,
  API rows owner-projected and actor identifiers removed. Feed/detail reuse shared
  Zod output checks. No NLP result grants staff privileges or lifecycle authority.
- The default submission flow does not send complaint text to Gemini. Standalone
  prompts omit explicit complaint/user IDs, biodata and metadata; send only text,
  recipient hint and image/document booleans. They do not fetch supplied URLs.
- Provider parse/schema/SDK failures return sanitized failed envelopes; malformed
  JSON is not silently accepted as analysis. No runtime provider-error fallback to
  successful mock was found after a chosen Gemini call fails. The env-selection
  downgrade in F12 happens **before** a live call.
- Model-supplied duplicate candidates/cluster IDs are ignored and locally reconciled;
  no fabricated history is trusted. No historical candidate texts are sent to Gemini
  by the current adapter. Empty default candidates do not use invented demo history.

### Remaining risks and boundaries

- Omitting separate identity fields does not remove names, contact details, medical
  information, or allegations embedded in raw free text. No approved retention,
  residency, training-use, consent/disclosure, or processor agreement was found for
  this complaint provider path. Provider policies/deployment controls **NOT VERIFIED**.
- Prompt JSON escaping prevents syntax breakage, not instruction following. The
  nominal system prompt is concatenated into a user message. The complaint and
  `requested_recipient` remain untrusted. Zod blocks bad shape, not a plausible false
  assessment, prompt echo, arbitrary free-text department, or confident hallucination.
  The fake-SDK semantic test proves acceptance of valid-shaped inconsistency, **not**
  that a real model was successfully injected.
- Global cluster IDs/counts exposed on an owner's report can act as a presence oracle
  for guessed incident text. This is not raw-peer leakage; it is a deliberate
  cross-owner aggregate signal requiring a privacy decision, minimum cohort/rate
  considerations and authorization-safe explanations.
- `findSimilarCandidates()` returns candidate IDs/titles/raw summaries with no owner
  filtering of its own. It is safe only if its caller supplies authorized candidates.
  Current HTTP analyzer supplies none; integrating campus-wide candidate retrieval
  must not directly expose private reports through this helper.
- Mock summary embeds the entire input text; entity extraction can include names.
  A future persisted/displayed summary is not anonymized simply because it is called
  “analysis”. Ordinary React string rendering escapes HTML, but browser XSS was
  **NOT VERIFIED** and model strings must never become raw HTML/tool instructions.
- Core list/create routes log raw caught backend errors (`complaints/route.ts:70,146`);
  DB messages can contain row/input details. This is a source risk; no real private
  log payload was inspected. Module 2's provider errors are already sanitized; do
  not reintroduce the old raw-model parse leak described in historical audits.
- No analyzer route-level cost throttling, maximum text size, deadline or token
  budget was found. Authenticated access alone does not prevent paid-provider abuse.
  SDK/host defaults and organization quotas were **NOT VERIFIED**.
- The Gemini request specifies no temperature/seed, response MIME/schema config or
  pinned immutable model revision. Even a temperature-zero future setting would not
  guarantee deterministic service behavior. Current mock semantic output repeats,
  but timestamps, durations, random IDs and tie/history-dependent grouping do not.

## 8. Prioritized improvement options — recommendations only

### Stage A — low-risk deterministic improvements, necessary now

| Method / failure addressed                                                                                                     | Benefit and trade-off                                                                                                                                     | Dependencies/privacy/latency/cost                                                                                  | Evaluation and urgency                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unicode normalization and identifier-aware tokenization; preserve negation, AC, block/room IDs; normalize Wi-Fi/domain aliases | Fix D03/D08/D13 and reduce accidental context loss. Preserving every short token increases noise; domain context is preferable to blanket inclusion       | Native JS Unicode support, no external service; local CPU only, no per-call fee or new infrastructure              | Required first. Lock current corpus regressions; bilingual/identifier/negation tests, clear original-text retention                                   |
| Curated stop words plus cautious weighted terms/character n-grams                                                              | Reduce boilerplate FPs; catch typos/transliteration variants. Never remove “no/not”; n-grams can confuse nearby room IDs or similar names                 | Small local dictionaries/implementation; larger feature sets/cache but no data egress                              | Evaluate typo recall **and** cross-location FP rate. Add only if baseline improves on held-out labels                                                 |
| Boundary-aware category rules, explicit rule reasons, negation/quotation handling, missing domain coverage and abstention      | Address faced/academic→AC, fire-drill FP, unreachable administration and vague confident success. Rules still cannot infer every medical/semantic context | Existing runtime, no model dependency; near-zero marginal cost. Governance needed for category/urgency definitions | Required before automatic routing. Publish conflict policy; C04/C08/C09, uncertain cases, language slices must be reviewed                            |
| Explainable similarity evidence and separate auto-match / review / no-match bands                                              | Avoid forcing ambiguous merges; maintain score/margin/rule version. Must not show private peer text or inferred personal identities                       | Existing app/contracts with future additive agreement; modest storage/CPU and staff review burden                  | Label ≥200 initial pair/group examples with separate incident relations; tune on development set, evaluate unseen set. Do not simply raise/lower 0.35 |
| Separate safety triage from volume; define active distinct-owner corroboration, replay/age policy, deterministic ties          | Prevent lone hazard “normal” and repeated/closed-count escalation. This is a product behavior decision, not a tokenizer tweak                             | Existing Next/Supabase only; future authorized aggregation/contract work, not a new service                        | Highest product priority. Test one hazard, one owner ×5, five owners, closed history, time windows and concurrency, preserving authorization          |
| Input/error/provider guards and visible mock/degraded provenance                                                               | Reject meaningless/oversized input, redact exceptions, bound cost; fail clearly if intended provider is unavailable                                       | Existing schemas/routes; small validation cost, no external dependency                                             | Required before provider enablement; spaces/long input/JSON failures/no-key/rate limits; privacy policy before raw text egress                        |

### Stage B — stronger matching/classification, only if Stage A evidence warrants it

| Method                                                                                        | Benefit/trade-off and current failure                                                                                            | Requirements and operational/privacy impact                                                                                                                                                                                               | Evaluation / can wait?                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TF-IDF/BM25-style lexical ranking + inverted candidate index                                  | Discount common words and retrieve efficiently; still weak on no-overlap paraphrases/Malayalam aliases; IDF changes with corpus  | Small JS library or approved existing Postgres text search. No new service required; vocabulary/version/cache lifecycle and RLS-safe retrieval needed                                                                                     | Compare recall@k, pair precision and cluster purity on held-out incidents; useful as dataset grows, not automatically needed at hackathon scale                                                                             |
| Character n-gram TF-IDF / multilingual lexical hybrid                                         | Better spelling/Manglish variants without a large model; may merge near-identical identifiers if unweighted                      | Local vectorization dependency optional; moderate memory/CPU, no provider fee/egress                                                                                                                                                      | English/Malayalam-script/Manglish and location-ID hard negatives; lightweight candidate before semantic infrastructure                                                                                                      |
| Small multilingual sentence embeddings as a second-stage signal                               | Address D02/D12 semantic paraphrases and cross-script equivalents; vectors can blur different locations/negation                 | Model package/download and local CPU/RAM (or approved provider); optional authorized complaint-specific vector storage using existing infrastructure, never reuse Lost & Found ownership logic. Hosted embeddings still send private text | Compare retrieval recall@k and pair/group errors; test adversarial negation/location/time. Local deployment avoids inference egress but vectors/text remain sensitive. Can wait until measured benefit justifies complexity |
| Separate supervised category and urgency classifiers; sentiment only for a justified use case | Replace ordered substrings with learned context; requires labelled data and transparent policy. Sentiment is not danger/priority | Lightweight local classifier/embedding head possible; training/evaluation dependency and versioning. No need for a large generative model; don't use affect to suppress complaints                                                        | Per-class confusion matrices, safety recall/FPR, minority-language errors. Human confirmation for ambiguous/low-support cases; sentiment can wait or remain absent                                                          |
| Human confirmation and parent-incident relation model                                         | Distinguish duplicate, related outage and unrelated reports; prevent greedy bridge clusters                                      | Existing staff UI plus future additive relation/evidence records; staff workload and consistent audit decisions                                                                                                                           | Cluster purity/B-cubed-style metrics, linkage disagreement and D10 parent incidents. Required when ambiguity affects dispatch, not merely to decorate UI                                                                    |

### Stage C — production-grade intelligence, before production claims

| Requirement                                              | Benefits/trade-offs                                                                                                        | Operational/privacy/cost implications                                                                                                                                             | Acceptance evidence                                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versioned representative datasets/regression benchmarks  | Avoid tuning to this stress set; English, Malayalam, Manglish, spelling, category, urgent negation, time/location coverage | Fictional/consented de-identified data first; two reviewers and adjudication, incident-level train/dev/test separation, controlled access/retention                               | Publish counts, label policy, agreement, slice errors and untouched holdout; no fabricated quality metrics                                                                |
| Calibration/monitoring                                   | Distinguish similarity, classifier confidence and reliability; detect drift                                                | Calibrate only supported probabilistic classifiers using held-out labels; replace fixed mock confidence with explicit heuristic/unknown provenance. Avoid private-text logging    | Reliability plots/Brier or ECE when applicable, operational recall/FPR, drift/review workload; never interpret raw Jaccard as probability                                 |
| Privacy-aware deployment/retention and provider fallback | Prevent unapproved raw-text egress or silent reliability downgrade                                                         | Approved local/managed processing, minimization/redaction, data location/retention decision, disclosure, access controls, error redaction. Explicit pending/failed/degraded state | Egress tests, authorization-safe candidate projection, deletion/retention tests, mocked outage tests. A fallback changes quality and must not claim identical reliability |
| Reproducible/versioned decisions                         | Make re-evaluation traceable without retroactively corrupting history                                                      | Record algorithm/model/prompt/candidate-policy versions, language, score/evidence, source input linkage, manual overrides; model revision changes need benchmark gates            | Replay fixed snapshot; stable membership under defined tie/concurrency policy; live-model determinism **NOT GUARANTEED**                                                  |
| Cost/latency/capacity measurement                        | Select the smallest adequate method; prevent unbounded bills/timeouts                                                      | Existing telemetry with metadata-only logging, token/request caps, p50/p95 CPU/network/DB/cost measurements, bounded retrieval and cache invalidation                             | Comparable workloads/quality gates; >1,000-row aggregation tests and load tests. Current CPU microbenchmark does not replace these                                        |

A larger LLM is not the first recommended fix: it does not enforce distinct owners,
time/status scope, database authority, privacy, or correct label semantics. Start
with those contracts and measured deterministic errors.

## 9. Proposed target architecture — NOT IMPLEMENTED

```text
Authenticated institutional identity
  → validated, bounded raw complaint (preserve original + user-selected category)
  → pure Module 2 normalized features/language and decision provenance
      ├─ bounded authorized-internal candidate retrieval
      │    → lexical/optional semantic ranking
      │    → location/time/status compatibility + ambiguity policy
      │    → duplicate / related-parent-incident / no-match / human-review suggestion
      └─ independent category and safety/urgency assessment
           → safe suggestion or uncertainty; never authorization instructions
  → server-owned transactional membership and independent-corroboration policy
  → canonical complaint + versioned decision evidence
  → owner/staff-safe projections (global authorized aggregate ≠ private peer rows)
  → staff-confirmed routing/lifecycle + separate safety/SOS handling
```

Preserve `apps/web` as authorization/persistence/UI owner, Module 2 as pure domain
processing, shared additive contracts, and existing Supabase. No Redis/Kafka/new
microservice is needed by default. Privacy-safe retrieval must distinguish internal
matching authority from what the caller is permitted to see. Existing lifecycle and
staff permissions remain independent of analysis; raw provider output must never
directly grant capabilities, issue commands, or determine irreversible actions.

## 10. Phased implementation plan and acceptance criteria

This is a proposal for a later authorized phase, **not permission to implement it**.

1. **Policy/evaluation baseline first.** Confirm category/safety taxonomy, whether
   five reports means distinct active owners, duplicate vs parent incident semantics,
   status/time scope and visibility. Keep raw/annotated evaluation sets versioned and
   isolated; review this audit's ambiguous labels. Acceptance: ≥200 initially labelled
   pairs/groups, two-reviewer adjudication, incident-level holdout separation and
   explicit language/location/time/negation slices. Dataset size is a proposed
   starting point, not a power calculation or guarantee.
2. **Deterministic guardrails.** Implement Unicode/domain/identifier normalization,
   boundary-aware categories, contextual severity, meaningful text limits, safe
   errors, explicit provider availability and review outcomes. Acceptance: D03/D04/
   D08/D14/D20 and C04/C08/C09 regressions explained; uncertainty not marked calibrated;
   no new network egress; body spoofing, owner privacy and existing lifecycle tests
   remain intact. Any changed threshold must improve an untouched evaluation set,
   not merely these selected examples.
3. **Aggregation/retrieval authority.** Under separate shared-database authorization,
   make counts and assignment conform to approved owner/status/time/concurrency
   policy; remove returned-slice assumptions and version membership decisions.
   Acceptance: one owner ×5 does not claim five independent members under that policy;
   five distinct eligible owners cross the approved threshold; historical reports,
   bridge chains, equal-score ties, replay and concurrent arrivals have explicit
   expected outcomes; >1,000-row tests verify correct aggregates and privacy.
4. **Compare lightweight alternatives in shadow mode.** TF-IDF/BM25/character n-grams
   first, then optional multilingual embeddings/small classifiers if needed.
   Acceptance: held-out precision/recall and cluster-quality improvement, urgent
   false-negative/false-positive rates within an approved policy, language slices and
   review load reported. For auto-merges a high-precision target such as ≥95% may be
   appropriate but must be agreed and backed by sufficient sample counts/uncertainty;
   it is not a claim the current or proposed algorithm already achieves it.
5. **Production gate.** Approved data-handling decision, versioned provider/model,
   authorized persistence/display, budget/deadline/failure handling, safe monitoring,
   candidate RLS audit and browser multi-user acceptance. Acceptance: no unapproved
   egress, no raw-private logging, no silent success on analysis failure, semantic
   constraints enforced, evaluated cost/latency/capacity and documented rollback.

## 11. Open questions and limitations

- Is automatic “Emergency” intended as volume awareness or operational safety?
  Should a medical incident use a new category or the separate SOS taxonomy?
- Does corroboration mean distinct institutional owners, and which statuses/time
  periods qualify? Can reports at separate locations share a parent incident while
  retaining local evidence and assignment?
- Which categories/departments are authoritative? How should multi-issue text or
  mixed location/equipment priorities be resolved? Is sentiment useful at all?
- Is Malayalam-script/Manglish support required for the intended campus audience,
  and who validates translations/domain aliases?
- Should the standalone analyzer be integrated, remain a developer tool, or be
  disabled unless an approved provider/data policy is configured?
- How much cross-owner aggregate inference is acceptable? Direct JWT/RLS, real
  provider consent/retention, running-app threshold override and production row-cap
  settings are **NOT VERIFIED**; no private configuration or live records were read.
- Live Gemini quality/injection, SDK retries/deadlines, deployment cost/latency,
  real database concurrency, over-cap queries, browser rendering and operator workflow
  are **NOT VERIFIED**. Current audit execution used no browser or live app requests.
- Existing Phase 6B local acceptance and 346-test receipts are prior work, not a new
  production/ML-quality proof. This audit reran only Module 2's 14 existing tests and
  the offline evaluation; full build/lint/typecheck were not rerun because no
  application change was made. Existing source fixtures/tests remain untouched.

## 12. Reproducibility and verification receipt

### Commands actually executed

```bash
git status --short
git diff --stat
git log -1 --oneline
node --check /tmp/omnirush/text-audit-eval.cjs
node /tmp/omnirush/text-audit-eval.cjs
env -u GEMINI_API_KEY AI_PROVIDER=mock \
  NODE_OPTIONS='--require /tmp/omnirush/text-audit-network-guard.cjs' \
  pnpm --filter @smart-campus/complaint-intelligence test
node /tmp/omnirush/text-audit-check.cjs --verify-only
node --check /tmp/omnirush/text-audit-reproduce.cjs
node /tmp/omnirush/text-audit-reproduce.cjs
pnpm exec prettier --check docs/complaint/TEXT_ANALYSIS_AUDIT.md
git diff --check
git diff --no-index --check /dev/null docs/complaint/TEXT_ANALYSIS_AUDIT.md
```

**EXECUTED:** 20 pairs, 14 classification texts (13 urgency/severity labels),
supplementary cases in §5.4, four CPU candidate sizes; **14 existing tests passed in
4 files**. Offline harness counters: **0 network attempts, 0 database attempts,
3 simulated SDK calls, 0 external AI calls**. No threshold was tuned. Harness and
baseline-verification files were temporary and removed after use.

The report's portable reproduction block was also extracted and executed; its
20-pair and 14-text outputs/counts exactly matched the original labelled core run,
with zero network/provider attempts. The no-index whitespace command returns the
normal “files differ” exit for a new report; preservation verification separately
asserted that it emitted no whitespace diagnostics.

### Portable offline reproduction of the labelled core results

The table texts/gold labels in §5 are the reproducible fixture, not real incidents.
Save the following as a temporary `.cjs` **outside the workspace** and run `node`
on it from the repository root with installed dependencies. It reads this report's
tables, transpiles the actual TS source in memory, blocks network/database access,
stubs the provider, and recomputes pair/classification metrics. It changes no source,
config, tests, fixtures or database. Column whitespace formatting does not affect
the tokenizer. CPU timing varies; this core reproduction is not a live-provider,
authentication or production-performance test.

```javascript
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const root = process.cwd();
const req = Module.createRequire(path.join(root, "apps/web/package.json"));
const ts = req("typescript");
process.env.NODE_ENV = "test";
process.env.AI_PROVIDER = "mock";
delete process.env.GEMINI_API_KEY;
let attempts = 0;
const blocked = () => {
  attempts++;
  throw new Error("Offline audit only");
};
globalThis.fetch = blocked;
for (const name of ["node:http", "node:https"]) {
  const lib = require(name);
  lib.request = blocked;
  lib.get = blocked;
}
const net = require("node:net");
net.connect = blocked;
net.createConnection = blocked;
Module._extensions[".ts"] = (mod, file) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    file,
  );
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === "@google/genai") {
    return {
      GoogleGenAI: class {
        constructor() {
          blocked();
        }
      },
    };
  }
  return originalLoad.call(this, name, ...args);
};
const load = (relative) => req(path.join(root, relative));
const intelligence = load("modules/complaint-intelligence/src/index.ts");
const grouping = load("apps/web/lib/complaints/similarity-service.ts");
const report = fs.readFileSync(
  path.join(root, "docs/complaint/TEXT_ANALYSIS_AUDIT.md"),
  "utf8",
);
const tableRows = (prefix) =>
  report
    .split("\n")
    .filter((line) =>
      new RegExp("^\\|\\s*" + prefix + "\\d{2}\\s*\\|").test(line),
    )
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
function metrics(rows) {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (const [gold, prediction] of rows) {
    if (gold && prediction) tp++;
    else if (!gold && prediction) fp++;
    else if (gold) fn++;
    else tn++;
  }
  return {
    tp,
    fp,
    tn,
    fn,
    precision: tp / (tp + fp),
    recall: tp / (tp + fn),
    f1: (2 * tp) / (2 * tp + fp + fn),
  };
}
(async () => {
  if (grouping.getSimilarityThreshold() !== 0.35) {
    throw new Error("Do not tune thresholds: unexpected inherited override");
  }
  const pairs = tableRows("D").map(([id, candidate, query, label]) => ({
    id,
    gold: label === "yes",
    score: intelligence.computeJaccardSimilarity(candidate, query),
    submission: grouping.findMatchingCluster(query, [
      { id, text: candidate, cluster_id: id },
    ]).matched,
    standalone: intelligence.findSimilarCandidates(query, [
      { complaint_id: id, title: candidate, text: candidate },
    ]).is_potential_duplicate,
  }));
  const classifications = [];
  for (const [id, text, goldCategory, goldSeverity] of tableRows("C")) {
    const result = await intelligence.analyzeComplaint(
      { complaint_id: id, text },
      { provider: "mock" },
    );
    if (!result.success) throw new Error("Unexpected mock failure");
    classifications.push({
      id,
      goldCategory,
      goldSeverity,
      category: result.analysis.category,
      severity: result.analysis.severity.level,
    });
  }
  const urgent = classifications.filter((row) => row.goldSeverity !== "?");
  const isUrgent = (level) => ["high", "critical"].includes(level);
  console.log(
    JSON.stringify(
      {
        pairs,
        classifications,
        submission: metrics(pairs.map((row) => [row.gold, row.submission])),
        standalone: metrics(pairs.map((row) => [row.gold, row.standalone])),
        categoryCorrect: classifications.filter(
          (row) => row.category === row.goldCategory,
        ).length,
        severityCorrect: urgent.filter(
          (row) => row.severity === row.goldSeverity,
        ).length,
        urgency: metrics(
          urgent.map((row) => [
            isUrgent(row.goldSeverity),
            isUrgent(row.severity),
          ]),
        ),
        networkOrProviderAttempts: attempts,
      },
      null,
      2,
    ),
  );
  if (pairs.length !== 20 || classifications.length !== 14 || attempts !== 0) {
    throw new Error("Dataset/network guard verification failed");
  }
})();
```

### Final worktree preservation

The initial three modified files were `ACCEPTANCE_REPORT.md` (98 added lines),
`IMPLEMENTATION_STATUS.md` (4 added/1 removed), and `MEMORY.md` (10 added), all under
`docs/complaint/`. Their content digests and HEAD were captured outside the workspace
before execution and compared afterward without publishing hashes or private data.
No application/configuration/dependency/migration/test changes were made. This report
is a new, uncommitted file; existing documentation was not overwritten. Final
`git diff --check` plus a no-index report whitespace check passed.
