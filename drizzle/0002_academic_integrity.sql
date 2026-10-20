CREATE INDEX `attendance_student_lookup` ON `attendance` (`studentId`, `offeringId`, `date`);
--> statement-breakpoint
CREATE INDEX `submission_student_lookup` ON `submissions` (`studentId`);
--> statement-breakpoint
CREATE INDEX `result_student_lookup` ON `results` (`studentId`, `published`);
--> statement-breakpoint
CREATE INDEX `session_expiry_lookup` ON `loginSessions` (`expires`);
--> statement-breakpoint
CREATE INDEX `audit_created_lookup` ON `audit` (`createdAt`);
--> statement-breakpoint
CREATE TRIGGER `keep_last_administrator` BEFORE UPDATE OF role,active ON users
WHEN OLD.role='ADMIN' AND OLD.active=1 AND OLD.demo=0 AND (NEW.role!='ADMIN' OR NEW.active!=1)
AND NOT EXISTS (SELECT 1 FROM users WHERE id!=OLD.id AND role='ADMIN' AND active=1 AND demo=0)
BEGIN SELECT RAISE(ABORT,'Keep at least one active administrator.'); END;
--> statement-breakpoint
CREATE TRIGGER `timetable_insert_conflict` BEFORE INSERT ON timetable
WHEN NEW.endTime<=NEW.startTime OR EXISTS (
 SELECT 1 FROM timetable t JOIN offerings oldO ON oldO.id=t.offeringId JOIN offerings newO ON newO.id=NEW.offeringId
 WHERE t.id!=NEW.id AND t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime
 AND (lower(trim(t.room))=lower(trim(NEW.room)) OR oldO.teacherId=newO.teacherId OR oldO.batchId=newO.batchId))
BEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END;
--> statement-breakpoint
CREATE TRIGGER `timetable_update_conflict` BEFORE UPDATE ON timetable
WHEN NEW.endTime<=NEW.startTime OR EXISTS (
 SELECT 1 FROM timetable t JOIN offerings oldO ON oldO.id=t.offeringId JOIN offerings newO ON newO.id=NEW.offeringId
 WHERE t.id!=NEW.id AND t.day=NEW.day AND t.startTime<NEW.endTime AND NEW.startTime<t.endTime
 AND (lower(trim(t.room))=lower(trim(NEW.room)) OR oldO.teacherId=newO.teacherId OR oldO.batchId=newO.batchId))
BEGIN SELECT RAISE(ABORT,'Timetable conflict. Refresh and choose another slot.'); END;
--> statement-breakpoint
CREATE TRIGGER `teacher_reassignment_conflict` BEFORE UPDATE OF teacherId ON offerings
WHEN NEW.teacherId!=OLD.teacherId AND EXISTS (
 SELECT 1 FROM timetable a JOIN timetable b ON a.day=b.day AND a.startTime<b.endTime AND b.startTime<a.endTime
 JOIN offerings other ON other.id=b.offeringId
 WHERE a.offeringId=OLD.id AND b.offeringId!=OLD.id AND other.teacherId=NEW.teacherId)
BEGIN SELECT RAISE(ABORT,'Teacher reassignment creates a timetable conflict.'); END;
--> statement-breakpoint
CREATE TRIGGER `result_insert_range` BEFORE INSERT ON results WHEN NEW.maxMarks<=0 OR NEW.marks<0 OR NEW.marks>NEW.maxMarks
BEGIN SELECT RAISE(ABORT,'Marks must be within the assessment range.'); END;
--> statement-breakpoint
CREATE TRIGGER `result_update_range` BEFORE UPDATE ON results WHEN NEW.maxMarks<=0 OR NEW.marks<0 OR NEW.marks>NEW.maxMarks
BEGIN SELECT RAISE(ABORT,'Marks must be within the assessment range.'); END;

--> statement-breakpoint
CREATE INDEX `offering_teacher_lookup` ON `offerings` (`teacherId`);
--> statement-breakpoint
CREATE INDEX `batch_department_lookup` ON `batches` (`departmentId`);
