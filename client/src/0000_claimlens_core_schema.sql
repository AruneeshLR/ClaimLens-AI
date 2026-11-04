
-- ===== Enums =====
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.claim_status AS ENUM ('draft','submitted','under_ai_analysis','under_human_review','evidence_required','approved','rejected');

-- ===== Profiles =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '' CHECK (char_length(full_name) <= 120),
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 30),
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===== Roles =====
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Own roles readable" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Profiles: own or admin read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Profiles: own update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ===== Claims =====
CREATE TABLE public.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number text NOT NULL UNIQUE DEFAULT ('CL-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  status public.claim_status NOT NULL DEFAULT 'draft',
  claimant_name text NOT NULL CHECK (char_length(claimant_name) BETWEEN 2 AND 120),
  policy_number text NOT NULL CHECK (char_length(policy_number) BETWEEN 3 AND 60),
  vehicle_registration text NOT NULL CHECK (char_length(vehicle_registration) BETWEEN 2 AND 30),
  accident_at timestamptz NOT NULL,
  accident_location text NOT NULL CHECK (char_length(accident_location) BETWEEN 2 AND 300),
  accident_type text NOT NULL CHECK (char_length(accident_type) BETWEEN 2 AND 60),
  accident_description text NOT NULL CHECK (char_length(accident_description) BETWEEN 10 AND 4000),
  damage_description text NOT NULL CHECK (char_length(damage_description) BETWEEN 5 AND 4000),
  claimed_amount numeric(14,2) CHECK (claimed_amount IS NULL OR claimed_amount >= 0),
  approved_amount numeric(14,2),
  decision_remarks text,
  evidence_request text,
  ai_status text NOT NULL DEFAULT 'not_started' CHECK (ai_status IN ('not_started','running','completed','failed')),
  ai_error text,
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX claims_user_idx ON public.claims(user_id, created_at DESC);
CREATE INDEX claims_status_idx ON public.claims(status);
GRANT SELECT, DELETE ON public.claims TO authenticated;
GRANT INSERT (claimant_name, policy_number, vehicle_registration, accident_at, accident_location, accident_type, accident_description, damage_description, claimed_amount) ON public.claims TO authenticated;
GRANT UPDATE (claimant_name, policy_number, vehicle_registration, accident_at, accident_location, accident_type, accident_description, damage_description, claimed_amount) ON public.claims TO authenticated;
GRANT ALL ON public.claims TO service_role;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Claims: owner or admin read" ON public.claims FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Claims: owner creates draft" ON public.claims FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'draft');
CREATE POLICY "Claims: owner edits draft" ON public.claims FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'draft') WITH CHECK (user_id = auth.uid() AND status = 'draft');
CREATE POLICY "Claims: owner deletes draft" ON public.claims FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'draft');

-- ===== Evidence =====
CREATE TABLE public.evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('photo','policy_document','repair_estimate','supporting_document')),
  angle text CHECK (angle IS NULL OR angle IN ('front','rear','left','right','closeup','other')),
  storage_path text NOT NULL UNIQUE,
  file_name text CHECK (file_name IS NULL OR char_length(file_name) <= 200),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  damage_description text CHECK (damage_description IS NULL OR char_length(damage_description) <= 2000),
  damaged_part text CHECK (damaged_part IS NULL OR char_length(damaged_part) <= 120),
  incident_date date,
  incident_location text CHECK (incident_location IS NULL OR char_length(incident_location) <= 300),
  additional_explanation text CHECK (additional_explanation IS NULL OR char_length(additional_explanation) <= 2000),
  captured_live boolean NOT NULL DEFAULT false,
  is_additional boolean NOT NULL DEFAULT false,
  quality_status text NOT NULL DEFAULT 'pending' CHECK (quality_status IN ('pending','verified','failed','retake_required')),
  quality_report jsonb,
  consistency_status text NOT NULL DEFAULT 'pending' CHECK (consistency_status IN ('pending','consistent','uncertain','mismatch')),
  consistency_report jsonb,
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_claim_idx ON public.evidence(claim_id);
CREATE INDEX evidence_sha_idx ON public.evidence(sha256);
GRANT SELECT, DELETE ON public.evidence TO authenticated;
GRANT INSERT (claim_id, kind, angle, storage_path, file_name, mime_type, size_bytes, damage_description, damaged_part, incident_date, incident_location, additional_explanation, captured_live) ON public.evidence TO authenticated;
GRANT UPDATE (damage_description, damaged_part, incident_date, incident_location, additional_explanation) ON public.evidence TO authenticated;
GRANT ALL ON public.evidence TO service_role;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_editable_claim(_claim_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.claims WHERE id = _claim_id AND user_id = auth.uid() AND status IN ('draft','evidence_required'))
$$;

