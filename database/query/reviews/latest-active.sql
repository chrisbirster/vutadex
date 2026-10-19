SELECT r.*
FROM review_events r
WHERE r.card_id = ? AND r.event_type = 'review'
  AND NOT EXISTS (SELECT 1 FROM review_events u WHERE u.undone_review_id = r.id)
ORDER BY r.id DESC
LIMIT 1
