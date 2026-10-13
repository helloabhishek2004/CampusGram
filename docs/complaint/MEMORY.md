# CampusGram Complaint System Memory

> **Current-state clarification (2026-10-11):** The original overview/tables below
> include historical campus-wide feed and public-upload descriptions, not the
> current security boundary. Current student API views are owner-scoped, with
> authoritative global cluster counts. New uploads live in private ignored
> `apps/web/.data/uploads/complaints` and require owner/staff-authorized byte reads.
> Text similarity uses Phase 2 Unicode-aware tokenization, Malayalam support,
> explicit location/negation conflict checks, and deterministic tie-breaking.
> Installed Next.js is 15.5.27. Local API/database acceptance was executed, but
> browser E2E awaits a user-controlled OTP handoff and is not verified. Read
> `IMPLEMENTATION_STATUS.md` and the latest `ACCEPTANCE_REPORT.md` addendum for
> current behavior, renamed migrations, executed receipts and remaining limits.

## 1. Module Overview

### Purpose
The **CampusGram Complaint System** is the grievance management module within the CampusGram smart campus platform. It enables campus students, faculty, and administrators to report, monitor, and resolve campus issues (ranging from infrastructure maintenance and sanitation to IT failures and security concerns).

### Core Problem Solved
On university campuses, when an infrastructure failure occurs (e.g., water outage in a hostel, campus-wide Wi-Fi breakdown, power failure in an academic block), dozens of students simultaneously submit duplicate complaints describing the same incident. Without automated grouping, dispatchers are overwhelmed by duplicate tickets, and high-impact emergencies are buried in noise.

The Complaint System solves this by:
1. Automatically grouping similar complaints using lexical similarity detection based **strictly on complaint text**.
2. Tracking the aggregate volume of similar reports in real-time.
3. Automatically escalating any issue cluster that reaches **5 or more reports** into an **Emergency Incident**.

### Core Flow

```text
User
  ↓
Complaint text (≥ 5 chars)
  +
Optional image (PNG/JPG/WebP/GIF ≤ 5MB)
  ↓
Runtime Validation (Zod & Route Handlers)
  ↓
Text-Only Similarity Detection (modules/complaint-intelligence)
  ↓
Cluster Assignment (Match ≥ 0.35 → Existing Cluster, else New Cluster ID)
  ↓
Cluster Count Calculation (Aggregated from cluster_id)
  ↓
  ├─ Count < 5  → Status: Normal Priority
  └─ Count ≥ 5  → Status: Escalated to Emergency (Cascades to all cluster peers)
  ↓
Campus Feed Display:
  ├─ All Tab: Campus-wide grievances with similarity badges
  ├─ Normal Tab: Individual normal grievances
  └─ Emergency Tab: One aggregated Emergency Cluster summary card per cluster
```

### Critical Architectural Boundary
**IMAGE IS NOT PART OF SIMILARITY DETECTION.**
Images submitted by users are strictly used for storage, retrieval, and UI rendering. The similarity matching pipeline receives and processes exclusively `complaint.text`.

---

## 2. Current Implementation Status

| Feature / Subsystem | Status | Details |
| :--- | :--- | :--- |
| **Complaint Submission** | `IMPLEMENTED` | Form accepts text (min 5 chars), category, and optional image. Validated via Zod schemas. |
| **Optional Image Attachment** | `IMPLEMENTED` | Image selection, file size/type validation, preview thumbnail, removal before submit, and feed display. |
| **Complaint Listing** | `IMPLEMENTED` | Campus-wide feed displaying text, timestamp, category badge, cluster ID, and report counts. |
| **Normal Feed** | `IMPLEMENTED` | Dedicated view (`view=normal`) showing individual non-emergency complaints. |
| **Emergency Feed** | `IMPLEMENTED` | Dedicated view (`view=emergency`) showing active emergency incidents. |
| **Emergency Cluster Grouping** | `IMPLEMENTED` | Emergency feed aggregates complaints by `cluster_id` into **one summary card** per unique cluster. |
| **Emergency Cluster Detail Modal** | `IMPLEMENTED` | Clicking "View reports" on an emergency card opens a modal listing all individual reports in that cluster. |
| **Text-Only Similarity** | `IMPLEMENTED` | Reuses lexical `computeJaccardSimilarity` from `modules/complaint-intelligence`. |
| **Cluster Assignment** | `IMPLEMENTED` | Target cluster resolved via best similarity match against existing complaint candidates (threshold `0.35`). |
| **Emergency Threshold (5 Reports)** | `IMPLEMENTED` | Count $< 5$ is Normal; count $\ge 5$ triggers Emergency cascade across all cluster peers. |
| **Image Upload & Storage** | `PARTIALLY IMPLEMENTED` | Implemented using local filesystem (`public/uploads/complaints/`). Local/demo storage only, not Supabase Storage. |
| **Supabase Database Integration** | `IMPLEMENTED` | Dual-mode support: Supabase PostgreSQL when credentials exist, in-memory mock fallback when offline. |
| **Campus-Wide RLS Visibility** | `IMPLEMENTED` | Migration `005_complaint_rls_and_cascade.sql` implements `TO authenticated USING (true)` on `public.complaints`. |
| **Safe Emergency Cascade RPC** | `IMPLEMENTED` | `cascade_complaint_emergency` `SECURITY DEFINER` Postgres function deployed via migration `005`. |
| **Authentication Integration** | `IMPLEMENTED FOR MOCK FLOW` | Requires the signed HTTP-only application session; server derives ownership and rejects anonymous/unauthenticated complaint operations. Mock authentication remains demo-only. |
| **Automated Test Suite** | `IMPLEMENTED` | 19 complaint tests in `apps/web/tests/complaint.test.ts`, plus focused attachment-security, lifecycle, and auth-hardening suites covering the Phase 2 boundaries. |

### Phase 2 implementation update (2026-10-09)

The current implementation also includes server-enforced complaint lifecycle updates, global cluster aggregation before owner-only row projection, owner-bound local attachment references with server-side image signature checks, sanitized API projections, and signed mock-session hardening. Authorized staff use `PATCH /api/complaints/[id]` with the existing statuses (`submitted`, `under_review`, `in_progress`, `resolved`, `rejected`); students remain owner-scoped and cannot perform staff mutations. The core submission path remains deterministic lexical clustering and does not claim to run Gemini.

