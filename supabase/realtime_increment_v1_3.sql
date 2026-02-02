-- ============================================================
-- Realtime Layer Incremental Update (V1.3 Hardened)
-- Focus: Streak logic accuracy, trigger optimization, and security
-- ============================================================

SET search_path = public, extensions;

-- 1) Optimized Dashboard Pulse Refresh
-- Fixes: Streak lost-updates, same-day double increments, and timezone rollovers
CREATE OR REPLACE FUNCTION public.refresh_user_dashboard_pulse(
  p_user_id UUID,
  p_review_ts TIMESTAMPTZ DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now       TIMESTAMPTZ := now();
  v_due_count INTEGER;
  v_next_due  TIMESTAMPTZ;

  v_prev_day  DATE;
  v_today     DATE;
  v_streak    INTEGER;
  v_last_upd  TIMESTAMPTZ;

  v_do_counts BOOLEAN := TRUE;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  -- Ensure row exists with a locked read
  INSERT INTO public.user_dashboard_pulse (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_study_day, streak_days, updated_at
    INTO v_prev_day, v_streak, v_last_upd
  FROM public.user_dashboard_pulse
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_streak := COALESCE(v_streak, 0);

  -- 1. Handle Streak Logic (always executes if review_ts is provided)
  IF p_review_ts IS NOT NULL THEN
    v_today := public.compute_user_study_day(p_user_id, p_review_ts);

    IF v_prev_day IS NULL OR v_prev_day < (v_today - 1) THEN
      v_streak := 1;
    ELSIF v_prev_day = (v_today - 1) THEN
      v_streak := v_streak + 1;
    -- ELSE: v_prev_day = v_today (already reviewed today, keep streak as is)
    END IF;
  END IF;

  -- 2. Handle Counts Throttle
  -- Counts are expensive (multi-table join), so we throttle them.
  -- Throttled harder (5s) during active reviews to avoid DB storm.
  IF p_review_ts IS NULL THEN
    v_do_counts := (v_last_upd IS NULL OR v_last_upd <= v_now - interval '2 seconds');
  ELSE
    v_do_counts := (v_last_upd IS NULL OR v_last_upd <= v_now - interval '5 seconds');
  END IF;

  IF v_do_counts THEN
    SELECT
      COUNT(*) FILTER (WHERE c.due <= v_now),
      MIN(c.due) FILTER (WHERE c.due > v_now)
    INTO v_due_count, v_next_due
    FROM public.cards c
    JOIN public.error_questions q ON q.id = c.question_id
    LEFT JOIN public.subjects s ON s.id = q.subject_id
    WHERE c.user_id = p_user_id
      AND q.is_archived = false
      AND (s.id IS NULL OR s.deleted_at IS NULL);
  END IF;

  -- 3. Unified Update
  UPDATE public.user_dashboard_pulse
  SET
    due_count      = COALESCE(v_due_count, due_count),
    next_due_at    = COALESCE(v_next_due, next_due_at),
    streak_days    = CASE WHEN p_review_ts IS NOT NULL THEN v_streak ELSE streak_days END,
    last_study_day = CASE 
      WHEN p_review_ts IS NOT NULL THEN GREATEST(v_today, COALESCE(v_prev_day, '1900-01-01'::date))
      ELSE last_study_day 
    END,
    updated_at     = v_now,
    seq            = nextval('public.realtime_seq')
  WHERE user_id = p_user_id;
END $$;

-- 2) Optimized Trigger Definitions
-- Using WHEN clauses to prevent unnecessary function calls at the Postgres engine level

-- 2.1 Cards Sync Pulse
DROP TRIGGER IF EXISTS rt_trg_cards_sync_pulse_upsert ON public.cards;
CREATE TRIGGER rt_trg_cards_sync_pulse_upsert
AFTER INSERT OR UPDATE OF due, state, lapses ON public.cards
FOR EACH ROW
WHEN (
  TG_OP = 'INSERT' 
  OR OLD.due IS DISTINCT FROM NEW.due 
  OR OLD.state IS DISTINCT FROM NEW.state 
  OR OLD.lapses IS DISTINCT FROM NEW.lapses
)
EXECUTE FUNCTION public.rt_trg_cards_sync_pulse_upsert();

-- 2.2 Dashboard Refresh (Update branch)
DROP TRIGGER IF EXISTS rt_trg_cards_refresh_dashboard_upd ON public.cards;
CREATE TRIGGER rt_trg_cards_refresh_dashboard_upd
AFTER UPDATE OF due, last_review, question_id ON public.cards
FOR EACH ROW
WHEN (
  OLD.due IS DISTINCT FROM NEW.due 
  OR OLD.last_review IS DISTINCT FROM NEW.last_review 
  OR OLD.question_id IS DISTINCT FROM NEW.question_id
)
EXECUTE FUNCTION public.rt_trg_cards_refresh_dashboard();

-- 3) Security Audit: Ensure tight search_paths for all definers
ALTER FUNCTION public.rt_trg_cards_sync_pulse_upsert() SET search_path = pg_catalog, public;
ALTER FUNCTION public.rt_trg_import_jobs_pulse_upsert() SET search_path = pg_catalog, public;
ALTER FUNCTION public.rt_trg_cards_refresh_dashboard() SET search_path = pg_catalog, public;
ALTER FUNCTION public.rt_trg_error_questions_emit_signal() SET search_path = pg_catalog, public;
ALTER FUNCTION public.rt_trg_error_questions_emit_remove() SET search_path = pg_catalog, public;
ALTER FUNCTION public.rt_trg_qtags_emit_question_invalidate() SET search_path = pg_catalog, public;
ALTER FUNCTION public.rt_trg_exam_records_emit_signal() SET search_path = pg_catalog, public;
ALTER FUNCTION public.rt_trg_exam_records_emit_remove() SET search_path = pg_catalog, public;

-- ============================================================
-- Increment V1.3 Applied
-- ============================================================
