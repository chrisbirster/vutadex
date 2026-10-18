SELECT
  c.id AS card_id,
  CASE WHEN s.card_id IS NULL THEN 'new' ELSE 'review' END AS kind,
  COALESCE(s.review_count, 0) AS review_count,
  s.last_review_at
FROM cards c
LEFT JOIN card_schedules s ON s.card_id = c.id
LEFT JOIN generated_cards g ON g.card_id = c.id
WHERE (g.card_id IS NULL OR g.retired = 0)
  AND (? IS NULL OR c.deck_id = ?)
  AND (? = 'all'
       OR (? = 'new' AND s.card_id IS NULL)
       OR (? = 'due' AND (s.card_id IS NULL OR s.due_at <= ?)))
ORDER BY CASE WHEN s.card_id IS NULL THEN 1 ELSE 0 END, s.due_at, c.id