CREATE POLICY "Evidence: owner or admin read" ON public.evidence FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Evidence: owner adds to editable claim" ON public.evidence FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.owns_editable_claim(claim_id)
    AND storage_path LIKE (auth.uid()::text || '/' || claim_id::text || '/%'));
CREATE POLICY "Evidence: owner edits on editable claim" ON public.evidence FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.owns_editable_claim(claim_id))
  WITH CHECK (user_id = auth.uid() AND public.owns_editable_claim(claim_id));
CREATE POLICY "Evidence: owner removes on editable claim" ON public.evidence FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.owns_editable_claim(claim_id)
    AND (is_additional OR (SELECT status FROM public.claims c WHERE c.id = claim_id) = 'draft'));

-- ===== AI reports (admin only) =====
CREATE TABLE public.ai_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  report jsonb NOT NULL,
  system_checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text NOT NULL,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_reports_claim_idx ON public.ai_reports(claim_id, created_at DESC);
GRANT SELECT ON public.ai_reports TO authenticated;
GRANT ALL ON public.ai_reports TO service_role;
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "AI reports: admin read" ON public.ai_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ===== Admin decisions =====
CREATE TABLE public.admin_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected','evidence_requested')),
  remarks text,
  reason text,
  approved_amount numeric(14,2),
  requested_items text,
  ai_overridden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_decisions_claim_idx ON public.admin_decisions(claim_id, created_at DESC);
GRANT SELECT ON public.admin_decisions TO authenticated;
GRANT ALL ON public.admin_decisions TO service_role;
ALTER TABLE public.admin_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Decisions: admin or claim owner read" ON public.admin_decisions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_id AND c.user_id = auth.uid()));

-- ===== Confidential admin notes =====
CREATE TABLE public.admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL DEFAULT auth.uid(),
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_notes TO authenticated;
GRANT INSERT (claim_id, note) ON public.admin_notes TO authenticated;
GRANT ALL ON public.admin_notes TO service_role;
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notes: admin read" ON public.admin_notes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Notes: admin write" ON public.admin_notes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND admin_id = auth.uid());

