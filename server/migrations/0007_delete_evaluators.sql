
-- First remove any conversation evaluator assignments
DELETE FROM conversation_evaluators 
WHERE evaluator_id != 1;

-- Then delete the evaluators
DELETE FROM evaluators 
WHERE id != 1;
