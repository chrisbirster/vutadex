INSERT INTO review_events
  (card_id, event_type, rating, occurred_at, before_json, after_json, elapsed_days, retrievability_before, scheduler_version)
VALUES (?, 'review', ?, ?, ?, ?, ?, ?, ?)
