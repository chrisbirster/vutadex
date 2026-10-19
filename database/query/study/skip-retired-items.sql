UPDATE study_session_items SET status = 'skipped'
WHERE session_id = ? AND status = 'pending'
  AND card_id IN (SELECT card_id FROM generated_cards WHERE retired = 1)
