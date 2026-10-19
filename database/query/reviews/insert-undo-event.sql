INSERT INTO review_events
  (card_id, event_type, rating, occurred_at, before_json, after_json, undone_review_id, scheduler_version)
VALUES (?, 'undo', NULL, ?, ?, ?, ?, ?)
