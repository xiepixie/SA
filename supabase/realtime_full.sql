-- ============================================================
-- Realtime Layer for Schema V5.9 (Production Hardened)
-- 3-Tier: Signal Hub (invalidate) + Pulses (lite sync) + Dashboard snapshot
-- ============================================================

SET search_path = public, extensions;

-- ============================================================
-- 0) Setup: Types & Security Helpers
-- ============================================================

DO $$ BEGIN
    CREATE TYPE public.realtime_topic_enum AS ENUM ('question', 'question_list', 'exam', 'exam_list', 'due_list', 'asset', 'job', 'card', 'card_overlay');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.realtime_op_enum AS ENUM ('UPSERT', 'UPDATE', 'REMOVE', 'REFRESH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 0.1) Monotonic sequence for high-precision tie-breaking
CREATE SEQUENCE IF NOT EXISTS public.realtime_seq;
GRANT USAGE ON SEQUENCE public.realtime_seq TO service_role;
GRANT USAGE ON SEQUENCE public.realtime_seq TO authenticated;

-- helper: centralized suppression check (only service_role can mute)
CREATE OR REPLACE FUNCTION public.rt_is_suppress_allowed()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    current_setting('app.suppress_realtime', true) = 'true'
    AND (session_user = 'service_role' OR pg_has_role(session_user, 'service_role', 'member'));
$$;

-- ============================================================
-- 1) Signal Hub (Invalidation Broadcast)
--    - bounded “dirty-set” upsert (no infinite append)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.realtime_signals (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic       public.realtime_topic_enum NOT NULL, 
  entity_key  TEXT        NOT NULL,                -- UUID::text or 'global'
  op          public.realtime_op_enum NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  seq         BIGINT      NOT NULL DEFAULT nextval('public.realtime_seq'),
  PRIMARY KEY (user_id, topic, entity_key),
  CONSTRAINT realtime_signals_payload_check CHECK (jsonb_typeof(payload) = 'object')
);

-- idempotent migration (if table existed with TEXT columns)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='realtime_signals'
      AND column_name='topic' AND udt_name <> 'realtime_topic_enum'
  ) THEN
    ALTER TABLE public.realtime_signals
      ALTER COLUMN topic TYPE public.realtime_topic_enum
      USING topic::public.realtime_topic_enum;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='realtime_signals'
      AND column_name='op' AND udt_name <> 'realtime_op_enum'
  ) THEN
    ALTER TABLE public.realtime_signals
      ALTER COLUMN op TYPE public.realtime_op_enum
      USING op::public.realtime_op_enum;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_realtime_signals_user_updated
  ON public.realtime_signals (user_id, updated_at DESC);

REVOKE ALL ON public.realtime_signals FROM PUBLIC;
REVOKE ALL ON public.realtime_signals FROM anon, authenticated;
GRANT SELECT ON public.realtime_signals TO authenticated;
GRANT SELECT ON public.realtime_signals TO service_role;

