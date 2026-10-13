-- ============================================================================
-- Smart Campus: 018_emergency_report_history.sql
-- Persistent audit history for Emergency Report lifecycle transitions.
-- Ensures atomic status transition and history logging via database RPC.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.emergency_report_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES public.emergency_reports(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL CHECK (from_status IN ('submitted', 'acknowledged', 'verifying', 'verified', 'resolved', 'rejected')),
  to_status TEXT NOT NULL CHECK (to_status IN ('submitted', 'acknowledged', 'verifying', 'verified', 'resolved', 'rejected')),
  actor_id TEXT NOT NULL,
  actor_name TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_emergency_report_history_report
  ON public.emergency_report_history(report_id, created_at DESC);

ALTER TABLE public.emergency_report_history ENABLE ROW LEVEL SECURITY;

-- Responders / staff can view audit history; ordinary clients have no access
CREATE POLICY "Responders can view emergency report history"
  ON public.emergency_report_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'faculty', 'department_head', 'security_officer', 'maintenance_officer')
    )
  );

-- No direct client insert/update/delete allowed; managed through service_role / RPC only
REVOKE ALL ON public.emergency_report_history FROM anon, authenticated;
GRANT SELECT ON public.emergency_report_history TO authenticated;
GRANT ALL ON public.emergency_report_history TO service_role;

-- Atomic transaction function: updates status, updates timestamps, and writes history entry.
CREATE OR REPLACE FUNCTION public.transition_emergency_report_status(
  p_report_id UUID,
  p_target_status TEXT,
  p_expected_status TEXT,
  p_actor_id TEXT,
  p_actor_name TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS public.emergency_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current RECORD;
  v_updated public.emergency_reports;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- 1. Lock and retrieve current report row
  SELECT * INTO v_current
  FROM public.emergency_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Emergency report not found.';
  END IF;

  -- 2. Concurrency check
  IF p_expected_status IS NOT NULL AND v_current.status <> p_expected_status THEN
    RAISE EXCEPTION 'Conflict: Emergency report status changed from ''%'' to ''%''. Please refresh.',
      p_expected_status, v_current.status;
  END IF;

  -- 3. Transition validation check
  IF v_current.status = p_target_status THEN
    RETURN v_current;
  END IF;

  IF NOT (
    (v_current.status = 'submitted' AND p_target_status IN ('acknowledged', 'verifying', 'rejected')) OR
    (v_current.status = 'verifying' AND p_target_status IN ('verified', 'acknowledged', 'rejected')) OR
    (v_current.status = 'acknowledged' AND p_target_status IN ('verifying', 'verified', 'rejected')) OR
    (v_current.status = 'verified' AND p_target_status IN ('resolved', 'verifying'))
  ) THEN
    RAISE EXCEPTION 'Invalid status transition from ''%'' to ''%''.', v_current.status, p_target_status;
  END IF;

  -- 4. Update the emergency report row
  UPDATE public.emergency_reports
  SET status = p_target_status,
      updated_at = v_now,
      resolved_at = CASE
        WHEN p_target_status = 'resolved' THEN v_now
        ELSE resolved_at
      END
  WHERE id = p_report_id
  RETURNING * INTO v_updated;

  -- 5. Record the audit entry
  INSERT INTO public.emergency_report_history (
    report_id,
    from_status,
    to_status,
    actor_id,
    actor_name,
    note,
    created_at
  ) VALUES (
    p_report_id,
    v_current.status,
    p_target_status,
    p_actor_id,
    p_actor_name,
    nullif(btrim(p_note), '')
  );

  RETURN v_updated;
END;
$$;

-- Revoke direct execution from non-service clients to prevent unauthorized status or actor spoofing.
-- Lifecycle transitions must be invoked through server-side service clients after authorization checks.
REVOKE EXECUTE ON FUNCTION public.transition_emergency_report_status(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_emergency_report_status(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
