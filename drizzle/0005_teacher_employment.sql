ALTER TABLE users ADD COLUMN employmentType text CHECK (employmentType IS NULL OR employmentType IN ('Visiting','Permanent'));
