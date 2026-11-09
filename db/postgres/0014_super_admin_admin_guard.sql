CREATE OR REPLACE FUNCTION lcps_keep_last_administrator()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(28191,1);
 IF OLD.role IN ('ADMIN','SUPER_ADMIN') AND OLD.active=1 AND OLD.demo=0
    AND (NEW.role NOT IN ('ADMIN','SUPER_ADMIN') OR NEW.active IS DISTINCT FROM 1)
    AND NOT EXISTS (
     SELECT 1 FROM users
     WHERE id<>OLD.id AND role IN ('ADMIN','SUPER_ADMIN') AND active=1 AND demo=0
    ) THEN
  RAISE EXCEPTION 'Keep at least one active administrator.';
 END IF;
 RETURN NEW;
END;
$$;