-- ===== Notifications =====
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  claim_id uuid REFERENCES public.claims(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notifications: own read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Notifications: own mark read" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ===== Audit logs =====
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  claim_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_claim_idx ON public.audit_logs(claim_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON public.audit_logs(actor_id, action, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit: admin read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ===== Helpers & triggers =====
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER claims_touch BEFORE UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER evidence_touch BEFORE UPDATE ON public.evidence FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- New user: profile + default role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, email)
  VALUES (
    NEW.id,
    left(coalesce(NEW.raw_user_meta_data->>'full_name', ''), 120),
    left(coalesce(NEW.raw_user_meta_data->>'phone', ''), 30),
    coalesce(NEW.email, '')
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Claim validation: accident date not in the future
CREATE OR REPLACE FUNCTION public.validate_claim()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.accident_at > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'Accident date cannot be in the future';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER claims_validate BEFORE INSERT OR UPDATE OF accident_at ON public.claims FOR EACH ROW EXECUTE FUNCTION public.validate_claim();

-- Status state machine
CREATE OR REPLACE FUNCTION public.enforce_claim_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status = 'draft' AND NEW.status = 'submitted') OR
    (OLD.status = 'submitted' AND NEW.status IN ('under_ai_analysis','under_human_review','approved','rejected','evidence_required')) OR
    (OLD.status = 'under_ai_analysis' AND NEW.status IN ('under_human_review','submitted')) OR
    (OLD.status = 'under_human_review' AND NEW.status IN ('under_ai_analysis','approved','rejected','evidence_required')) OR
    (OLD.status = 'evidence_required' AND NEW.status = 'submitted')
  ) THEN
    RAISE EXCEPTION 'Invalid claim status change from % to %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER claims_transition BEFORE UPDATE OF status ON public.claims FOR EACH ROW EXECUTE FUNCTION public.enforce_claim_transition();

-- Notifications + audit on status change
CREATE OR REPLACE FUNCTION public.on_claim_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, claim_id, action, details)
    VALUES (auth.uid(), NEW.id, 'claim_created', jsonb_build_object('claim_number', NEW.claim_number));
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  INSERT INTO public.audit_logs (actor_id, claim_id, action, details)
  VALUES (auth.uid(), NEW.id, 'status_changed', jsonb_build_object('from', OLD.status, 'to', NEW.status));

  IF NEW.status = 'submitted' AND OLD.status = 'draft' THEN
    INSERT INTO public.notifications (user_id, claim_id, type, title, body)
    VALUES (NEW.user_id, NEW.id, 'submitted', 'Claim submitted', 'Your claim ' || NEW.claim_number || ' was submitted successfully.');
  ELSIF NEW.status = 'submitted' AND OLD.status = 'evidence_required' THEN
    INSERT INTO public.notifications (user_id, claim_id, type, title, body)
    VALUES (NEW.user_id, NEW.id, 'resubmitted', 'Additional evidence received', 'Thanks — your new evidence for ' || NEW.claim_number || ' will be reviewed.');
  ELSIF NEW.status = 'under_ai_analysis' THEN
    INSERT INTO public.notifications (user_id, claim_id, type, title, body)
    VALUES (NEW.user_id, NEW.id, 'ai_started', 'AI analysis started', 'Your evidence for ' || NEW.claim_number || ' is being analysed.');
  ELSIF NEW.status = 'under_human_review' THEN
    INSERT INTO public.notifications (user_id, claim_id, type, title, body) VALUES
      (NEW.user_id, NEW.id, 'ai_completed', 'AI analysis completed', 'Automated analysis of ' || NEW.claim_number || ' is complete.'),
      (NEW.user_id, NEW.id, 'human_review', 'Human review has begun', 'An investigator is now reviewing ' || NEW.claim_number || '. Final decisions are always made by a person.');
  ELSIF NEW.status = 'evidence_required' THEN
    INSERT INTO public.notifications (user_id, claim_id, type, title, body)
    VALUES (NEW.user_id, NEW.id, 'evidence_requested', 'Additional evidence required', coalesce(NEW.evidence_request, 'Please upload the requested evidence for ' || NEW.claim_number || '.'));
  ELSIF NEW.status = 'approved' THEN
    INSERT INTO public.notifications (user_id, claim_id, type, title, body)
    VALUES (NEW.user_id, NEW.id, 'approved', 'Claim approved', 'Your claim ' || NEW.claim_number || ' was approved' ||
      CASE WHEN NEW.approved_amount IS NOT NULL THEN ' for ' || to_char(NEW.approved_amount, 'FM999,999,999,990.00') ELSE '' END || '.');
  ELSIF NEW.status = 'rejected' THEN
    INSERT INTO public.notifications (user_id, claim_id, type, title, body)
    VALUES (NEW.user_id, NEW.id, 'rejected', 'Claim rejected', 'Your claim ' || NEW.claim_number || ' was not approved. Open the claim to read the reason.');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER claims_status_events AFTER INSERT OR UPDATE OF status ON public.claims FOR EACH ROW EXECUTE FUNCTION public.on_claim_status_change();

