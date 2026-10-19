SELECT
  COUNT(*) AS total,
  COALESCE(SUM(status = 'pending'), 0) AS pending,
  COALESCE(SUM(status = 'done'), 0) AS done,
  COALESCE(SUM(status = 'skipped'), 0) AS skipped
FROM study_session_items
WHERE session_id = ?
