SELECT c.front, c.back FROM cards AS c LEFT JOIN generated_cards AS g ON g.card_id = c.id WHERE c.deck_id = ? AND g.card_id IS NULL ORDER BY c.id;