-- Evidence: mark additional, reset consistency on description edits, audit
CREATE OR REPLACE FUNCTION public.evidence_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.is_additional := EXISTS (SELECT 1 FROM public.claims WHERE id = NEW.claim_id AND status = 'evidence_required');
    IF NEW.kind <> 'photo' THEN
      NEW.quality_status := 'verified';
      NEW.consistency_status := 'consistent';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.kind = 'photo' AND (
      NEW.damage_description IS DISTINCT FROM OLD.damage_description OR
      NEW.damaged_part IS DISTINCT FROM OLD.damaged_part OR
      NEW.additional_explanation IS DISTINCT FROM OLD.additional_explanation) THEN
      NEW.consistency_status := 'pending';
      NEW.consistency_report := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evidence_before BEFORE INSERT OR UPDATE ON public.evidence FOR EACH ROW EXECUTE FUNCTION public.evidence_before_write();

CREATE OR REPLACE FUNCTION public.evidence_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, claim_id, action, details)
    VALUES (auth.uid(), NEW.claim_id, 'evidence_uploaded', jsonb_build_object('evidence_id', NEW.id, 'kind', NEW.kind, 'angle', NEW.angle, 'additional', NEW.is_additional));
    RETURN NEW;
  ELSE
    INSERT INTO public.audit_logs (actor_id, claim_id, action, details)
    VALUES (auth.uid(), OLD.claim_id, 'evidence_removed', jsonb_build_object('evidence_id', OLD.id, 'kind', OLD.kind));
    RETURN OLD;
  END IF;
END $$;
CREATE TRIGGER evidence_audit_trg AFTER INSERT OR DELETE ON public.evidence FOR EACH ROW EXECUTE FUNCTION public.evidence_audit();

CREATE OR REPLACE FUNCTION public.admin_note_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, claim_id, action, details)
  VALUES (auth.uid(), NEW.claim_id, 'admin_note_added', jsonb_build_object('note_id', NEW.id));
  RETURN NEW;
END $$;
CREATE TRIGGER admin_notes_audit AFTER INSERT ON public.admin_notes FOR EACH ROW EXECUTE FUNCTION public.admin_note_audit();

-- ===== RPC: submit claim =====
CREATE OR REPLACE FUNCTION public.submit_claim(_claim_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.claims%ROWTYPE;
  missing text[];
  a text;
BEGIN
  SELECT * INTO c FROM public.claims WHERE id = _claim_id FOR UPDATE;
  IF NOT FOUND OR c.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF c.status = 'draft' THEN
    FOREACH a IN ARRAY ARRAY['front','rear','left','right','closeup'] LOOP
      IF NOT EXISTS (SELECT 1 FROM public.evidence e WHERE e.claim_id = _claim_id AND e.kind = 'photo' AND e.angle = a
                     AND e.quality_status = 'verified' AND e.consistency_status <> 'pending') THEN
        missing := array_append(missing, a);
      END IF;
    END LOOP;
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'Verified photographs still needed for: %', array_to_string(missing, ', ');
    END IF;
    IF EXISTS (SELECT 1 FROM public.evidence e WHERE e.claim_id = _claim_id AND e.kind = 'photo'
               AND (e.quality_status <> 'verified' OR e.consistency_status = 'pending')) THEN
      RAISE EXCEPTION 'Remove or finish verifying every photograph before submitting';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.evidence e WHERE e.claim_id = _claim_id AND e.kind = 'policy_document') THEN
      RAISE EXCEPTION 'Please upload your insurance policy document';
    END IF;
    UPDATE public.claims SET status = 'submitted', submitted_at = now(), ai_status = 'not_started', ai_error = NULL WHERE id = _claim_id;
  ELSIF c.status = 'evidence_required' THEN
    IF NOT EXISTS (SELECT 1 FROM public.evidence e WHERE e.claim_id = _claim_id AND e.is_additional
                   AND (e.kind <> 'photo' OR (e.quality_status = 'verified' AND e.consistency_status <> 'pending'))) THEN
      RAISE EXCEPTION 'Upload at least one piece of the requested evidence first';
    END IF;
    IF EXISTS (SELECT 1 FROM public.evidence e WHERE e.claim_id = _claim_id AND e.is_additional AND e.kind = 'photo'
               AND (e.quality_status <> 'verified' OR e.consistency_status = 'pending')) THEN
      RAISE EXCEPTION 'Remove or finish verifying every new photograph before sending';
    END IF;
    UPDATE public.claims SET status = 'submitted', ai_status = 'not_started', ai_error = NULL WHERE id = _claim_id;
  ELSE
    RAISE EXCEPTION 'This claim cannot be submitted in its current state';
  END IF;
  RETURN c.claim_number;
