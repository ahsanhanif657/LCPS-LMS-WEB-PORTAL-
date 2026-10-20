CREATE OR REPLACE FUNCTION lcps_keep_last_administrator()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(28191,1);
 IF OLD.role='ADMIN' AND OLD.active=1 AND OLD.demo=0
    AND (NEW.role IS DISTINCT FROM 'ADMIN' OR NEW.active IS DISTINCT FROM 1)
    AND NOT EXISTS (SELECT 1 FROM users WHERE id<>OLD.id AND role='ADMIN' AND active=1 AND demo=0) THEN
  RAISE EXCEPTION 'Keep at least one active administrator.';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER keep_last_administrator BEFORE UPDATE OF role,active ON users
FOR EACH ROW EXECUTE FUNCTION lcps_keep_last_administrator();

CREATE OR REPLACE FUNCTION lcps_check_timetable_conflict()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(28191,2);
 IF NEW."endTime"<=NEW."startTime" OR EXISTS (
  SELECT 1 FROM timetable t
  JOIN offerings old_o ON old_o.id=t."offeringId"
  JOIN offerings new_o ON new_o.id=NEW."offeringId"
  WHERE t.id IS DISTINCT FROM NEW.id AND t.day=NEW.day
    AND t."startTime"<NEW."endTime" AND NEW."startTime"<t."endTime"
    AND (lower(trim(t.room))=lower(trim(NEW.room))
      OR old_o."teacherId"=new_o."teacherId" OR old_o."batchId"=new_o."batchId")
 ) THEN
  RAISE EXCEPTION 'Timetable conflict. Refresh and choose another slot.';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER timetable_conflict BEFORE INSERT OR UPDATE ON timetable
FOR EACH ROW EXECUTE FUNCTION lcps_check_timetable_conflict();

CREATE OR REPLACE FUNCTION lcps_check_teacher_reassignment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(28191,2);
 IF NEW."teacherId" IS DISTINCT FROM OLD."teacherId" AND EXISTS (
  SELECT 1 FROM timetable a
  JOIN timetable b ON a.day=b.day AND a."startTime"<b."endTime" AND b."startTime"<a."endTime"
  JOIN offerings other_o ON other_o.id=b."offeringId"
  WHERE a."offeringId"=OLD.id AND b."offeringId"<>OLD.id AND other_o."teacherId"=NEW."teacherId"
 ) THEN
  RAISE EXCEPTION 'Teacher reassignment creates a timetable conflict.';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER teacher_reassignment_conflict BEFORE UPDATE OF "teacherId" ON offerings
FOR EACH ROW EXECUTE FUNCTION lcps_check_teacher_reassignment();

CREATE OR REPLACE FUNCTION lcps_check_result_range()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."maxMarks"<=0 OR NEW.marks<0 OR NEW.marks>NEW."maxMarks" THEN
  RAISE EXCEPTION 'Marks must be within the assessment range.';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER result_range BEFORE INSERT OR UPDATE ON results
FOR EACH ROW EXECUTE FUNCTION lcps_check_result_range();
