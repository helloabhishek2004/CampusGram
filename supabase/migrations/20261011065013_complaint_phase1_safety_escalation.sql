-- Complaint Phase 1: server-only, transactional incident grouping and escalation.
-- Requires 20261009182617_complaint_lifecycle.sql. Legacy text, ownership,
-- lifecycle state, identity tables and RLS policies are not rewritten.
-- PostgreSQL 12+, UTF8; writes require READ COMMITTED (the normal RPC default).
-- The migration runner should publish the DDL and function grants together in
-- its migration transaction; this file does not commit a caller's transaction.

ALTER TABLE public.complaints
  ADD COLUMN safety_signals TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN incident_scope TEXT,
  ADD COLUMN submission_id UUID,
  ADD COLUMN submission_fingerprint TEXT;

ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_phase1_safety_signals_check CHECK (
    CASE WHEN COALESCE(array_ndims(safety_signals), 1) = 1 THEN
      safety_signals <@ ARRAY[
        'fire_or_smoke', 'electrical_hazard', 'gas_leak',
        'medical_distress', 'violence_or_threat', 'structural_collapse'
      ]::text[] AND array_position(safety_signals, NULL) IS NULL
    ELSE false END
  );

CREATE UNIQUE INDEX idx_complaints_phase1_submission
  ON public.complaints(complainant_id, submission_id)
  WHERE submission_id IS NOT NULL;

