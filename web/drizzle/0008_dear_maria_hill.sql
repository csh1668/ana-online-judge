ALTER TABLE "submissions" ADD COLUMN "code_length" integer;
UPDATE submissions SET code_length = length(code) WHERE code IS NOT NULL AND code_length IS NULL;