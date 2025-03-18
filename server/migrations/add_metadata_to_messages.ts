
import { pool } from '../db';

async function addMetadataToMessages() {
  try {
    console.log("Starting migration: Adding metadata column to messages table");
    
    await pool.query(`
      ALTER TABLE messages 
      ADD COLUMN IF NOT EXISTS metadata TEXT
    `);
    
    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await pool.end();
  }
}

addMetadataToMessages();
