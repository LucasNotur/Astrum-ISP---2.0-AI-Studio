-- IA-40: PII entities column on voice_transcripts.
ALTER TABLE voice_transcripts ADD COLUMN IF NOT EXISTS pii_entities JSONB;
