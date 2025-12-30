-- Migration: Add folder support to files table
-- Date: 2025-12-30

-- Add new columns
ALTER TABLE files ADD COLUMN IF NOT EXISTS path VARCHAR(1024) DEFAULT '';
ALTER TABLE files ADD COLUMN IF NOT EXISTS parent_path VARCHAR(1024) DEFAULT '';
ALTER TABLE files ADD COLUMN IF NOT EXISTS is_folder BOOLEAN DEFAULT FALSE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS ix_files_path ON files(path);
CREATE INDEX IF NOT EXISTS ix_files_parent_path ON files(parent_path);
CREATE INDEX IF NOT EXISTS ix_files_is_folder ON files(is_folder);

-- Update existing files to have path = name (for backward compatibility)
UPDATE files SET path = name WHERE path = '' OR path IS NULL;

-- Commit changes
COMMIT;
