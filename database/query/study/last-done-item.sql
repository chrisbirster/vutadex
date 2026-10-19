SELECT card_id, review_event_id
FROM study_session_items
WHERE session_id = ? AND status = 'done' AND review_event_id IS NOT NULL
ORDER BY review_event_id DESC
LIMIT 1