The additive migration `20261009182617_complaint_lifecycle.sql` adds response notes, status history, and service-role-only atomic persistence functions. It must be applied through the normal Supabase migration workflow before configured persistence can use those functions. Live Supabase, RLS, browser two-user, and deployment verification remain outstanding.

---

## 3. Technology Stack

### Frontend
* **Framework:** Next.js `15.2.1` (App Router).
* **React:** React `19.0.0` / React DOM `19.0.0`.
* **Language:** TypeScript `5.8.2` (strict mode, zero type errors).
* **Styling:** Tailwind CSS `3.4.17` with PostCSS and Autoprefixer.
* **Component Primitives:** Monorepo shared package `@smart-campus/ui` (`Card`, `Badge`, `Button`).
* **Icons:** `lucide-react` `1.16.0` (`Flame`, `Clock`, `Layers`, `AlertTriangle`, `CheckCircle2`, `Upload`, `X`, `RefreshCw`, `FileText`, `AlertCircle`, `ArrowLeft`).
* **Component Architecture:** Client Component (`"use client"`) in `apps/web/app/complaints/page.tsx` managing interactive form submission, file upload, reactive tabs, cluster aggregations, and modals.
* **State Management:** React local state (`useState`, `useMemo`, `useEffect`, `useRef`).

### Backend
* **Runtime:** Next.js Route Handlers (`NextRequest`, `NextResponse`) executing Node.js server-side.
* **Language:** TypeScript `5.8.2`.
* **Validation:** Zod `3.24.2` via `@smart-campus/contracts`.
* **Filesystem Access:** Node.js native `fs/promises`, `path`, and `crypto`.
* **Database Client:** `@supabase/ssr` `0.6.1` and `@supabase/supabase-js` `2.49.1`.
* **Error Handling:** Standardized JSON error envelopes: `{ success: false, error: { code: string, message: string, details?: any } }`.

### Database
* **Database Engine:** PostgreSQL (managed by Supabase).
* **Migrations:** SQL migration scripts located in `supabase/migrations/`:
  * `001_initial_schema.sql`: Base `public.complaints` and `public.complaint_ai_analysis` tables.
  * `004_complaint_clusters.sql`: Adds `cluster_id` (TEXT), `is_emergency` (BOOLEAN), B-Tree indexes, and `complaint_cluster_summary` view.
  * `005_complaint_rls_and_cascade.sql`: Campus-wide authenticated `SELECT` policy and `cascade_complaint_emergency` `SECURITY DEFINER` function.
* **Row Level Security (RLS):** Enabled on `public.complaints`. Authenticated users can view all complaints. General direct `UPDATE` and `DELETE` permissions are revoked.
* **Indexes:** `idx_complaints_cluster_id` and `idx_complaints_is_emergency`.

### AI / NLP
* **CURRENT SIMILARITY IS LEXICAL JACCARD SIMILARITY.**
  * Function: `computeJaccardSimilarity(textA, textB)` from `modules/complaint-intelligence/src/clustering/similarity.ts`.
  * Algorithm: Word token set intersection over union ($|A \cap B| / |A \cup B|$).
  * **It is NOT:** An embedding model, dense vector search, pgvector, Gemini, OpenAI, Claude, or a neural network. Jaccard similarity is purely lexical string token set mathematics.

### Image Processing
* **Images are used ONLY for:**
  * Uploading via multipart form data (`POST /api/complaints/upload`).
  * Storing on disk (`public/uploads/complaints/[uuid].[ext]`).
  * Retrieving via URL (`/uploads/complaints/[uuid].[ext]`).
  * Displaying in cards and zoom modals.
* **There is NO:** OCR, image embeddings, image classification, computer vision, CLIP, YOLO, or image-to-image similarity.

### Testing
* **Test Runner:** Vitest `3.2.7`.
* **Execution Command:** `npx pnpm test` (monorepo recursive) or `npx pnpm --filter @smart-campus/web test`.

---

## 4. Repository / File Structure

