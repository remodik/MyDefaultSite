"""
Database migration script to add folder support
Run this script to migrate existing database to support folders
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database import engine


async def migrate():
    """Apply database migration"""
    print("Starting database migration...")

    migration_sql = """
    -- Add new columns
    ALTER TABLE files ADD COLUMN IF NOT EXISTS path VARCHAR(1024) DEFAULT '';
    ALTER TABLE files ADD COLUMN IF NOT EXISTS parent_path VARCHAR(1024) DEFAULT '';
    ALTER TABLE files ADD COLUMN IF NOT EXISTS is_folder BOOLEAN DEFAULT FALSE;

    -- Create indexes for better performance
    CREATE INDEX IF NOT EXISTS ix_files_path ON files(path);
    CREATE INDEX IF NOT EXISTS ix_files_parent_path ON files(parent_path);
    CREATE INDEX IF NOT EXISTS ix_files_is_folder ON files(is_folder);
    """

    try:
        async with engine.begin() as conn:
            # Execute migration
            await conn.execute(text(migration_sql))

            # Update existing files to have path = name
            result = await conn.execute(
                text("UPDATE files SET path = name WHERE path = '' OR path IS NULL")
            )

            print(f"✓ Migration completed successfully!")
            print(f"✓ Updated {result.rowcount} existing files")

    except Exception as e:
        print(f"✗ Migration failed: {e}")
        raise
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
