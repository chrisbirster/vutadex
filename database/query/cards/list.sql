SELECT c.id, c.deck_id, c.front, c.back, c.created_at
FROM cards c
LEFT JOIN generated_cards g ON g.card_id = c.id
WHERE c.deck_id = ?
  AND (g.card_id IS NULL OR g.retired = 0)
  AND (? IS NULL
       OR instr(lower(c.front), lower(?)) > 0
       OR instr(lower(c.back), lower(?)) > 0)
ORDER BY c.id
