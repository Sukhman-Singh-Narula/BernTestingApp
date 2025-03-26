
import { db } from '../db';

async function dropCriteriaColumn() {
  try {
    await db.execute('ALTER TABLE evaluators DROP COLUMN criteria;');
    console.log('Successfully dropped criteria column');
  } catch (error) {
    console.error('Error dropping criteria column:', error);
  } finally {
    process.exit();
  }
}

dropCriteriaColumn();
