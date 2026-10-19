SELECT card_id AS cardId, generation_key AS key, retired
FROM generated_cards
WHERE note_id = ?
ORDER BY generation_key
