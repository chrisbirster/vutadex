SELECT c.id AS cardId, c.deck_id AS deckId, c.front, c.back, i.kind, i.position
FROM study_session_items i
JOIN cards c ON c.id = i.card_id
LEFT JOIN generated_cards g ON g.card_id = c.id
WHERE i.session_id = ? AND i.status = 'pending' AND (g.card_id IS NULL OR g.retired = 0)
ORDER BY i.position
LIMIT 1