END $$;

-- ===== RPC: admin decision =====
CREATE OR REPLACE FUNCTION public.admin_decide(
  _claim_id uuid, _decision text, _remarks text, _amount numeric, _reason text, _requested_items text, _ai_overridden boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.claims%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can make claim decisions';
  END IF;
  SELECT * INTO c FROM public.claims WHERE id = _claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF c.status NOT IN ('submitted','under_human_review') THEN
    RAISE EXCEPTION 'A decision cannot be made while the claim is %', c.status;
  END IF;

  IF _decision = 'approved' THEN
    IF _amount IS NULL OR _amount < 0 THEN RAISE EXCEPTION 'Approved settlement amount is required'; END IF;
    IF coalesce(btrim(_remarks), '') = '' THEN RAISE EXCEPTION 'Approval remarks are required'; END IF;
    UPDATE public.claims SET approved_amount = _amount, decision_remarks = left(_remarks, 4000), decided_at = now(), status = 'approved' WHERE id = _claim_id;
  ELSIF _decision = 'rejected' THEN
    IF coalesce(btrim(_reason), '') = '' THEN RAISE EXCEPTION 'A rejection reason is mandatory'; END IF;
    UPDATE public.claims SET decision_remarks = left(_reason, 4000), approved_amount = NULL, decided_at = now(), status = 'rejected' WHERE id = _claim_id;
  ELSIF _decision = 'evidence_requested' THEN
    IF coalesce(btrim(_requested_items), '') = '' THEN RAISE EXCEPTION 'Describe the evidence you need from the claimant'; END IF;
    UPDATE public.claims SET evidence_request = left(_requested_items, 4000), status = 'evidence_required' WHERE id = _claim_id;
  ELSE
    RAISE EXCEPTION 'Unknown decision';
  END IF;

  INSERT INTO public.admin_decisions (claim_id, admin_id, decision, remarks, reason, approved_amount, requested_items, ai_overridden)
  VALUES (_claim_id, auth.uid(), _decision, left(_remarks, 4000), left(_reason, 4000),
          CASE WHEN _decision = 'approved' THEN _amount END, left(_requested_items, 4000), coalesce(_ai_overridden, false));

  INSERT INTO public.audit_logs (actor_id, claim_id, action, details)
  VALUES (auth.uid(), _claim_id, 'admin_decision', jsonb_build_object('decision', _decision, 'amount', _amount, 'ai_overridden', coalesce(_ai_overridden, false)));
END $$;

REVOKE EXECUTE ON FUNCTION public.submit_claim(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_decide(uuid, text, text, numeric, text, text, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide(uuid, text, text, numeric, text, text, boolean) TO authenticated;

-- ===== Realtime =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.claims;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