| File Path | Layer | Responsibility | Future Modification Rules |
| :--- | :--- | :--- | :--- |
| [`packages/contracts/src/complaint.ts`](file:///c:/Users/arath/campus-hackthon/packages/contracts/src/complaint.ts) | Shared Contracts | Single Source of Truth for Zod schemas (`ComplaintRecordSchema`, `CreateComplaintRequestSchema`, `ComplaintAttachmentSchema`, etc.) and constants (`COMPLAINT_EMERGENCY_THRESHOLD = 5`, `DEFAULT_COMPLAINT_SIMILARITY_THRESHOLD = 0.35`). | **Additive only**. Never make breaking field renames. Used by Web, Module 2, and tests. |
| [`modules/complaint-intelligence/src/clustering/similarity.ts`](file:///c:/Users/arath/campus-hackthon/modules/complaint-intelligence/src/clustering/similarity.ts) | Shared Module | Contains `tokenize(text)` and `computeJaccardSimilarity(textA, textB)`. Shared lexical tokenization logic. | Owned by Module 2. Web module imports functions from here without rewriting them. |
| [`apps/web/lib/complaints/similarity-service.ts`](file:///c:/Users/arath/campus-hackthon/apps/web/lib/complaints/similarity-service.ts) | Backend Domain | Compares complaint text against existing candidate complaints and resolves target `cluster_id` using threshold `0.35`. | Can be modified for candidate pre-filtering or threshold loading adjustments. |
| [`apps/web/lib/complaints/complaint-repository.ts`](file:///c:/Users/arath/campus-hackthon/apps/web/lib/complaints/complaint-repository.ts) | Backend Persistence | Dual-mode data access layer (Supabase PostgreSQL + local in-memory fallback), cluster aggregation, and emergency cascade execution. | Main database access point. Modify here when migrating storage or queries. |
| [`apps/web/app/api/complaints/route.ts`](file:///c:/Users/arath/campus-hackthon/apps/web/app/api/complaints/route.ts) | Backend API | Route handler for `GET /api/complaints` (list & filter) and `POST /api/complaints` (create & cluster). | Primary complaint submission & listing API. |
| [`apps/web/app/api/complaints/upload/route.ts`](file:///c:/Users/arath/campus-hackthon/apps/web/app/api/complaints/upload/route.ts) | Backend API | Route handler for `POST /api/complaints/upload`. Validates MIME type and file size, saves to `public/uploads/complaints/`. | Modify when migrating from local filesystem to Supabase Storage bucket. |
| [`apps/web/app/api/complaints/[id]/route.ts`](file:///c:/Users/arath/campus-hackthon/apps/web/app/api/complaints/[id]/route.ts) | Backend API | Route handler for `GET /api/complaints/[id]`. Returns single complaint record and all its cluster peer complaints. | Single complaint retrieval endpoint. |
| [`apps/web/app/api/complaints/analyze/route.ts`](file:///c:/Users/arath/campus-hackthon/apps/web/app/api/complaints/analyze/route.ts) | Backend API | Route handler for `POST /api/complaints/analyze`. Calls `analyzeComplaint` from `@smart-campus/complaint-intelligence`. | Dedicated Module 2 intelligence analysis route. |
| [`apps/web/app/complaints/page.tsx`](file:///c:/Users/arath/campus-hackthon/apps/web/app/complaints/page.tsx) | Frontend UI | Complete Complaints UI: submission form, image picker/preview, tabs ("All", "Normal", "Emergency"), emergency cluster cards, cluster details modal, and image zoom modal. | Modify for UI/UX improvements, design styling, or layout changes. |
| [`apps/web/tests/complaint.test.ts`](file:///c:/Users/arath/campus-hackthon/apps/web/tests/complaint.test.ts) | Automated Tests | 15 Vitest tests verifying lexical similarity, emergency progression, cascade update safety, attachment URLs, and cluster aggregation. | Maintain and expand tests whenever complaint behavior changes. |
| [`supabase/migrations/004_complaint_clusters.sql`](file:///c:/Users/arath/campus-hackthon/supabase/migrations/004_complaint_clusters.sql) | Database | Schema migration adding `cluster_id`, `is_emergency`, indexes, and `complaint_cluster_summary` view. | **Immutable migration**. Never edit; create a new migration for subsequent schema changes. |
| [`supabase/migrations/005_complaint_rls_and_cascade.sql`](file:///c:/Users/arath/campus-hackthon/supabase/migrations/005_complaint_rls_and_cascade.sql) | Database | Migration adding campus-wide authenticated `SELECT` policy and `cascade_complaint_emergency` `SECURITY DEFINER` function. | **Immutable migration**. Never edit; create a new migration for subsequent schema changes. |

---

## 5. Frontend Architecture

### Page Location
* File: [`apps/web/app/complaints/page.tsx`](file:///c:/Users/arath/campus-hackthon/apps/web/app/complaints/page.tsx)
* Route: `/complaints`

### Submission Form (Left Column, 5 Columns on Desktop)
* **Textarea:** Requires at least 5 characters. Dynamically counts characters. Text is styled with `break-words whitespace-pre-wrap` to prevent overflow.
* **Category Selector:** Dropdown offering Institutional categories (`infrastructure`, `hostel`, `sanitation`, `it_services`, `academic`, `security`, `administration`, `other`).
* **Image Picker:** Custom dashed upload box accepting JPEG, PNG, WebP, GIF up to 5 MB.
* **Image Preview:** Displays thumbnail upon selection with filename and "Remove" button (`URL.revokeObjectURL` cleanup).
* **Feedback Banners:**
  * Validation errors: Red alert banner (`AlertTriangle`).
  * Submission success: Green feedback banner (`CheckCircle2`) stating assigned cluster, resulting group size, and whether the issue escalated to Emergency.

### Complaint Feed & Views (Right Column, 7 Columns on Desktop)
* **Tab Filters:**
  * **All Grievances:** Lists all campus complaints with individual cards and cluster inspect buttons.
  * **Normal:** Lists non-emergency complaints (`< 5` similar reports).
  * **Emergency (≥ 5):** Displays aggregated Emergency Incidents.
* **Feed Architecture:**

```text
NORMAL TAB:
  Complaint Card 1 (Normal badge, category, text, timestamp, group counter)
  Complaint Card 2 (Normal badge, category, text, timestamp, group counter)
  ...

EMERGENCY TAB:
  Emergency Cluster Summary Card A
     ├─ Badge: 🔥 EMERGENCY CLUSTER
     ├─ Category & Latest Timestamp
     ├─ Representative Text (from latest report)
     ├─ Cluster Thumbnail (if any report attached an image)
     ├─ Group Counter: "5 similar reports"
     └─ Button: [View reports (5) →]
           ↓
     Opens Emergency Cluster Details Modal
           ├─ Modal Header with Cluster ID & total reports count
           ├─ Notification banner explaining text similarity grouping
           └─ List of all 5 individual reports with text, category, timestamp & photo
```

### High-Contrast Readability
* Text elements use `text-slate-900 dark:text-slate-100 font-medium leading-relaxed break-words whitespace-pre-wrap` ensuring crisp legibility on dark card backgrounds (`bg-white dark:bg-slate-900`).
* Metadata badges, timestamps (`text-slate-500 dark:text-slate-400`), and monospace similarity group hashes (`font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800`) maintain high contrast in both light and dark themes.

### Distinct Empty States
* **All View:** *"No complaints have been reported yet."* (Subtext: *"No grievances registered. Submit one using the form on the left."*)
* **Normal View:** *"No normal complaints."* (Subtext: *"There are currently no normal priority complaints."*)
* **Emergency View:** *"No active emergency complaints."* (Subtext: *"No similarity groups have reached the 5-complaint emergency threshold yet."*)

### Modals
1. **Cluster Reports Detail Modal:** Triggered by "View reports" on an emergency cluster card. Displays all complaints sharing that `cluster_id`.
2. **Expanded Image Zoom Modal:** Triggered by clicking any image thumbnail in cards or modals. Renders centered enlarged photo with backdrop blur and close controls.

---

## 6. Backend API Architecture

### 1. `POST /api/complaints`
* **Purpose:** Create a new complaint, execute text-only similarity matching against existing complaints, assign cluster ID, evaluate the 5-item emergency threshold, and persist record.
* **Request Format:** JSON (`application/json`).
  ```json
  {
    "text": "Water leakage in hostel block B first floor washroom",
    "category": "sanitation",
    "attachments": [
      {
        "url": "/uploads/complaints/pipe-123.jpg",
        "filename": "pipe.jpg",
        "mime_type": "image/jpeg",
        "size_bytes": 2048
      }
    ]
  }
  ```
* **Validation:** Validated against `CreateComplaintRequestSchema`. Rejects text shorter than 5 characters (400 `VALIDATION_FAILED`). Rejects invalid attachment URLs.
* **Response Format:** Status 201 (`CreateComplaintResponse`).
  ```json
  {
    "success": true,
    "complaint": {
      "id": "uuid-1234",
      "text": "Water leakage in hostel block B first floor washroom",
      "status": "submitted",
      "category": "sanitation",
      "cluster_id": "cluster_water_b",
      "is_emergency": false,
      "similar_count": 1,
      "attachments": [...],
      "created_at": "2026-10-01T14:00:00.000Z"
    },
    "cluster": {
      "cluster_id": "cluster_water_b",
      "group_count": 1,
      "is_emergency": false
    }
  }
  ```

### 2. `GET /api/complaints`
* **Purpose:** Returns list of complaints filtered by `view` parameter (`all`, `normal`, `emergency`) with synchronized real-time counts.
* **Query Parameters:** `?view=all|normal|emergency` (default: `all`).
* **Validation:** Validated against `ComplaintListQuerySchema`.
* **Response Format:** Status 200 (`ComplaintListResponse`).
  ```json
  {
    "success": true,
    "complaints": [...],
    "counts": {
      "total": 12,
      "normal": 7,
      "emergency": 5
    }
  }
  ```

### 3. `POST /api/complaints/upload`
* **Purpose:** Uploads an optional image attachment. Stores image on filesystem and returns attachment metadata for inclusion in `POST /api/complaints`.
* **Request Format:** `multipart/form-data` with `file` field.
* **Validation:**
  * Checks MIME type: Allowed `["image/jpeg", "image/png", "image/webp", "image/gif"]`. Non-image files return 400 `INVALID_FILE_TYPE`.
  * Checks file size: Max 5 MB ($5 \times 1024 \times 1024$ bytes). Oversized files return 400 `FILE_TOO_LARGE`.
* **Response Format:** Status 200.
  ```json
  {
    "success": true,
    "attachment": {
      "id": "945763567-uuid",
      "url": "/uploads/complaints/945763567-uuid.jpg",
      "filename": "original_name.jpg",
      "mime_type": "image/jpeg",
      "size_bytes": 1048576
    }
  }
  ```

### 4. `GET /api/complaints/[id]`
* **Purpose:** Retrieve a single complaint by its ID, alongside all peer complaints sharing the same `cluster_id`.
* **Response Format:** Status 200 (or 404 `NOT_FOUND`).
  ```json
  {
    "success": true,
    "complaint": { ... },
    "peer_complaints": [ ... ]
  }
  ```

### 5. `POST /api/complaints/analyze`
* **Status:** Existing Module 2 Intelligence endpoint (calls Gemini/Mock analysis for category, severity, and entities).
* **Usage in Core Workflow:** Standalone route. Not executed on user submission form because similarity detection is handled by the deterministic text Jaccard pipeline (`findMatchingCluster`).

---

## 7. Request and Response Contracts

Located in [`packages/contracts/src/complaint.ts`](file:///c:/Users/arath/campus-hackthon/packages/contracts/src/complaint.ts):

### Key Constants
```ts
export const COMPLAINT_EMERGENCY_THRESHOLD = 5;
export const DEFAULT_COMPLAINT_SIMILARITY_THRESHOLD = 0.35;
```

### Schemas
* **`ComplaintAttachmentSchema`:**
  * `id`: Optional string UUID.
  * `url`: Must be either an absolute URL (`http://...`, `https://...`) OR a root-relative path starting with `/` (e.g. `/uploads/complaints/...`).
  * `filename`: Optional string.
  * `mime_type`: Optional string.
  * `size_bytes`: Optional nonnegative integer.
* **`CreateComplaintRequestSchema`:**
  * `text`: String, minimum 5 characters (`"Complaint text must be at least 5 characters long"`).
  * `attachments`: Optional array of `ComplaintAttachmentSchema`.
  * `category`: Optional enum (`infrastructure`, `hostel`, `sanitation`, `it_services`, `academic`, `security`, `administration`, `other`).
  * `location_building`: Optional string.
  * `location_room`: Optional string.
  * `complainant_id`: Optional string.
* **`ComplaintRecordSchema`:**
  * Canonical complaint record containing `id`, `text`, `status`, `category`, `cluster_id`, `is_emergency`, `similar_count`, `attachments`, `created_at`, `updated_at`.
* **`CreateComplaintResponseSchema`:**
  * `success`: boolean.
  * `complaint`: `ComplaintRecordSchema`.
  * `cluster`: Object containing `cluster_id`, `group_count`, `is_emergency`.
* **`ComplaintListResponseSchema`:**
  * `success`: boolean.
  * `complaints`: Array of `ComplaintRecordSchema`.
  * `counts`: Object containing `total`, `normal`, `emergency`.

---

## 8. Database Architecture

### `public.complaints` Schema
Defined in `001_initial_schema.sql` and amended in `004_complaint_clusters.sql`:

| Column | Type | Constraints / Defaults | Purpose |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT uuid_generate_v4()` | Unique complaint identifier. |
| `complainant_id` | `UUID` | `REFERENCES public.profiles(id) ON DELETE SET NULL` | Linked profile of author (nullable for anonymous/mock). |
| `text` | `TEXT` | `NOT NULL` | Raw grievance description. |
| `status` | `complaint_status` | `NOT NULL DEFAULT 'submitted'` | Lifecycle: `submitted`, `triaged`, `in_progress`, `resolved`, `rejected`. |
| `category` | `TEXT` | Nullable | Category classification. |
| `subcategory` | `TEXT` | Nullable | Subcategory classification. |
| `location_building` | `TEXT` | Nullable | Building name. |
| `location_room` | `TEXT` | Nullable | Room or specific area identifier. |
| `assigned_to` | `UUID` | `REFERENCES public.profiles(id) ON DELETE SET NULL` | Assigned campus officer. |
| `attachments` | `JSONB` | `DEFAULT '[]'::jsonb` | Array of attachment objects (`url`, `filename`, `mime_type`, etc.). |
| `cluster_id` | `TEXT` | Nullable (indexed) | Text similarity cluster grouping hash. |
| `is_emergency` | `BOOLEAN` | `NOT NULL DEFAULT false` (indexed) | Emergency status ($\ge 5$ complaints in cluster). |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT timezone('utc'::text, now())` | Creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT timezone('utc'::text, now())` | Last update timestamp. |

### `public.complaint_ai_analysis`
Created in `001_initial_schema.sql` for Module 2 LLM analysis results (`provider`, `model`, `severity_level`, `urgency_reasoning`, `entities`, `suggested_department`). It is isolated from the lightweight lexical similarity clustering pipeline.

### Cluster Summary View: `public.complaint_cluster_summary`
Created in `004_complaint_clusters.sql`:
```sql
CREATE OR REPLACE VIEW public.complaint_cluster_summary AS
SELECT
  cluster_id,
  COUNT(*)::INT AS group_count,
  BOOL_OR(is_emergency) AS is_emergency,
  MIN(created_at) AS first_reported_at,
  MAX(created_at) AS last_reported_at
FROM public.complaints
WHERE cluster_id IS NOT NULL
GROUP BY cluster_id;
```
* **Why `group_count` is derived:** Storing a redundant persistent counter column on individual rows leads to desynchronization and race conditions. Counts are dynamically aggregated via SQL view or runtime `recalculateClusterCounts`.

### Indexes
* `idx_complaints_cluster_id`: B-Tree index on `public.complaints(cluster_id)`.
* `idx_complaints_is_emergency`: B-Tree index on `public.complaints(is_emergency)`.

### Row Level Security (RLS)
Migration `005_complaint_rls_and_cascade.sql` implements:
```sql
CREATE POLICY "Campus complaints are viewable by authenticated users"
  ON public.complaints FOR SELECT
  TO authenticated
  USING (true);
```
* Authenticated users (students, faculty, officers) can read all campus complaints.
* General `UPDATE` and `DELETE` permissions are NOT granted to users.

### Security Definer RPC: `cascade_complaint_emergency`
```sql
CREATE OR REPLACE FUNCTION public.cascade_complaint_emergency(target_cluster_id TEXT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_rows INT;
BEGIN
  IF target_cluster_id IS NULL OR btrim(target_cluster_id) = '' THEN
    RAISE EXCEPTION 'Invalid cluster_id: cannot be null or empty';
  END IF;

  UPDATE public.complaints
  SET is_emergency = true,
      updated_at = timezone('utc'::text, now())
  WHERE cluster_id = target_cluster_id
    AND is_emergency = false;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows;
END;
$$;
```
* **Purpose:** Safely transitions all existing peer complaints in a cluster to `is_emergency = true` when the 5th report arrives, without granting students table-wide `UPDATE` permissions.
* **Security:** `SET search_path = public, pg_temp` prevents hijacking. Permissions revoked from `PUBLIC` and granted only to `authenticated` and `service_role`.

---

## 9. Complaint Similarity Architecture

### Algorithm Flowchart
```text
New Complaint Text
        ↓
    tokenize()
        ├─ Convert to lowercase
        ├─ Replace non-alphanumeric chars [^a-z0-9\s] with spaces
        ├─ Split on whitespace (/\s+/)
        └─ Filter tokens: discard words where length <= 2
        ↓
   Set<string> A (Deduplicated word tokens)
        ↓
Compare with each existing candidate's Set<string> B
        ↓
computeJaccardSimilarity(textA, textB)
   intersectionSize = |A ∩ B|
   unionSize = |A| + |B| - intersectionSize
   score = intersectionSize / unionSize (rounded to 3 decimal places)
        ↓
Find candidate with maximum score: bestScore
        ↓
Is bestScore >= threshold (0.35)?
   ├─ YES: Assign candidate's existing cluster_id
   └─ NO:  Generate new cluster_id: "cluster_<base36_timestamp>_<random>"
```

### Fundamental Characteristics
* **Lexical, NOT Semantic:** Jaccard similarity measures exact word token overlap. It does not understand synonyms unless the words share identical stems/tokens.
* **Pure Text Input:** Operates exclusively on raw text strings.

---

## 10. Similarity Threshold

* **Current Value:** `0.35`
* **Constant:** `DEFAULT_COMPLAINT_SIMILARITY_THRESHOLD = 0.35` in `packages/contracts/src/complaint.ts`.
* **Runtime Override:** Read from `process.env.COMPLAINT_SIMILARITY_THRESHOLD` in `similarity-service.ts`. If undefined or invalid, falls back to `0.35`.

### Real Tokenization Behavior & Examples

#### Case 1: Same Issue Variations
* Text 1: *"Water is unavailable in hostel A"* $\rightarrow$ tokens: `{"water", "unavailable", "hostel"}` (note: "is", "in", "a" are $\le 2$ chars and removed).
* Text 2: *"No water supply in hostel A"* $\rightarrow$ tokens: `{"water", "supply", "hostel"}` ("no", "in", "a" removed).
* Intersection: `{"water", "hostel"}` (size 2).
* Union: `{"water", "unavailable", "hostel", "supply"}` (size 4).
* Jaccard: $2 / 4 = 0.50 \ge 0.35$ $\rightarrow$ **MATCHED (Grouped into same cluster)**.

#### Case 2: Different Issues
* Text 1: *"Water is unavailable in hostel A"* $\rightarrow$ `{"water", "unavailable", "hostel"}`
* Text 2: *"Projector is broken in classroom 204"* $\rightarrow$ `{"projector", "broken", "classroom", "204"}`
* Intersection: 0. Union: 7. Jaccard: $0.00 < 0.35$ $\rightarrow$ **SEPARATED (New cluster created)**.

#### Case 3: Known Limitation — Single-Character Block Identifiers
* Text 1: *"Water problem in hostel A"* $\rightarrow$ `{"water", "problem", "hostel"}`
* Text 2: *"Water problem in hostel B"* $\rightarrow$ `{"water", "problem", "hostel"}`
* Because "a" and "b" have length 1, `w.length > 2` discards them. The token sets are identical (Jaccard = 1.0) and group together. This is documented under **Known Issues**.

---

## 11. Emergency Classification

### The 5-Report Escalation Rule
$$\text{Cluster Count} < 5 \Longrightarrow \text{Normal Priority}$$
$$\text{Cluster Count} \ge 5 \Longrightarrow \text{Emergency Priority}$$

### Escalation Mechanics
1. When a new complaint arrives, its target cluster is determined.
2. The system counts existing complaints in that cluster + 1 (the new complaint).
3. If new count is $1, 2, 3,$ or $4$:
   * Status is `is_emergency = false`.
   * Complaint is classified as Normal.
4. If new count reaches $5$:
   * Status is `is_emergency = true`.
   * **Emergency Cascade:** All existing 4 complaints in the database transition to `is_emergency = true` via `cascade_complaint_emergency` RPC.
5. If subsequent complaints ($6, 7, \dots$) join the cluster:
   * They automatically enter with `is_emergency = true`.

### Critical Rule
Emergency status is strictly derived from **CLUSTER VOLUME**. It is **NOT** derived from:
* Attached images.
* Specific keywords (e.g. typing "emergency" does not bypass the threshold).
* Category selection.
* User identity or role.

---

## 12. Image Architecture

### Complete Image Lifecycle
```text
1. User selects image in browser (<input type="file">)
        ↓
2. Client-side validation: MIME (image/*) and size (<= 5 MB)
        ↓
3. Client creates local preview (URL.createObjectURL)
        ↓
4. User clicks "Submit Complaint"
        ↓
5. Form sends POST /api/complaints/upload (multipart/form-data)
        ↓
6. Upload Route validates MIME & size, writes file to public/uploads/complaints/[uuid].[ext]
        ↓
7. Upload Route returns { id, url: "/uploads/complaints/[uuid].[ext]", filename, size_bytes }
        ↓
8. Form sends POST /api/complaints with attachments array
        ↓
9. Complaint Record persists attachment JSONB
        ↓
10. UI renders image thumbnail in feed cards and cluster modal (with click-to-zoom)
```

### Storage Status: `LOCAL / DEMO STORAGE`
* **Current Storage:** Files are written to the local Next.js disk: `public/uploads/complaints/`.
* **Deployment Limitation:** Not suitable for serverless platforms (Vercel, AWS Lambda) or ephemeral containers. Supabase Storage migration is `PLANNED`.
* **Zero Similarity Influence:** Images are never passed to the clustering engine or similarity functions.

---

## 13. Authentication and Authorization

* **Current Architecture:** Next.js Route Handlers interact with Supabase via `@supabase/ssr` server client.
* **Complainant ID:** `CreateComplaintRequest` supports optional `complainant_id`. In authenticated sessions, it maps to `auth.uid()`; in demo mode, mock IDs are accepted.
* **Read Permissions:** All authenticated users can SELECT campus complaints via `005_complaint_rls_and_cascade.sql`.
* **Write Permissions:** Authenticated users can INSERT complaints. General UPDATE/DELETE is blocked.
* **Emergency Updates:** Performed strictly through `SECURITY DEFINER` RPC `cascade_complaint_emergency(target_cluster_id)`.

### Application Session Integration (verified locally 2026-10-10)

The hackathon OTP path intentionally uses a signed HTTP-only application session;
it does not create a Supabase Auth JWT or contact an SMS provider. OTP verification
sets `campusgram_mock_session` with `SameSite=Lax`, `Path=/`, a production-only
`Secure` flag, and the shared 24-hour expiration policy. The token is HMAC-signed
with the server-only `AUTH_SESSION_SECRET` when configured, falling back to the
server-only service-role key for existing deployments; the deterministic signing
fallback is restricted to tests or an unconfigured local mock runtime and never
uses the public anon key.

`resolveServerIdentity({ allowDemo: true })` validates the signed application
session when `AUTH_MODE=mock`, including when Supabase is configured for the
hackathon persistence path. In non-mock mode it requires the canonical Supabase
Auth session and linked institutional profile. The application-session path
resolves the institutional profile and canonical linked profile server-side and
rejects missing, malformed, tampered, future-dated, inactive, and expired
tokens. Complaint and Lost & Found routes continue to use this shared resolver;
complaint ownership is still derived from the resolved identity rather than
request fields or headers.

Local regression coverage is in `apps/web/tests/auth-hardening.test.ts` and
`apps/web/tests/auth.test.ts`. Live
Supabase directory lookup, RLS, persistence, and browser cookie behavior remain
deployment checks and were not exercised by the local tests.

Verification receipts for this session:

* `pnpm --filter @smart-campus/web exec vitest run tests/auth-hardening.test.ts tests/auth.test.ts tests/complaint.test.ts tests/complaint-attachment-security.test.ts` — 48 passed.
* `pnpm --filter @smart-campus/web test` — 220 passed, including 34 Lost & Found workflow tests.
* `pnpm test` — 297 passed across the monorepo.
* `pnpm typecheck` — passed.
* `pnpm lint` — passed with existing warnings only.
* `pnpm --filter @smart-campus/web build` — passed with existing image optimization warnings.
* `git diff --check` — passed.

---

## 14. Validation and Error Handling

* **Zod Schemas:** Every request payload is strictly validated using schemas from `@smart-campus/contracts`.
* **Text Length:** Complaint text must be $\ge 5$ characters. Whitespace is trimmed before check.
* **Attachment URLs:** Must be a valid absolute URI (`http://`, `https://`) or a root-relative path (`/uploads/...`).
* **Upload Limits:** Max 5 MB, strictly image MIME types (`image/jpeg`, `image/png`, `image/webp`, `image/gif`).
* **HTTP Status Codes:**
  * `200 OK`: Successful fetch or analysis.
  * `201 Created`: Successful complaint creation.
  * `400 Bad Request`: Validation failure (`VALIDATION_FAILED`, `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`).
  * `404 Not Found`: Complaint ID not found.
  * `500 Internal Server Error`: Unhandled database or system exception.

---

## 15. Testing

### Test Suite Structure
* Location: [`apps/web/tests/complaint.test.ts`](file:///c:/Users/arath/campus-hackthon/apps/web/tests/complaint.test.ts)
* Framework: Vitest `3.2.7`
* **Total Tests in Module:** 15 passing tests:
  1. `1. Text Similarity & Grouping`:
     * Groups semantically similar complaint texts together.
     * Does NOT group unrelated complaint texts together.
     * Ensures images have strictly NO effect on text similarity.
  2. `2. Emergency Threshold Progression`:
     * Classifies 1 to 4 complaints as normal, and 5th as emergency with group cascade.
  3. `3. API Route Endpoints`:
     * `POST /api/complaints`: creates complaint with valid payload.
     * `POST /api/complaints`: rejects complaint with text shorter than 5 chars.
     * `POST /api/complaints`: accepts optional image attachment (absolute URL).
     * `POST /api/complaints`: accepts root-relative image attachment URLs produced by upload endpoint.
     * `POST /api/complaints`: rejects invalid attachment URLs.
     * `POST /api/complaints/upload`: rejects non-image files.
     * `GET /api/complaints`: supports normal and emergency view filtering.
  4. `4. Campus-Wide Visibility & Safe Emergency Cascade`:
     * Allows campus-wide visibility (Student A views Student B's complaint).
     * Safely cascades emergency state across cluster peers without general UPDATE permissions.
     * Ensures unrelated complaints in other clusters are never affected by an emergency cascade.
  5. `5. Emergency Cluster Aggregation`:
     * Aggregates multiple complaints sharing the same `cluster_id` into a single cluster group with count.

---

## 16. Current Verification Status

Verified as of **2026-10-01**:

* **Automated Unit & Integration Tests:**
  * Monorepo Command: `npx pnpm test`
  * Status: **67/67 tests passing** across 8 workspace packages:
    * `apps/web`: 30 passed (15 complaint tests + 15 auth tests).
    * `packages/contracts`: 13 passed.
    * `modules/complaint-intelligence`: 7 passed.
    * `modules/lost-and-found`: 17 passed.
* **Typecheck:**
  * Command: `npx pnpm typecheck`
  * Status: **0 errors** across all 9 workspaces.
* **Linter:**
  * Command: `npx pnpm lint`
  * Status: **0 errors** (warnings only for Next.js `<img>` vs `<Image />` on user dynamic uploads).
* **Production Build:**
  * Command: `npx pnpm --filter @smart-campus/web build`
  * Status: **Compiled successfully** in 4.2s. 19 routes generated (including `/complaints` static route and dynamic API handlers).

---

## 17. Known Issues

### 1. Local Filesystem Image Storage (`MEDIUM SEVERITY`)
* **Problem:** `apps/web/app/api/complaints/upload/route.ts` writes files to `public/uploads/complaints/` on the local server filesystem.
* **Consequence:** In serverless or containerized cloud deployments (Vercel, AWS ECS, Fly.io), local files are ephemeral and vanish upon redeployment or cold restarts.
* **Fix Required:** Connect upload endpoint to a Supabase Storage bucket (`complaint-attachments`).

### 2. Cluster Assignment Concurrency Race Condition (`MEDIUM SEVERITY`)
* **Problem:** `createComplaint` reads existing complaints, executes in-memory Jaccard matching, and inserts the record. Two identical complaints submitted at the exact same millisecond can both fail to see each other and generate two distinct cluster IDs.
* **Fix Required:** Implement a database advisory lock or serializable transaction during cluster assignment.

### 3. Client-Declared MIME Type Validation (`LOW SEVERITY`)
* **Problem:** Image upload endpoint verifies `blob.type` (from HTTP headers), which can be forged.
* **Fix Required:** Verify magic bytes (file signature) of the uploaded buffer.

### 4. Single-Character Location Tokenization Stripping (`LOW SEVERITY`)
* **Problem:** `tokenize()` in `similarity.ts` strips tokens with length $\le 2$ (`w.length > 2`). Therefore, "Hostel A" and "Hostel B" both tokenize to `{"hostel"}` and merge into the same cluster.
* **Fix Required:** Preserve single uppercase alphanumeric characters (e.g. Block A/B/C) during tokenization.

---

## 18. Resolved Issues / Changelog

* **2026-10-01 (UI & Contrast Correction):**
  * Fixed unreadable complaint text on dark backgrounds by applying `text-slate-900 dark:text-slate-100 font-medium leading-relaxed break-words whitespace-pre-wrap`.
  * Added responsive horizontal wrapping for long complaint strings and multiline complaints.
* **2026-10-01 (Attachment Schema Fix):**
  * Fixed `CreateComplaintRequest` 400 schema validation error by updating `ComplaintAttachmentSchema.url` in `@smart-campus/contracts` to accept root-relative paths (`/uploads/...`) as well as absolute URLs.
* **2026-10-01 (Emergency Feed Cluster Aggregation):**
  * Updated Emergency tab UI to render **one summary card per cluster** instead of listing individual complaints repeatedly.
  * Implemented Emergency Cluster Detail Modal showing all individual reports when clicking "View reports (N)".
* **2026-10-01 (Distinct Empty States):**
  * Implemented dedicated empty state messages for All, Normal, and Emergency views.
* **2026-10-01 (RLS & Cascade Fix):**
  * Created migration `005_complaint_rls_and_cascade.sql` granting campus-wide authenticated read access and deploying `cascade_complaint_emergency` `SECURITY DEFINER` function for safe 5-report escalation.

---

## 19. Design Decisions

### Decision 1: Lexical Jaccard Over Heavy Embeddings
* **Rationale:** A deterministic Jaccard similarity threshold ($0.35$) runs in sub-millisecond time in pure JavaScript without external API calls, Python dependencies, vector databases, or latency overhead. It ensures offline reliability and deterministic testing.

### Decision 2: Strict Exclusion of Images from Similarity
* **Rationale:** Campus complaints are semantic textual descriptions ("no water in washroom"). Attempting visual similarity on arbitrary photos (e.g., a photo of a tap vs a photo of a bucket) generates high false-positive and false-negative clustering. Images serve purely as verification evidence for technicians.

### Decision 3: Dynamic Cluster Counts Over Persistent Counter Columns
* **Rationale:** Storing a persistent `similar_count` or `group_count` column directly on rows requires multi-row syncs on every write and causes desynchronization. Deriving counts from `cluster_id` guarantees consistent state.

### Decision 4: Cluster-Based Emergency Escalation
* **Rationale:** Individual students often label trivial complaints as "critical" to get attention. Grounding emergency escalation in aggregate volume (5 independent reports on the same issue) provides an objective, tamper-resistant crowd-sourced signal of institutional impact.

### Decision 5: Emergency Feed Cluster Cards
* **Rationale:** When an emergency occurs, rendering 20 identical cards floods the screen. Showing 1 summary card with the aggregate count and an expandable drawer/modal keeps the dashboard clean for emergency dispatchers.

### Decision 6: Total Isolation from Lost & Found AI
* **Rationale:** Lost & Found uses Python FastAPI, YOLO, CLIP, and vector embeddings. The Complaint System monorepo boundary strictly isolates complaint workflows from Lost & Found dependencies.

---

## 20. Configuration

| Environment Variable | Default Value | Purpose | Required? |
| :--- | :--- | :--- | :--- |
| `COMPLAINT_SIMILARITY_THRESHOLD` | `0.35` | Lexical Jaccard threshold (0.0 to 1.0) for clustering. | Optional |
| `NEXT_PUBLIC_SUPABASE_URL` | Placeholder | Supabase API URL. | Optional (fallback to in-memory store) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Placeholder | Supabase public anonymous key. | Optional (fallback to in-memory store) |
| `SUPABASE_SERVICE_ROLE_KEY` | - | Server-side Supabase administrative key (never in client). | Optional |

---

## 21. Development Commands

```bash
# Start local Next.js web application
npx pnpm dev

# Run all unit and integration tests across monorepo
npx pnpm test

# Run tests specifically for the web & complaint module
npx pnpm --filter @smart-campus/web test

# Run TypeScript typechecks across all 9 workspaces
npx pnpm typecheck

# Run ESLint across monorepo
npx pnpm lint

# Build production Next.js bundle
npx pnpm --filter @smart-campus/web build
```

---

## 22. Manual Testing Checklist

### Complaint Submission
- [x] Text-only complaint submits and renders in feed.
- [x] Complaint with image upload attaches correctly and displays thumbnail.
- [x] Text shorter than 5 characters is blocked with validation error.
- [x] Non-image file upload is rejected with 400 `INVALID_FILE_TYPE`.
- [x] File $> 5\text{ MB}$ is rejected with 400 `FILE_TOO_LARGE`.

### Similarity & Clustering
- [x] Similar complaint texts join existing cluster.
- [x] Unrelated complaints create a new unique cluster ID.
- [x] Images do not alter similarity matching scores.

### Emergency Escalation
- [x] Reports 1 through 4 remain Normal priority.
- [x] 5th report escalates cluster and all 4 prior reports to Emergency.
- [x] 6th report enters as Emergency.
- [x] Separate clusters are unaffected by peer escalations.

### User Interface
- [x] Complaint text is legible with high contrast in dark and light modes.
- [x] Long text wraps cleanly without horizontal overflow.
- [x] Emergency feed renders one card per unique cluster.
- [x] "View reports (N)" opens detail modal with all cluster reports.
- [x] Empty states display distinct messages for All, Normal, and Emergency views.

---

## 23. Integration with Other Modules

* **Shared Contracts (`@smart-campus/contracts`):** Single Source of Truth for TypeScript interfaces and Zod validation schemas.
* **Shared UI (`@smart-campus/ui`):** Reuses `Card`, `Badge`, and `Button` components.
* **Module 2 (`@smart-campus/complaint-intelligence`):** Imports `computeJaccardSimilarity` and `tokenize`.
* **Database (`supabase/`):** Consumes `public.complaints`, RLS policies, and `cascade_complaint_emergency` RPC.
* **STRICT BOUNDARY — Lost & Found:** Does NOT import, call, or depend on `modules/lost-and-found`, `services/lost-found-ai`, or `workers/lost-found-worker`.

---

## 24. Scope Boundaries

### Owned by Complaint System
* Grievance submission form and client validation.
* Image attachment upload and thumbnail display.
* Complaint feed, views ("All", "Normal", "Emergency"), and cluster modals.
* Text-only similarity clustering logic (`similarity-service.ts`).
* Emergency progression and cascade escalation.
* Complaint APIs (`/api/complaints`, `/api/complaints/upload`, `/api/complaints/[id]`).
* Database migrations `004` and `005`.

### NOT Owned by Complaint System
* User authentication and institutional OTP (`apps/web/lib/auth`).
* Institutional biodata records (`student_biodata`, `faculty_biodata`).
* Lost & Found module and AI service (`services/lost-found-ai`).
* General portal navigation, feeds, or onboarding flows.

---

## 25. Future Improvements

1. **Supabase Storage Bucket Integration (`PLANNED`):** Replace local disk writes with Supabase Storage (`complaints/`).
2. **Location-Aware Tokenization (`PLANNED`):** Enhance `tokenize()` to retain block letters (Block A vs Block B).
3. **Database Concurrency Locking (`PLANNED`):** Wrap cluster lookup and creation in an explicit Postgres transaction or advisory lock.
4. **Magic Byte Image Verification (`PLANNED`):** Validate file header bytes against file signatures.
5. **Technician / Dispatcher Workflow (`PLANNED`):** Allow department officers to assign complaints, update statuses (`in_progress`, `resolved`), and post official responses.

---

## 26. Future Agent Instructions

Any future developer or AI agent working on the Complaint System MUST follow these operating rules:

1. **Read `MEMORY.md` first** before inspecting or modifying code.
2. **Inspect the actual implementation** rather than relying on unverified assumptions.
3. **Preserve the text-only similarity boundary:** Never pass images, attachments, or file paths into the similarity pipeline.
4. **Never introduce image ML:** No OCR, CLIP, YOLO, or computer vision models in this module.
5. **Preserve the 5-complaint emergency threshold:** Do not change the threshold unless explicitly instructed by product requirements.
6. **Reuse existing monorepo architecture:** Do not introduce Kafka, Redis, microservices, or external embedding servers.
7. **Do not modify unrelated modules:** Respect monorepo boundaries in `AGENTS.md`.
8. **Update `MEMORY.md` and `STATUS.md`** after any architectural changes.
9. **Never document unverified functionality as implemented.**
10. **Zero Secret Leakage:** Never store API keys, passwords, or tokens in memory or status markdown files.
