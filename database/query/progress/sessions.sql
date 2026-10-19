SELECT COUNT(*) AS completed
FROM study_sessions
WHERE status = 'completed'
  AND (? IS NULL OR deck_id = ?)