ALTER TABLE public.realtime_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS realtime_signals_read_mine ON public.realtime_signals;
CREATE POLICY realtime_signals_read_mine
ON public.realtime_signals
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- helper: upsert with throttle (default 250ms); REMOVE always passes
CREATE OR REPLACE FUNCTION public.upsert_realtime_signal(
  p_user_id UUID,
  p_topic public.realtime_topic_enum,
  p_entity_key TEXT,
  p_op public.realtime_op_enum,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_throttle_ms INTEGER DEFAULT 250
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_throttle INTERVAL := (p_throttle_ms::text || ' milliseconds')::interval;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.realtime_signals (user_id, topic, entity_key, op, payload, updated_at, seq)
  VALUES (p_user_id, p_topic, p_entity_key, p_op, COALESCE(p_payload,'{}'::jsonb), v_now, nextval('public.realtime_seq'))
  ON CONFLICT (user_id, topic, entity_key) DO UPDATE
    SET op = EXCLUDED.op,
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at,
        seq = EXCLUDED.seq
  WHERE
    (EXCLUDED.op = 'REMOVE')
    OR public.realtime_signals.updated_at < EXCLUDED.updated_at
    OR (public.realtime_signals.updated_at = EXCLUDED.updated_at AND public.realtime_signals.seq < EXCLUDED.seq);
END $$;

REVOKE ALL ON FUNCTION public.upsert_realtime_signal(UUID, public.realtime_topic_enum, TEXT, public.realtime_op_enum, JSONB, INTEGER) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_realtime_signal(UUID, public.realtime_topic_enum, TEXT, public.realtime_op_enum, JSONB, INTEGER) TO service_role;

-- helper: fan-out to all card-watchers of a question (public question sync)
CREATE OR REPLACE FUNCTION public.upsert_realtime_signal_for_question_watchers(
  p_question_id UUID,
  p_topic public.realtime_topic_enum,
  p_entity_key TEXT,
  p_op public.realtime_op_enum,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_throttle_ms INTEGER DEFAULT 500
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_throttle INTERVAL := (p_throttle_ms::text || ' milliseconds')::interval;
BEGIN
  INSERT INTO public.realtime_signals (user_id, topic, entity_key, op, payload, updated_at, seq)
  SELECT DISTINCT c.user_id, p_topic, p_entity_key, p_op, COALESCE(p_payload,'{}'::jsonb), v_now, nextval('public.realtime_seq')
  FROM public.cards c
  WHERE c.question_id = p_question_id
  ON CONFLICT (user_id, topic, entity_key) DO UPDATE
    SET op = EXCLUDED.op,
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at,
        seq = EXCLUDED.seq
  WHERE
    (EXCLUDED.op = 'REMOVE')
    OR public.realtime_signals.updated_at < EXCLUDED.updated_at
    OR (public.realtime_signals.updated_at = EXCLUDED.updated_at AND public.realtime_signals.seq < EXCLUDED.seq);
END $$;

REVOKE ALL ON FUNCTION public.upsert_realtime_signal_for_question_watchers(UUID, public.realtime_topic_enum, TEXT, public.realtime_op_enum, JSONB, INTEGER) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_realtime_signal_for_question_watchers(UUID, public.realtime_topic_enum, TEXT, public.realtime_op_enum, JSONB, INTEGER) TO service_role;

-- ============================================================
-- 1) Pulses (Lite Projection): cards_sync_pulse + import_jobs_pulse
-- ============================================================

-- 1.1 Cards pulse: only fields needed for “today list” sync
CREATE TABLE IF NOT EXISTS public.cards_sync_pulse (
  card_id    UUID PRIMARY KEY REFERENCES public.cards(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due        TIMESTAMPTZ,
  state      SMALLINT,
  lapses     INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seq        BIGINT      NOT NULL DEFAULT nextval('public.realtime_seq')
);

CREATE INDEX IF NOT EXISTS idx_cards_sync_pulse_user_updated
  ON public.cards_sync_pulse (user_id, updated_at DESC);

REVOKE ALL ON public.cards_sync_pulse FROM PUBLIC;
REVOKE ALL ON public.cards_sync_pulse FROM anon, authenticated;
GRANT SELECT ON public.cards_sync_pulse TO authenticated;
GRANT SELECT ON public.cards_sync_pulse TO service_role;

ALTER TABLE public.cards_sync_pulse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cards_sync_pulse_read_mine ON public.cards_sync_pulse;
CREATE POLICY cards_sync_pulse_read_mine
ON public.cards_sync_pulse
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.rt_trg_cards_sync_pulse_upsert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.due   IS NOT DISTINCT FROM OLD.due
       AND NEW.state  IS NOT DISTINCT FROM OLD.state
       AND NEW.lapses IS NOT DISTINCT FROM OLD.lapses THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.cards_sync_pulse (card_id, user_id, due, state, lapses, updated_at, seq)
  VALUES (NEW.id, NEW.user_id, NEW.due, NEW.state, NEW.lapses, now(), nextval('public.realtime_seq'))
  ON CONFLICT (card_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        due = EXCLUDED.due,
        state = EXCLUDED.state,
        lapses = EXCLUDED.lapses,
        updated_at = EXCLUDED.updated_at,
        seq = EXCLUDED.seq;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_cards_sync_pulse_upsert() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_cards_sync_pulse_upsert ON public.cards;
CREATE TRIGGER rt_trg_cards_sync_pulse_upsert
AFTER INSERT OR UPDATE OF due, state, lapses ON public.cards
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_cards_sync_pulse_upsert();

-- 1.2 Import jobs pulse: avoids shipping error_details/config in realtime
CREATE TABLE IF NOT EXISTS public.import_jobs_pulse (
  job_id      UUID PRIMARY KEY REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      public.job_status_enum NOT NULL, -- [Sync] Match main schema ENUM
  total_rows  INTEGER,
  processed_rows INTEGER,
  success_count  INTEGER,
  error_count    INTEGER,
  last_error     TEXT,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  seq            BIGINT      NOT NULL DEFAULT nextval('public.realtime_seq')
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_pulse_user_updated
  ON public.import_jobs_pulse (user_id, updated_at DESC);

REVOKE ALL ON public.import_jobs_pulse FROM PUBLIC;
REVOKE ALL ON public.import_jobs_pulse FROM anon, authenticated;
GRANT SELECT ON public.import_jobs_pulse TO authenticated;
GRANT SELECT ON public.import_jobs_pulse TO service_role;

ALTER TABLE public.import_jobs_pulse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_jobs_pulse_read_mine ON public.import_jobs_pulse;
CREATE POLICY import_jobs_pulse_read_mine
ON public.import_jobs_pulse
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.rt_trg_import_jobs_pulse_upsert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status        IS NOT DISTINCT FROM OLD.status
       AND NEW.total_rows    IS NOT DISTINCT FROM OLD.total_rows
       AND NEW.processed_rows IS NOT DISTINCT FROM OLD.processed_rows
       AND NEW.success_count  IS NOT DISTINCT FROM OLD.success_count
       AND NEW.error_count    IS NOT DISTINCT FROM OLD.error_count
       AND NEW.last_error     IS NOT DISTINCT FROM OLD.last_error
       AND NEW.started_at     IS NOT DISTINCT FROM OLD.started_at
       AND NEW.completed_at   IS NOT DISTINCT FROM OLD.completed_at THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.import_jobs_pulse (
    job_id, user_id, status,
    total_rows, processed_rows, success_count, error_count,
    last_error, started_at, completed_at, updated_at, seq
  ) VALUES (
    NEW.id, NEW.user_id, NEW.status,
    NEW.total_rows, NEW.processed_rows, NEW.success_count, NEW.error_count,
    NEW.last_error, NEW.started_at, NEW.completed_at, now(), nextval('public.realtime_seq')
  )
  ON CONFLICT (job_id) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        status = EXCLUDED.status,
        total_rows = EXCLUDED.total_rows,
        processed_rows = EXCLUDED.processed_rows,
        success_count = EXCLUDED.success_count,
        error_count = EXCLUDED.error_count,
        last_error = EXCLUDED.last_error,
        started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at,
        updated_at = EXCLUDED.updated_at,
        seq = EXCLUDED.seq;

  -- also emit a small signal for “toast / notify”
  PERFORM public.upsert_realtime_signal(
    NEW.user_id,
    'job',
    NEW.id::text,
    CASE WHEN TG_OP='INSERT' THEN 'UPSERT' ELSE 'UPDATE' END,
    jsonb_build_object('job_id', NEW.id, 'status', NEW.status, 'error_count', NEW.error_count),
    300
  );

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_import_jobs_pulse_upsert() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_import_jobs_pulse_upsert ON public.import_jobs;
CREATE TRIGGER rt_trg_import_jobs_pulse_upsert
AFTER INSERT OR UPDATE OF status, total_rows, processed_rows, success_count, error_count, last_error, started_at, completed_at
ON public.import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_import_jobs_pulse_upsert();

-- ============================================================
-- 2) Dashboard snapshot (Aggregated Heartbeat)
--    IMPORTANT: do NOT trigger from review_logs insert (submit_review inserts log BEFORE updating card)
--    -> trigger from cards AFTER UPDATE of last_review/due instead
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_dashboard_pulse (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  due_count      INTEGER NOT NULL DEFAULT 0,
  next_due_at    TIMESTAMPTZ,
  streak_days    INTEGER NOT NULL DEFAULT 0,
  last_study_day DATE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  seq            BIGINT      NOT NULL DEFAULT nextval('public.realtime_seq')
);

REVOKE ALL ON public.user_dashboard_pulse FROM PUBLIC;
REVOKE ALL ON public.user_dashboard_pulse FROM anon, authenticated;
GRANT SELECT ON public.user_dashboard_pulse TO authenticated;
GRANT SELECT ON public.user_dashboard_pulse TO service_role;

ALTER TABLE public.user_dashboard_pulse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_pulse_read_mine ON public.user_dashboard_pulse;
CREATE POLICY dashboard_pulse_read_mine
ON public.user_dashboard_pulse
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- compute “study day” using review_settings timezone + rollover_hour
CREATE OR REPLACE FUNCTION public.compute_user_study_day(p_user_id UUID, p_ts TIMESTAMPTZ)
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tz   TEXT := 'UTC';
  v_roll SMALLINT := 4;
BEGIN
  SELECT timezone, rollover_hour INTO v_tz, v_roll
  FROM public.review_settings WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    SELECT timezone, rollover_hour INTO v_tz, v_roll
    FROM public.review_settings WHERE user_id IS NULL;
  END IF;

  v_tz   := COALESCE(v_tz, 'UTC');
  v_roll := COALESCE(v_roll, 4);

  RETURN (timezone(v_tz, p_ts) - make_interval(hours => v_roll))::date;
END $$;

REVOKE ALL ON FUNCTION public.compute_user_study_day(UUID, TIMESTAMPTZ) FROM PUBLIC, authenticated;

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

  -- Ensure target row exists
  INSERT INTO public.user_dashboard_pulse (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock row to avoid streak lost-update under concurrency
  SELECT last_study_day, streak_days, updated_at
    INTO v_prev_day, v_streak, v_last_upd
  FROM public.user_dashboard_pulse
  WHERE user_id = p_user_id
  FOR UPDATE;

  v_streak := COALESCE(v_streak, 0);

  -- Throttle decision
  IF p_review_ts IS NULL THEN
    v_do_counts := (v_last_upd IS NULL OR v_last_upd <= v_now - interval '2 seconds');
  ELSE
    v_today := public.compute_user_study_day(p_user_id, p_review_ts);

    IF v_prev_day IS NULL OR v_prev_day < (v_today - 1) THEN
      v_streak := 1;
    ELSIF v_prev_day = (v_today - 1) THEN
      v_streak := v_streak + 1;
    END IF;

    -- counts throttled harder during fast consecutive reviews
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

  UPDATE public.user_dashboard_pulse
  SET
    due_count      = COALESCE(v_due_count, due_count),
    next_due_at    = COALESCE(v_next_due, next_due_at),
    streak_days    = CASE WHEN p_review_ts IS NOT NULL THEN v_streak ELSE streak_days END,
    last_study_day = CASE 
      ELSE last_study_day 
    END,
    updated_at     = v_now,
    seq            = nextval('public.realtime_seq')
  WHERE user_id = p_user_id;
END $$;

REVOKE ALL ON FUNCTION public.refresh_user_dashboard_pulse(UUID, TIMESTAMPTZ) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_user_dashboard_pulse(UUID, TIMESTAMPTZ) TO service_role;

-- cards -> dashboard (post-review accuracy: relies on NEW.last_review set by submit_review card update)
CREATE OR REPLACE FUNCTION public.rt_trg_cards_refresh_dashboard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_user_dashboard_pulse(OLD.user_id, NULL);
    RETURN OLD;
  END IF;

  -- streak update only when last_review changes (or insert with last_review already set)
  IF TG_OP = 'UPDATE' THEN
    IF NEW.last_review IS DISTINCT FROM OLD.last_review AND NEW.last_review IS NOT NULL THEN
      PERFORM public.refresh_user_dashboard_pulse(NEW.user_id, NEW.last_review);
    ELSE
      PERFORM public.refresh_user_dashboard_pulse(NEW.user_id, NULL);
    END IF;
  ELSE
    PERFORM public.refresh_user_dashboard_pulse(NEW.user_id, NULL);
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_cards_refresh_dashboard() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_cards_refresh_dashboard_ins ON public.cards;
CREATE TRIGGER rt_trg_cards_refresh_dashboard_ins
AFTER INSERT ON public.cards
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_cards_refresh_dashboard();

DROP TRIGGER IF EXISTS rt_trg_cards_refresh_dashboard_upd ON public.cards;
CREATE TRIGGER rt_trg_cards_refresh_dashboard_upd
AFTER UPDATE OF due, last_review, question_id ON public.cards
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_cards_refresh_dashboard();

DROP TRIGGER IF EXISTS rt_trg_cards_refresh_dashboard_del ON public.cards;
CREATE TRIGGER rt_trg_cards_refresh_dashboard_del
AFTER DELETE ON public.cards
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_cards_refresh_dashboard();

-- ============================================================
-- 3) Heavy entities -> signals (invalidate / minimal patch)
-- ============================================================

-- 3.1 error_questions: UPDATE/UPSERT signal (public: notify watchers; private: owner)
CREATE OR REPLACE FUNCTION public.rt_trg_error_questions_emit_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_op public.realtime_op_enum := CASE WHEN TG_OP='INSERT' THEN 'UPSERT' ELSE 'UPDATE' END;
  v_payload JSONB;
  v_is_subject_only_move BOOLEAN := FALSE;
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN NEW;
  END IF;

  IF TG_OP='UPDATE' THEN
    v_is_subject_only_move :=
      (NEW.subject_id IS DISTINCT FROM OLD.subject_id)
      AND (NEW.title IS NOT DISTINCT FROM OLD.title)
      AND (NEW.difficulty IS NOT DISTINCT FROM OLD.difficulty)
      AND (NEW.question_type IS NOT DISTINCT FROM OLD.question_type)
      AND (NEW.is_archived IS NOT DISTINCT FROM OLD.is_archived);
  END IF;

  IF v_is_subject_only_move THEN
    -- collapse massive subject-merge storms into one global refresh (throttled)
    IF NEW.user_id IS NOT NULL THEN
      PERFORM public.upsert_realtime_signal(
        NEW.user_id, 'question_list', 'global', 'REFRESH',
        jsonb_build_object('reason','subject_moved'),
        800
      );
    ELSE
      PERFORM public.upsert_realtime_signal_for_question_watchers(
        NEW.id, 'question_list', 'global', 'REFRESH',
        jsonb_build_object('reason','public_subject_moved'),
        1200
      );
    END IF;
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'question_id', NEW.id,
    'op', v_op,
    'title', NEW.title,              -- small UX patch (list can update instantly)
    'difficulty', NEW.difficulty,
    'question_type', NEW.question_type,
    'subject_id', NEW.subject_id,
    'is_archived', NEW.is_archived,
    'updated_at', NEW.updated_at
  );

  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.upsert_realtime_signal(NEW.user_id, 'question', NEW.id::text, v_op, v_payload, 300);

    IF TG_OP='UPDATE' AND NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
      PERFORM public.upsert_realtime_signal(
        NEW.user_id, 'due_list', 'global', 'REFRESH',
        jsonb_build_object('reason','question_archive_toggle','question_id',NEW.id,'is_archived',NEW.is_archived),
        0
      );
      PERFORM public.refresh_user_dashboard_pulse(NEW.user_id, NULL);
    END IF;
  ELSE
    PERFORM public.upsert_realtime_signal_for_question_watchers(NEW.id, 'question', NEW.id::text, v_op, v_payload, 800);

    IF TG_OP='UPDATE' AND NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
      PERFORM public.upsert_realtime_signal_for_question_watchers(
        NEW.id, 'due_list', 'global', 'REFRESH',
        jsonb_build_object('reason','public_question_archive_toggle','question_id',NEW.id,'is_archived',NEW.is_archived),
        0
      );
      -- refresh dashboards for all watchers (set-based)
      PERFORM (
        WITH u AS (SELECT DISTINCT user_id FROM public.cards WHERE question_id = NEW.id)
        SELECT public.refresh_user_dashboard_pulse(u.user_id, NULL) FROM u
      );
    END IF;
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_error_questions_emit_signal() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_error_questions_emit_signal ON public.error_questions;
CREATE TRIGGER rt_trg_error_questions_emit_signal
AFTER INSERT OR UPDATE ON public.error_questions
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_error_questions_emit_signal();

-- error_questions DELETE -> REMOVE (don’t rely on CDC delete payload)
CREATE OR REPLACE FUNCTION public.rt_trg_error_questions_emit_remove()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN OLD;
  END IF;

  IF OLD.user_id IS NOT NULL THEN
    PERFORM public.upsert_realtime_signal(
      OLD.user_id, 'question', OLD.id::text, 'REMOVE',
      jsonb_build_object('question_id', OLD.id),
      0
    );
    PERFORM public.upsert_realtime_signal(
      OLD.user_id, 'due_list', 'global', 'REFRESH',
      jsonb_build_object('reason','question_deleted','question_id',OLD.id),
      0
    );
    PERFORM public.refresh_user_dashboard_pulse(OLD.user_id, NULL);
  ELSE
    PERFORM public.upsert_realtime_signal_for_question_watchers(
      OLD.id, 'question', OLD.id::text, 'REMOVE',
      jsonb_build_object('question_id', OLD.id),
      0
    );
    PERFORM public.upsert_realtime_signal_for_question_watchers(
      OLD.id, 'due_list', 'global', 'REFRESH',
      jsonb_build_object('reason','public_question_deleted','question_id',OLD.id),
      0
    );
    PERFORM (
      WITH u AS (SELECT DISTINCT user_id FROM public.cards WHERE question_id = OLD.id)
      SELECT public.refresh_user_dashboard_pulse(u.user_id, NULL) FROM u
    );
  END IF;

  RETURN OLD;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_error_questions_emit_remove() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_error_questions_emit_remove ON public.error_questions;
CREATE TRIGGER rt_trg_error_questions_emit_remove
BEFORE DELETE ON public.error_questions
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_error_questions_emit_remove();

-- 3.2 error_question_tags: tag changes should invalidate question list item
CREATE OR REPLACE FUNCTION public.rt_trg_qtags_emit_question_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_qid UUID := COALESCE(NEW.question_id, OLD.question_id);
  v_q public.error_questions%ROWTYPE;
  v_payload JSONB;
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT * INTO v_q FROM public.error_questions WHERE id = v_qid;
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_payload := jsonb_build_object(
    'question_id', v_qid,
    'reason', 'tags_changed'
  );

  IF v_q.user_id IS NOT NULL THEN
    PERFORM public.upsert_realtime_signal(v_q.user_id, 'question', v_qid::text, 'UPDATE', v_payload, 250);
  ELSE
    PERFORM public.upsert_realtime_signal_for_question_watchers(v_qid, 'question', v_qid::text, 'UPDATE', v_payload, 800);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_qtags_emit_question_invalidate() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_qtags_emit_question_invalidate_ins ON public.error_question_tags;
CREATE TRIGGER rt_trg_qtags_emit_question_invalidate_ins
AFTER INSERT ON public.error_question_tags
FOR EACH ROW EXECUTE FUNCTION public.rt_trg_qtags_emit_question_invalidate();

DROP TRIGGER IF EXISTS rt_trg_qtags_emit_question_invalidate_del ON public.error_question_tags;
CREATE TRIGGER rt_trg_qtags_emit_question_invalidate_del
AFTER DELETE ON public.error_question_tags
FOR EACH ROW EXECUTE FUNCTION public.rt_trg_qtags_emit_question_invalidate();

-- 3.3 exam_records: status/score/end_time changes -> tiny signal (no answers/results realtime)
CREATE OR REPLACE FUNCTION public.rt_trg_exam_records_emit_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_op public.realtime_op_enum := CASE WHEN TG_OP='INSERT' THEN 'UPSERT' ELSE 'UPDATE' END;
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN NEW;
  END IF;

  PERFORM public.upsert_realtime_signal(
    NEW.user_id,
    'exam',
    NEW.id::text,
    v_op,
    jsonb_build_object(
      'exam_id', NEW.id,
      'status', NEW.status,
      'score', NEW.score,
      'end_time', NEW.end_time,
      'updated_at', NEW.updated_at
    ),
    500
  );

  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.upsert_realtime_signal(
      NEW.user_id,
      'exam_list',
      'global',
      'REFRESH',
      jsonb_build_object('reason','status_changed','exam_id',NEW.id,'status',NEW.status),
      0
    );
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_exam_records_emit_signal() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_exam_records_emit_signal ON public.exam_records;
CREATE TRIGGER rt_trg_exam_records_emit_signal
AFTER INSERT OR UPDATE OF status, score, end_time ON public.exam_records
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_exam_records_emit_signal();

CREATE OR REPLACE FUNCTION public.rt_trg_exam_records_emit_remove()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN OLD;
  END IF;

  PERFORM public.upsert_realtime_signal(
    OLD.user_id,
    'exam',
    OLD.id::text,
    'REMOVE',
    jsonb_build_object('exam_id', OLD.id),
    0
  );

  PERFORM public.upsert_realtime_signal(
    OLD.user_id,
    'exam_list',
    'global',
    'REFRESH',
    jsonb_build_object('reason','exam_deleted','exam_id',OLD.id),
    0
  );

  RETURN OLD;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_exam_records_emit_remove() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_exam_records_emit_remove ON public.exam_records;
CREATE TRIGGER rt_trg_exam_records_emit_remove
BEFORE DELETE ON public.exam_records
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_exam_records_emit_remove();

-- 3.4 management_logs: merge/undo -> asset refresh (one signal)
CREATE OR REPLACE FUNCTION public.rt_trg_management_logs_emit_asset_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN NEW;
  END IF;

  -- “assets changed” -> refresh subjects/tags lists, and filters dependent on them
  PERFORM public.upsert_realtime_signal(
    NEW.user_id,
    'asset',
    'global',
    'REFRESH',
    jsonb_build_object(
      'log_id', NEW.id,
      'op_type', NEW.op_type,
      'entity_type', NEW.entity_type,
      'source_id', NEW.source_id,
      'target_id', NEW.target_id
    ),
    300
  );

  -- tag merge may also affect overlay personal_tags (cards) -> let UI decide to refetch if needed
  IF NEW.entity_type = 'tag' AND NEW.op_type = 'merge' THEN
    PERFORM public.upsert_realtime_signal(
      NEW.user_id,
      'card_overlay',
      'global',
      'REFRESH',
      jsonb_build_object('reason','personal_tags_rewritten','log_id',NEW.id),
      800
    );
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_management_logs_emit_asset_refresh() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_management_logs_emit_asset_refresh ON public.management_logs;
CREATE TRIGGER rt_trg_management_logs_emit_asset_refresh
AFTER INSERT OR UPDATE OF undone_at ON public.management_logs
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_management_logs_emit_asset_refresh();

-- 3.5 subjects: deleted_at changes affect v_due_cards filter -> refresh due_list + dashboard
CREATE OR REPLACE FUNCTION public.rt_trg_subjects_emit_due_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN NEW;
  END IF;

  -- 1. Asset Refresh (metadata/name/color change)
  IF NEW.user_id IS NOT NULL AND (
    NEW.name IS DISTINCT FROM OLD.name 
    OR NEW.color IS DISTINCT FROM OLD.color
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  ) THEN
    PERFORM public.upsert_realtime_signal(
      NEW.user_id, 'asset', 'global', 'REFRESH',
      jsonb_build_object('reason', 'subject_changed', 'subject_id', NEW.id, 'deleted_at', NEW.deleted_at),
      300
    );
  END IF;

  -- 2. Due list refresh (soft-delete toggle)
  IF NEW.user_id IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    PERFORM public.upsert_realtime_signal(
      NEW.user_id,
      'due_list',
      'global',
      'REFRESH',
      jsonb_build_object('reason','subject_soft_delete_toggle','subject_id',NEW.id,'deleted_at',NEW.deleted_at),
      0
    );
    PERFORM public.refresh_user_dashboard_pulse(NEW.user_id, NULL);
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_subjects_emit_due_refresh() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_subjects_emit_due_refresh ON public.subjects;
CREATE TRIGGER rt_trg_subjects_emit_due_refresh
AFTER INSERT OR UPDATE ON public.subjects
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_subjects_emit_due_refresh();

-- 3.6 Tags meta update (name/color/soft-delete) -> Refresh Assets
-- [P2-Missing] Tags updates should invalidate asset caches too
CREATE OR REPLACE FUNCTION public.rt_trg_tags_emit_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.upsert_realtime_signal(
      NEW.user_id, 'asset', 'global', 'REFRESH',
      jsonb_build_object('reason', 'tag_changed', 'tag_id', NEW.id, 'op', CASE WHEN TG_OP='INSERT' THEN 'UPSERT' ELSE 'UPDATE' END),
      500
    );
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_tags_emit_refresh() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_tags_emit_refresh ON public.tags;
CREATE TRIGGER rt_trg_tags_emit_refresh
AFTER INSERT OR UPDATE ON public.tags
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_tags_emit_refresh();

-- ============================================================
-- 4) DELETE downgrade: cards delete -> REMOVE signal (don’t rely on CDC delete payload)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rt_trg_cards_emit_remove_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN OLD;
  END IF;

  PERFORM public.upsert_realtime_signal(
    OLD.user_id,
    'card',
    OLD.id::text,
    'REMOVE',
    jsonb_build_object('card_id', OLD.id, 'question_id', OLD.question_id),
    0
  );

  PERFORM public.upsert_realtime_signal(
    OLD.user_id,
    'due_list',
    'global',
    'REFRESH',
    jsonb_build_object('reason','card_deleted','card_id',OLD.id),
    0
  );

  RETURN OLD;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_cards_emit_remove_signal() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_cards_emit_remove_signal ON public.cards;
CREATE TRIGGER rt_trg_cards_emit_remove_signal
BEFORE DELETE ON public.cards
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_cards_emit_remove_signal();

-- cards question_id change (fork/migrate) -> due list refresh
CREATE OR REPLACE FUNCTION public.rt_trg_cards_question_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN NEW;
  END IF;

  IF NEW.question_id IS DISTINCT FROM OLD.question_id THEN
    PERFORM public.upsert_realtime_signal(
      NEW.user_id,
      'due_list',
      'global',
      'REFRESH',
      jsonb_build_object(
        'reason','card_question_changed',
        'card_id', NEW.id,
        'from_question_id', OLD.question_id,
        'to_question_id', NEW.question_id
      ),
      0
    );
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_cards_question_changed() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_cards_question_changed ON public.cards;
CREATE TRIGGER rt_trg_cards_question_changed
AFTER UPDATE OF question_id ON public.cards
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_cards_question_changed();

-- ============================================================
-- 4.5 Fork Drift Notification (Public Question Updated -> Notify Forks)
-- ============================================================

CREATE OR REPLACE FUNCTION public.rt_trg_error_questions_notify_forks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.rt_is_suppress_allowed() THEN
    RETURN NEW;
  END IF;

  -- Only relevant for Public Questions (user_id IS NULL)
  -- And only when content hash changes (requires Schema V5.9)
  -- Note: We assume content_hash exists. safe to access NEW.content_hash if schema applied.
  IF (OLD.content_hash IS DISTINCT FROM NEW.content_hash) AND (NEW.user_id IS NULL) THEN
    
    -- Fan-out notification to fork owners
    -- "Your private fork is out of sync with the source"
    -- Limit 500 to prevent explosion on popular questions
    PERFORM public.upsert_realtime_signal(
       c.user_id, 
       'question', 
       c.id::text, 
       'REFRESH', 
       jsonb_build_object('reason','source_updated', 'source_id', NEW.id),
       3000 -- [Optimized] 3s throttle for massive fan-out protection
    )
    FROM public.error_questions c
    WHERE c.forked_from = NEW.id
    LIMIT 500;
    
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.rt_trg_error_questions_notify_forks() FROM PUBLIC, authenticated;

DROP TRIGGER IF EXISTS rt_trg_error_questions_notify_forks ON public.error_questions;
CREATE TRIGGER rt_trg_error_questions_notify_forks
AFTER UPDATE OF content_hash ON public.error_questions
FOR EACH ROW
EXECUTE FUNCTION public.rt_trg_error_questions_notify_forks();

-- ============================================================
-- 5) Publication wiring (ONLY realtime tables / pulses)
-- ============================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.realtime_signals;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cards_sync_pulse;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.import_jobs_pulse;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_dashboard_pulse;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- [Optimized] Restrict publication to INSERT/UPDATE only. 
-- Deletes are handled via explicit REMOVE signals to ensure RLS-style leak protection (Doc A/B).
ALTER PUBLICATION supabase_realtime SET (publish = 'insert, update');

