
import { pool, db } from "../db";

async function migrateLanguageColumn() {
  try {
    console.log("Starting migration: Adding language column to activities table");
    
    // Add language column if it doesn't exist
    await pool.query(`
      ALTER TABLE activities 
      ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'Spanish'
    `);
    
    console.log("Column added successfully");
    
    // Update all existing records to have 'Spanish' as the language
    await pool.query(`
      UPDATE activities 
      SET language = 'Spanish' 
      WHERE language IS NULL OR language = ''
    `);
    
    console.log("Existing records updated to Spanish");
    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await pool.end();
  }
}

// Execute the migration
migrateLanguageColumn();
