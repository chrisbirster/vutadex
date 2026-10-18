INSERT INTO card_schedules
  (card_id, stability, difficulty, fast_stability, last_review_at, due_at, review_count, scheduler_version, target_retention)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(card_id) DO UPDATE SET
  stability = excluded.stability,
  difficulty = excluded.difficulty,
  fast_stability = excluded.fast_stability,
  last_review_at = excluded.last_review_at,
  due_at = excluded.due_at,
  review_count = excluded.review_count,
  scheduler_version = excluded.scheduler_version,
  target_retention = excluded.target_retention