-- (optional) if you insist on direct job realtime (not recommended due to error_details/config growth):
-- DO $$ BEGIN
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.import_jobs;
-- EXCEPTION WHEN duplicate_object THEN NULL;
-- END $$;

-- ============================================================
-- 6) Maintenance & Cleanup (P1-Maintenance)
-- ============================================================

-- helper: periodic cleanup for signal hub (avoid long-term bloat)
CREATE OR REPLACE FUNCTION public.purge_realtime_signals(p_days_threshold INTEGER DEFAULT 7)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER 
SET search_path = pg_catalog, public
AS $$
DECLARE v_count INTEGER;
BEGIN
  DELETE FROM public.realtime_signals WHERE updated_at < now() - (p_days_threshold || ' days')::interval;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.purge_realtime_signals(INTEGER) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_realtime_signals(INTEGER) TO service_role;

-- 7) Publication wiring (ONLY realtime tables / pulses)
-- ============================================================

DO $$ 
DECLARE 
  t text;
  tables text[] := ARRAY[
    'realtime_signals', 'cards_sync_pulse', 
    'import_jobs_pulse', 'user_dashboard_pulse'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    -- 允许已登录用户读取自己的实时信号和 Pulse
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- ============================================================
-- End Realtime Layer V1.2 (Hardened & Accurate)
-- ============================================================
