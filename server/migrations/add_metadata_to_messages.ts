
import { sql } from 'drizzle-orm';
import { db } from '../db';

export async function addMetadataToMessages() {
  await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata text`;
}

addMetadataToMessages().catch(console.error);
