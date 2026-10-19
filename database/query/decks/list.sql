SELECT
  d.*,
  (
    SELECT COUNT(*)
    FROM cards c
    LEFT JOIN generated_cards g ON g.card_id = c.id
    WHERE c.deck_id = d.id
      AND (g.card_id IS NULL OR g.retired = 0)
  ) AS card_count
FROM decks d
ORDER BY d.name COLLATE NOCASE, d.id