-- Isolated legacy fallback mirroring incident-policy.ts deriveIncidentScope.
-- Topic families are grouping guards, not safety/volume classifications.
-- Use explicit ASCII lookarounds for JavaScript \b parity: PostgreSQL \m/\M
-- would incorrectly treat adjoining non-ASCII letters as word characters.
-- The whitespace class is ECMAScript \s (including NBSP/BOM), not a locale's
-- POSIX space class. Unicode casing still follows the database's lower(); its
-- Unicode-version/locale parity with JavaScript must be checked on the target DB.
CREATE OR REPLACE FUNCTION public.complaint_phase1_scope(
  p_text TEXT,
  p_building TEXT,
  p_room TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_text TEXT;
  v_topic TEXT;
  v_building TEXT;
  v_room TEXT;
  v_match TEXT[];
  v_space_pattern TEXT := U&'[\0009\000A\000B\000C\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+';
  v_identifier TEXT := '[a-z0-9]+(?:-[a-z0-9]+)*';
  v_is_identifier TEXT := '^(?:[a-z]|[a-z0-9-]*[0-9][a-z0-9-]*)$';
  -- Captures: complete mention, kind, identifier. Filtering happens AFTER the
  -- global matches, matching TS matchAll(...).find(IS_IDENTIFIER), including
  -- consumption of invalid ordinary-word matches before later valid mentions.
  v_building_pattern TEXT := '(?<![a-z0-9_])((block|building|tower|wing)[ :#-]+(' ||
    v_identifier || '))(?=$|[ ,.;:!?()])';
  v_hostel_pattern TEXT := '(?<![a-z0-9_])((hostel|dorm|dormitory)[ :#-]+(' ||
    v_identifier || '))(?=$|[ ,.;:!?()])';
  v_room_pattern TEXT := '(?<![a-z0-9_])((room|lab|hall)[ :#-]+(' ||
    v_identifier || '))(?=$|[ ,.;:!?()])';
BEGIN
  -- Mirror TS normalization, including its pipe-to-space integration update.
  -- Translate ASCII casing first so even locale-specific lower() rules cannot
  -- turn an ASCII I into a different letter than JavaScript toLowerCase().
  -- After replacing every JS whitespace run with one ASCII space, btrim is the
  -- same as JS trim. Other punctuation/text is preserved in unknown topics.
  v_text := btrim(regexp_replace(
    replace(lower(translate(COALESCE(p_text, ''),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'
    )), '|', ' ') COLLATE "C", v_space_pattern, ' ', 'g'
  ));
  v_building := btrim(regexp_replace(
    replace(lower(translate(COALESCE(p_building, ''),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'
    )), '|', ' ') COLLATE "C", v_space_pattern, ' ', 'g'
  ));
  v_room := btrim(regexp_replace(
    replace(lower(translate(COALESCE(p_room, ''),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'
    )), '|', ' ') COLLATE "C", v_space_pattern, ' ', 'g'
  ));

  -- Exact TS order and vocabulary. Regex collation is C so ASCII ranges do not
  -- gain locale-dependent word/identifier interpretations.
  v_topic := CASE
    WHEN v_text COLLATE "C" ~ '(?<![a-z0-9_])projectors?(?![a-z0-9_])' THEN 'projector'
    WHEN v_text COLLATE "C" ~ '(?<![a-z0-9_])windows?(?![a-z0-9_])' THEN 'window'
    WHEN v_text COLLATE "C" ~ '(?<![a-z0-9_])fans?(?![a-z0-9_])' THEN 'fan'
    WHEN v_text COLLATE "C" ~ '(?<![a-z0-9_])(?:wi[ -]?fi|internet|networks?|routers?|wireless)(?![a-z0-9_])' THEN 'network'
    WHEN v_text COLLATE "C" ~ '(?<![a-z0-9_])(?:water|taps?|pipes?|plumbing|flood(?:s|ing)?)(?![a-z0-9_])' THEN 'water'
    WHEN v_text COLLATE "C" ~ '(?<![a-z0-9_])(?:sanitation|garbage|waste|toilets?|washrooms?|bathrooms?|sewage|drainage)(?![a-z0-9_])' THEN 'sanitation'
    WHEN v_text COLLATE "C" ~ '(?<![a-z0-9_])(?:electric(?:al|ity)?|power|switchboards?|wires?|wiring|sockets?|outlets?|sparks?|sparking|ac)(?![a-z0-9_])' THEN 'electrical'
    WHEN v_text COLLATE "C" ~ '(?<![a-z0-9_])(?:medical|unconscious|unresponsive|breath(?:e|ing)?|bleeding|injur(?:y|ies|ed))(?![a-z0-9_])' THEN 'medical'
    WHEN v_text COLLATE "C" ~ '(?<![a-z0-9_])(?:security|harassment|assault(?:ed|ing)?|violen(?:ce|t)|threat(?:s|en(?:s|ed|ing)?)?|attack(?:s|ed|ing)?)(?![a-z0-9_])' THEN 'security'
    WHEN v_text COLLATE "C" ~ '(?<![a-z0-9_])(?:structural|collaps(?:e|es|ed|ing)|ceilings?|roofs?|walls?|beams?)(?![a-z0-9_])' THEN 'structural'
    ELSE 'unknown:' || v_text
  END;

  IF v_building <> '' THEN
    -- Explicit-location precedence is absolute. Canonicalize a recognized
    -- whole field; preserve all other explicit names without adding text sites.
    SELECT parts INTO v_match
    FROM regexp_matches(v_building COLLATE "C", v_building_pattern, 'g')
      WITH ORDINALITY AS mentions(parts, ordinal)
    WHERE parts[3] COLLATE "C" ~ v_is_identifier
    ORDER BY ordinal LIMIT 1;
    IF v_match IS NOT NULL AND v_match[1] COLLATE "C" = v_building THEN
      v_building := v_match[2] || ' ' || v_match[3];
    END IF;

    SELECT parts INTO v_match
    FROM regexp_matches(v_building COLLATE "C", v_hostel_pattern, 'g')
      WITH ORDINALITY AS mentions(parts, ordinal)
    WHERE parts[3] COLLATE "C" ~ v_is_identifier
    ORDER BY ordinal LIMIT 1;
    IF v_match IS NOT NULL AND v_match[1] COLLATE "C" = v_building THEN
      v_building := 'hostel ' || v_match[3];
    END IF;
  ELSE
    -- Text fallback: first valid building ID, otherwise first hostel/dorm ID,
    -- otherwise the first north library/south library/library/canteen match.
    SELECT parts INTO v_match
    FROM regexp_matches(v_text COLLATE "C", v_building_pattern, 'g')
      WITH ORDINALITY AS mentions(parts, ordinal)
    WHERE parts[3] COLLATE "C" ~ v_is_identifier
    ORDER BY ordinal LIMIT 1;
    IF v_match IS NOT NULL THEN
      v_building := v_match[2] || ' ' || v_match[3];
    ELSE
      SELECT parts INTO v_match
      FROM regexp_matches(v_text COLLATE "C", v_hostel_pattern, 'g')
        WITH ORDINALITY AS mentions(parts, ordinal)
      WHERE parts[3] COLLATE "C" ~ v_is_identifier
      ORDER BY ordinal LIMIT 1;
      IF v_match IS NOT NULL THEN
        v_building := 'hostel ' || v_match[3];
      ELSE
        v_match := regexp_match(v_text COLLATE "C",
          '(?<![a-z0-9_])(north library|south library|library|canteen)(?![a-z0-9_])'
        );
        v_building := COALESCE(v_match[1], '');
      END IF;
    END IF;
  END IF;

  SELECT parts INTO v_match
  FROM regexp_matches(v_room COLLATE "C", v_room_pattern, 'g')
    WITH ORDINALITY AS mentions(parts, ordinal)
  WHERE parts[3] COLLATE "C" ~ v_is_identifier
  ORDER BY ordinal LIMIT 1;
  IF v_match IS NOT NULL AND v_match[1] COLLATE "C" = v_room THEN
    v_room := v_match[3];
  END IF;
  IF v_room = '' THEN
    SELECT parts INTO v_match
    FROM regexp_matches(v_text COLLATE "C", v_room_pattern, 'g')
      WITH ORDINALITY AS mentions(parts, ordinal)
    WHERE parts[3] COLLATE "C" ~ v_is_identifier
    ORDER BY ordinal LIMIT 1;
    v_room := COALESCE(v_match[3], '');
  END IF;

  -- Empty segments mean missing and never wildcard-match known locations.
  RETURN v_topic || '|' || v_building || '|' || v_room;
END;
$$;

REVOKE ALL ON FUNCTION public.complaint_phase1_scope(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_phase1_scope(TEXT, TEXT, TEXT)
  TO service_role;

-- Exact submission-path lexical Jaccard: lowercase, ASCII letters/digits,
-- whitespace splitting, length > 2, distinct tokens, rounded to three decimals.
CREATE OR REPLACE FUNCTION public.complaint_phase1_similarity(
  p_left TEXT,
  p_right TEXT
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH left_tokens AS (
    SELECT DISTINCT token
    FROM regexp_split_to_table(
      regexp_replace(lower(COALESCE(p_left, '')), '[^a-z0-9[:space:]]', ' ', 'g'),
      '[[:space:]]+'
    ) AS words(token)
    WHERE char_length(token) > 2
  ), right_tokens AS (
    SELECT DISTINCT token
    FROM regexp_split_to_table(
      regexp_replace(lower(COALESCE(p_right, '')), '[^a-z0-9[:space:]]', ' ', 'g'),
      '[[:space:]]+'
    ) AS words(token)
    WHERE char_length(token) > 2
  ), sizes AS (
    SELECT
      (SELECT count(*) FROM left_tokens) AS left_size,
      (SELECT count(*) FROM right_tokens) AS right_size,
      (SELECT count(*) FROM left_tokens JOIN right_tokens USING (token)) AS shared_size
  ), scores AS (
    SELECT CASE WHEN left_size = 0 OR right_size = 0 THEN 0::double precision
      ELSE shared_size::double precision / (left_size + right_size - shared_size)
    END AS score
    FROM sizes
  ), binary_scores AS (
    SELECT score, pg_catalog.float8send(score) AS bits FROM scores
  ), scaled AS (
    -- JavaScript toFixed(3) rounds the represented IEEE-754 value, not the
    -- exact rational. Decode that value before rounding so e.g. 3/80 = 0.037,
    -- matching the existing tokenizer's Number(score.toFixed(3)). All arithmetic
    -- below is integral numeric; no extension or hashing is involved.
    SELECT score,
      (
        4503599627370496::numeric +
        (get_byte(bits, 1) & 15)::numeric * 281474976710656 +
        get_byte(bits, 2)::numeric * 1099511627776 +
        get_byte(bits, 3)::numeric * 4294967296 +
        get_byte(bits, 4)::numeric * 16777216 +
        get_byte(bits, 5)::numeric * 65536 +
        get_byte(bits, 6)::numeric * 256 + get_byte(bits, 7)
      ) * 1000 AS numerator,
      CASE WHEN score = 0 THEN 1::numeric ELSE power(
        2::numeric, 1075 - (((get_byte(bits, 0) & 127) << 4) + (get_byte(bits, 1) >> 4))
      ) END AS denominator
    FROM binary_scores
  )
  SELECT CASE WHEN score = 0 THEN 0::double precision ELSE (
    (div(numerator, denominator) +
      CASE WHEN mod(numerator, denominator) * 2 >= denominator THEN 1 ELSE 0 END
    ) / 1000
  )::double precision END
  FROM scaled;
$$;

REVOKE ALL ON FUNCTION public.complaint_phase1_similarity(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_phase1_similarity(TEXT, TEXT)
  TO service_role;

-- One authoritative snapshot, grouped by BOTH cluster and compatible scope.
-- Null legacy cluster IDs use a deterministic per-row fallback. Legacy scopes
-- are computed on reads, never backfilled. Expiry is exclusive at exactly 24h;
-- reopening an old row does not restart its original-created_at window.
-- is_emergency is VOLUME ONLY; safety_signals never contribute to this flag.
-- Ownerless, closed, expired and future-dated rows return zero/false, even if
-- eligible peers in their cluster/scope currently cross the volume threshold.
CREATE OR REPLACE FUNCTION public.complaint_phase1_state(p_now TIMESTAMPTZ)
RETURNS TABLE (
  complaint_id UUID,
  effective_cluster_id TEXT,
  effective_scope TEXT,
  similar_count INTEGER,
  is_emergency BOOLEAN,
  cluster_is_emergency BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH scoped AS (
    SELECT
      c.id,
      c.complainant_id,
      COALESCE(NULLIF(c.cluster_id, ''), 'cluster_' || c.id::text) AS cluster_key,
      COALESCE(NULLIF(c.incident_scope, ''), public.complaint_phase1_scope(
        c.text, c.location_building, c.location_room
      )) AS scope_key,
      c.complainant_id IS NOT NULL
        AND c.status IN ('submitted', 'under_review', 'in_progress')
        AND c.created_at > p_now - INTERVAL '24 hours'
        AND c.created_at <= p_now AS eligible
    FROM public.complaints AS c
  ), incidents AS (
    SELECT
      cluster_key,
      scope_key,
      (count(DISTINCT complainant_id) FILTER (
        WHERE eligible
      ))::integer AS owner_count
    FROM scoped
    GROUP BY cluster_key, scope_key
  )
  SELECT
    s.id,
    s.cluster_key,
    s.scope_key,
    CASE WHEN s.eligible THEN i.owner_count ELSE 0 END,
    s.eligible AND i.owner_count >= 5,
    -- Kept for the helper's signature; this too is the current row's active
    -- volume flag, never a safety flag or an inactive peer's incident flag.
    s.eligible AND i.owner_count >= 5
  FROM scoped AS s
  JOIN incidents AS i ON i.cluster_key = s.cluster_key AND i.scope_key = s.scope_key;
$$;

REVOKE ALL ON FUNCTION public.complaint_phase1_state(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_phase1_state(TIMESTAMPTZ)
  TO service_role;

-- Derived-flag refresh only: timestamps, text, owners and lifecycle history are
-- unchanged. Each legacy scope in the affected cluster is evaluated separately.
-- The fixed two-integer advisory-lock namespace is shared by all Phase 1 writes
-- and lifecycle mutation. Reacquiring it within the same transaction is safe.
CREATE OR REPLACE FUNCTION public.refresh_complaint_phase1(p_cluster_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ;
BEGIN
  IF current_setting('transaction_isolation') NOT IN ('read committed', 'read uncommitted') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'Complaint writes require read committed isolation';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261011, 1);
  v_now := pg_catalog.clock_timestamp();

  UPDATE public.complaints AS c
  SET is_emergency = s.is_emergency
  FROM public.complaint_phase1_state(v_now) AS s
  WHERE c.id = s.complaint_id
    AND s.effective_cluster_id = p_cluster_id
    AND c.is_emergency IS DISTINCT FROM s.is_emergency;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001', MESSAGE = 'Unable to refresh complaint incident state';
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_complaint_phase1(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_complaint_phase1(TEXT)
  TO service_role;

-- The authenticated server supplies identity, fingerprint, scope and bounded
-- safety-rule signals. No client clock, status, cluster or emergency flag is
-- accepted. Safety signals are separate triage data, never an is_emergency input.
-- PT409 is the safe, distinguishable same-key/different-fingerprint conflict.
-- The old service-role-only persist_complaint_with_emergency RPC is retained
-- for compatibility, but it accepts precomputed membership/flags/timestamps and
-- does not share this lock. It is deprecated and NOT concurrency-safe for Phase 1;
-- the new application submission path must call create_complaint_phase1 instead.
COMMENT ON FUNCTION public.persist_complaint_with_emergency(
  UUID, UUID, TEXT, public.complaint_status, TEXT, TEXT, TEXT, JSONB,
  TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ
) IS 'Deprecated service-only compatibility RPC. Not concurrency-safe for Phase 1 incident assignment, counts or escalation; use create_complaint_phase1.';

CREATE OR REPLACE FUNCTION public.create_complaint_phase1(
  p_id UUID,
  p_owner UUID,
  p_text TEXT,
  p_category TEXT,
  p_location_building TEXT,
  p_location_room TEXT,
  p_attachments JSONB,
  p_submission_id UUID,
  p_fingerprint TEXT,
  p_scope TEXT,
  p_safety_signals TEXT[],
  p_similarity_threshold DOUBLE PRECISION DEFAULT 0.35
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_id UUID;
  v_fingerprint TEXT := p_fingerprint;
  v_existing_fingerprint TEXT;
  v_scope TEXT;
  v_signals TEXT[] := COALESCE(p_safety_signals, '{}'::text[]);
  v_cluster_id TEXT;
  v_replayed BOOLEAN := false;
  v_result JSONB;
BEGIN
  IF p_id IS NULL OR p_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Complaint identity is required';
  END IF;

  IF p_text IS NULL OR char_length(btrim(regexp_replace(
    p_text, '[[:space:]]+', ' ', 'g'
  ))) < 5 OR p_text !~ '[[:alnum:]]' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid complaint text';
  END IF;

  IF p_similarity_threshold IS NULL OR p_similarity_threshold < 0
    OR p_similarity_threshold > 1 OR p_similarity_threshold = 'NaN'::double precision THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid complaint similarity threshold';
  END IF;

  IF COALESCE(array_ndims(v_signals), 1) <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid complaint safety signals';
  END IF;
  IF array_position(v_signals, NULL) IS NOT NULL OR NOT (v_signals <@ ARRAY[
    'fire_or_smoke', 'electrical_hazard', 'gas_leak',
    'medical_distress', 'violence_or_threat', 'structural_collapse'
  ]::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid complaint safety signals';
  END IF;

  IF p_attachments IS NOT NULL AND jsonb_typeof(p_attachments) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid complaint attachments';
  END IF;
  IF v_fingerprint IS NOT NULL AND btrim(v_fingerprint) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid complaint submission fingerprint';
  END IF;
  IF p_submission_id IS NOT NULL AND v_fingerprint IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Complaint submission fingerprint is required';
  END IF;

  -- Preserve the already-normalized server-derived TS scope exactly. Applying
  -- locale/POSIX normalization again could silently alter a Unicode text scope.
  v_scope := p_scope;
  IF v_scope IS NULL OR v_scope = '' OR split_part(v_scope, '|', 1) = '' OR
    char_length(v_scope) - char_length(replace(v_scope, '|', '')) <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid complaint incident scope';
  END IF;

  -- Lock BEFORE any replay/candidate read; use a fresh DB clock after waiting.
  -- Under the normal READ COMMITTED RPC transaction, each subsequent statement
  -- sees the preceding serialized writer's committed insert/lifecycle change.
  IF current_setting('transaction_isolation') NOT IN ('read committed', 'read uncommitted') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'Complaint writes require read committed isolation';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261011, 1);
  v_now := pg_catalog.clock_timestamp();

  IF p_submission_id IS NOT NULL THEN
    SELECT c.id, c.submission_fingerprint INTO v_id, v_existing_fingerprint
    FROM public.complaints AS c
    WHERE c.complainant_id = p_owner AND c.submission_id = p_submission_id;

    IF FOUND THEN
      IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION USING
          ERRCODE = 'PT409', MESSAGE = 'Complaint submission idempotency conflict';
      END IF;
      v_replayed := true;
    END IF;
  ELSIF v_fingerprint IS NOT NULL THEN
    -- Only an incoming keyless request may reuse an identical recent report.
    -- Different explicit submission keys can retain distinct rows; DISTINCT
    -- owner aggregation still gives their owner at most one corroborating vote.
    SELECT c.id INTO v_id
    FROM public.complaints AS c
    WHERE c.complainant_id = p_owner
      AND c.submission_fingerprint = v_fingerprint
      AND c.status IN ('submitted', 'under_review', 'in_progress')
      AND c.created_at > v_now - INTERVAL '24 hours'
      AND c.created_at <= v_now
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1;
    v_replayed := FOUND;
  END IF;

  IF NOT v_replayed THEN
    SELECT candidate.cluster_key INTO v_cluster_id
    FROM (
      SELECT
        c.id,
        c.created_at,
        COALESCE(NULLIF(c.cluster_id, ''), 'cluster_' || c.id::text) AS cluster_key,
        public.complaint_phase1_similarity(p_text, c.text) AS score
      FROM public.complaints AS c
      WHERE c.complainant_id IS NOT NULL
        AND c.status IN ('submitted', 'under_review', 'in_progress')
        AND c.created_at > v_now - INTERVAL '24 hours'
        AND c.created_at <= v_now
        AND COALESCE(NULLIF(c.incident_scope, ''), public.complaint_phase1_scope(
          c.text, c.location_building, c.location_room
        )) = v_scope
    ) AS candidate
    WHERE candidate.score > 0 AND candidate.score >= p_similarity_threshold
    ORDER BY candidate.score DESC, candidate.created_at ASC, candidate.id ASC
    LIMIT 1;

    v_id := p_id;
    v_cluster_id := COALESCE(v_cluster_id, 'cluster_' || p_id::text);

    INSERT INTO public.complaints(
      id, complainant_id, text, status, category,
      location_building, location_room, attachments,
      cluster_id, is_emergency, created_at, updated_at,
      safety_signals, incident_scope, submission_id, submission_fingerprint
    ) VALUES (
      v_id, p_owner, p_text, 'submitted', COALESCE(p_category, 'other'),
      p_location_building, p_location_room, COALESCE(p_attachments, '[]'::jsonb),
      v_cluster_id, false, v_now, v_now,
      v_signals, v_scope, p_submission_id, v_fingerprint
    );

    PERFORM public.refresh_complaint_phase1(v_cluster_id);
  END IF;

  -- A replay is read-only: no timestamp, history or persisted-flag changes.
  -- Its response still overlays current incident state instead of stale flags.
  v_now := pg_catalog.clock_timestamp();
  SELECT jsonb_build_object(
    'complaint', to_jsonb(c) || jsonb_build_object(
      'similar_count', s.similar_count, 'is_emergency', s.is_emergency
    ),
    'cluster', jsonb_build_object(
      'cluster_id', s.effective_cluster_id,
      'group_count', s.similar_count,
      'is_emergency', s.is_emergency
    ),
    'replayed', v_replayed
  ) INTO v_result
  FROM public.complaints AS c
  JOIN public.complaint_phase1_state(v_now) AS s ON s.complaint_id = c.id
  WHERE c.id = v_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Unable to read saved complaint';
  END IF;
  RETURN v_result;
EXCEPTION
  WHEN SQLSTATE '22023' OR SQLSTATE 'PT409' THEN
    RAISE;
  WHEN OTHERS THEN
    -- Do not disclose underlying constraint details, fingerprints, text or IDs.
    -- The exception also rolls back the insert and every derived-flag refresh.
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Unable to save complaint';
END;
$$;

REVOKE ALL ON FUNCTION public.create_complaint_phase1(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT, TEXT, TEXT[], DOUBLE PRECISION
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_complaint_phase1(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT, TEXT, TEXT[], DOUBLE PRECISION
) TO service_role;

-- Preserve the existing signature, transition matrix, required closing notes,
-- assignment/actor behavior and status-change-only history. Staff authorization
-- remains the existing server responsibility. The global lock always precedes
-- the row lock, so lifecycle changes cannot race a grouping/insert decision.
CREATE OR REPLACE FUNCTION public.update_complaint_lifecycle(
  target_complaint_id UUID,
  next_status public.complaint_status,
  next_assigned_to UUID,
  next_response_note TEXT,
  actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_status public.complaint_status;
  v_cluster_id TEXT;
  v_now TIMESTAMPTZ;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Complaint lifecycle actor is required';
  END IF;
  IF next_status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Complaint lifecycle status is required';
  END IF;

  IF current_setting('transaction_isolation') NOT IN ('read committed', 'read uncommitted') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'Complaint writes require read committed isolation';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261011, 1);

  SELECT c.status, COALESCE(NULLIF(c.cluster_id, ''), 'cluster_' || c.id::text)
  INTO current_status, v_cluster_id
  FROM public.complaints AS c
  WHERE c.id = target_complaint_id
  FOR UPDATE;

  IF current_status IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Complaint not found';
  END IF;

  IF current_status <> next_status AND NOT (
    (current_status = 'submitted' AND next_status IN ('under_review', 'rejected')) OR
    (current_status = 'under_review' AND next_status IN ('in_progress', 'rejected')) OR
    (current_status = 'in_progress' AND next_status IN ('under_review', 'resolved', 'rejected')) OR
    (current_status IN ('resolved', 'rejected') AND next_status = 'under_review')
  ) THEN
    RAISE EXCEPTION 'Invalid complaint status transition from % to %', current_status, next_status
      USING ERRCODE = '22023';
  END IF;

  IF next_status IN ('resolved', 'rejected') AND NULLIF(btrim(next_response_note), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'A response note is required for resolved or rejected complaints';
  END IF;

  v_now := pg_catalog.clock_timestamp();
  UPDATE public.complaints
  SET status = next_status,
      assigned_to = next_assigned_to,
      response_note = NULLIF(btrim(next_response_note), ''),
      last_updated_by = actor_id,
      updated_at = v_now
  WHERE id = target_complaint_id;

  IF current_status <> next_status THEN
    INSERT INTO public.complaint_status_history(
      complaint_id, from_status, to_status, actor_id, note, created_at
    ) VALUES (
      target_complaint_id, current_status, next_status,
      actor_id, NULLIF(btrim(next_response_note), ''), v_now
    );
  END IF;

  -- Closure removes this owner's contribution only when they have no other
  -- eligible row in that incident. Reopening never changes original created_at.
  -- All scope partitions in the affected cluster are refreshed independently.
  PERFORM public.refresh_complaint_phase1(v_cluster_id);
EXCEPTION
  WHEN SQLSTATE '22023' OR SQLSTATE 'P0002' THEN
    RAISE;
  WHEN OTHERS THEN
    -- Failed FK/history/refresh writes roll back the entire lifecycle operation.
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'Unable to save complaint lifecycle update';
END;
$$;

REVOKE ALL ON FUNCTION public.update_complaint_lifecycle(
  UUID, public.complaint_status, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_complaint_lifecycle(
  UUID, public.complaint_status, UUID, TEXT, UUID
) TO service_role;

-- Scalar JSONB avoids PostgREST's table-result max_rows cap. Counts cover ALL
-- database rows before owner/view filtering, while the row array is restricted
-- to the server-authorized viewer. Existing application projection still removes
-- internal ownership/actor/idempotency data before sending rows to the browser.
-- One statement snapshot recalculates expiry without writing any stored flags.
CREATE OR REPLACE FUNCTION public.read_complaints_phase1(
  p_view TEXT,
  p_viewer UUID,
  p_can_view_all BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  IF p_view IS NULL OR p_view NOT IN ('all', 'normal', 'emergency') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid complaint view';
  END IF;
  IF p_can_view_all IS NULL OR (NOT p_can_view_all AND p_viewer IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Complaint viewer is required';
  END IF;

  v_now := pg_catalog.clock_timestamp();
  WITH calculated AS MATERIALIZED (
    SELECT
      c.id,
      c.complainant_id,
      c.created_at,
      s.is_emergency,
      to_jsonb(c) || jsonb_build_object(
        'similar_count', s.similar_count, 'is_emergency', s.is_emergency
      ) AS row_data
    FROM public.complaints AS c
    JOIN public.complaint_phase1_state(v_now) AS s ON s.complaint_id = c.id
  ), totals AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE NOT is_emergency) AS normal,
      count(*) FILTER (WHERE is_emergency) AS emergency
    FROM calculated
  ), visible AS (
    SELECT id, created_at, row_data
    FROM calculated
    WHERE (p_can_view_all OR complainant_id = p_viewer)
      AND (
        p_view = 'all' OR
        (p_view = 'normal' AND NOT is_emergency) OR
        (p_view = 'emergency' AND is_emergency)
      )
  ), row_output AS (
    SELECT COALESCE(
      jsonb_agg(row_data ORDER BY created_at DESC, id ASC), '[]'::jsonb
    ) AS complaints
    FROM visible
  )
  SELECT jsonb_build_object(
    'complaints', row_output.complaints,
    'counts', jsonb_build_object(
      'total', totals.total, 'normal', totals.normal, 'emergency', totals.emergency
    )
  ) INTO v_result
  FROM totals CROSS JOIN row_output;

  RETURN v_result;
EXCEPTION
  WHEN SQLSTATE '22023' THEN
    RAISE;
  WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Unable to read complaints';
END;
$$;

REVOKE ALL ON FUNCTION public.read_complaints_phase1(TEXT, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_complaints_phase1(TEXT, UUID, BOOLEAN)
  TO service_role;
