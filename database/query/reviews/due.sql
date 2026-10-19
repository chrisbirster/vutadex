SELECT c.id, c.deck_id, c.front, s.due_at, COALESCE(s.review_count, 0) AS review_count
FROM cards c
LEFT JOIN card_schedules s ON s.card_id = c.id
LEFT JOIN generated_cards g ON g.card_id = c.id
WHERE (g.card_id IS NULL OR g.retired = 0)
  AND (s.due_at IS NULL OR s.due_at <= ?)
  AND (? IS NULL OR c.deck_id = ?)
ORDER BY COALESCE(s.due_at, ''), c.id
