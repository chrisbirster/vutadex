SELECT n.*, g.generation_key
FROM notes n
JOIN generated_cards g ON g.note_id = n.id
WHERE g.card_id = ? AND g.retired = 0 AND n.retired = 0
