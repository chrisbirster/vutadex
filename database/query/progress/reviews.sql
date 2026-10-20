SELECT e.rating, e.occurred_at
FROM review_events e
JOIN cards c ON c.id = e.card_id
LEFT JOIN generated_cards g ON g.card_id = c.id
WHERE e.event_type = 'review'
  AND NOT EXISTS (SELECT 1 FROM review_events u WHERE u.undone_review_id = e.id)
  AND (g.card_id IS NULL OR g.retired = 0)
  AND (? IS NULL OR c.deck_id = ?)
  AND e.occurred_at >= ? AND e.occurred_at <= ?
ORDER BY e.id
