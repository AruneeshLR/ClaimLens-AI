ALTER TABLE public.evidence DROP CONSTRAINT evidence_kind_check;
ALTER TABLE public.evidence ADD CONSTRAINT evidence_kind_check CHECK (kind IN (
  'photo','policy_document','repair_estimate','supporting_document',
  'rc_book','driving_license','claim_form','pan_card','aadhaar_card','fir_document'));
ALTER TABLE public.evidence DROP CONSTRAINT evidence_angle_check;
ALTER TABLE public.evidence ADD CONSTRAINT evidence_angle_check CHECK (angle IS NULL OR angle IN (
  'front','rear','left','right','closeup','other','opposite_vehicle'));

ALTER TABLE public.claims ADD COLUMN insurance_claim_number text
  CHECK (insurance_claim_number IS NULL OR char_length(insurance_claim_number) BETWEEN 3 AND 60);
ALTER TABLE public.claims ADD COLUMN owner_check_status text NOT NULL DEFAULT 'pending'
  CHECK (owner_check_status IN ('pending','match','mismatch','unreadable'));
ALTER TABLE public.claims ADD COLUMN owner_check_report jsonb;
GRANT INSERT (insurance_claim_number) ON public.claims TO authenticated;
GRANT UPDATE (insurance_claim_number) ON public.claims TO authenticated;

-- Any change to the RC book or insurance files invalidates the previous owner-name check.
CREATE OR REPLACE FUNCTION public.reset_owner_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k text := CASE WHEN TG_OP = 'DELETE' THEN OLD.kind ELSE NEW.kind END;
  cid uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.claim_id ELSE NEW.claim_id END;
BEGIN
  IF k IN ('rc_book','policy_document') THEN
    UPDATE public.claims SET owner_check_status = 'pending', owner_check_report = NULL
    WHERE id = cid AND status IN ('draft','evidence_required');
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.reset_owner_check() FROM anon, public;
CREATE TRIGGER evidence_owner_check_reset AFTER INSERT OR DELETE ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.reset_owner_check();

CREATE OR REPLACE FUNCTION public.submit_claim(_claim_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.claims%ROWTYPE;
  missing text[];
  a text;
  d text;
  doc_labels jsonb := jsonb_build_object(
    'policy_document','insurance policy','rc_book','RC book','driving_license','driving licence',
    'claim_form','claim form','pan_card','PAN card','aadhaar_card','Aadhaar card');
BEGIN
  SELECT * INTO c FROM public.claims WHERE id = _claim_id FOR UPDATE;
  IF NOT FOUND OR c.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF c.status = 'draft' THEN
    IF c.insurance_claim_number IS NULL OR char_length(btrim(c.insurance_claim_number)) < 3 THEN
      RAISE EXCEPTION 'Please enter your insurance claim number';
    END IF;
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
    FOREACH d IN ARRAY ARRAY['policy_document','rc_book','driving_license','claim_form','pan_card','aadhaar_card'] LOOP
      IF NOT EXISTS (SELECT 1 FROM public.evidence e WHERE e.claim_id = _claim_id AND e.kind = d) THEN
        missing := array_append(missing, doc_labels ->> d);
      END IF;
    END LOOP;
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'Please upload: %', array_to_string(missing, ', ');
    END IF;
    IF c.owner_check_status = 'pending' THEN
      RAISE EXCEPTION 'Run the owner name check on your RC book and insurance policy first';
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
REVOKE EXECUTE ON FUNCTION public.submit_claim(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.submit_claim(uuid) TO authenticated;