import { pool, db } from "../db";

async function migrationAddChoiceLayer() {
  try {
    console.log("Starting migration: Adding choice layer prompts table and updating conversations");
    
    // Add choice_layer_prompts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS choice_layer_prompts (
        id SERIAL PRIMARY KEY,
        system_prompt TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by TEXT NOT NULL
      );
    `);
    
    console.log("Choice layer prompts table created successfully");
    
    // Add choice_layer_prompt_id and previous_activity_id columns to conversations table
    await pool.query(`
      ALTER TABLE conversations 
      ADD COLUMN IF NOT EXISTS choice_layer_prompt_id INTEGER REFERENCES choice_layer_prompts(id),
      ADD COLUMN IF NOT EXISTS previous_activity_id INTEGER REFERENCES activities(id)
    `);
    
    console.log("Columns added to conversations table successfully");
    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

// Execute the migration
migrationAddChoiceLayer();