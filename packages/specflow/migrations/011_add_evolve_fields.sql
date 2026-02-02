-- Add evolving support columns to features table
ALTER TABLE features ADD COLUMN evolved_at TEXT;
ALTER TABLE features ADD COLUMN baseline_path TEXT;
