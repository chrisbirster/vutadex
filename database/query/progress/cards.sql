SELECT c.id, s.due_at, s.review_count
FROM cards c
LEFT JOIN card_schedules s ON s.card_id = c.id
LEFT JOIN generated_cards g ON g.card_id = c.id
WHERE (g.card_id IS NULL OR g.retired = 0)
  AND (? IS NULL OR c.deck_id = ?)
ORDER BY c.id
