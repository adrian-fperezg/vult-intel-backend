-- Backfill Unified Inbox from existing replies
INSERT INTO outreach_inbox_messages 
(id, contact_id, project_id, sequence_id, thread_id, message_id, from_email, to_email, subject, body_text, body_html, received_at, is_read, mailbox_id)
SELECT 
  gen_random_uuid(), 
  contact_id, 
  project_id, 
  sequence_id, 
  thread_id, 
  message_id, 
  from_email, 
  to_email, 
  subject, 
  body, 
  body_html, 
  COALESCE(sent_at, created_at), 
  TRUE, 
  mailbox_id
FROM outreach_individual_emails
WHERE is_reply = True
ON CONFLICT (message_id) DO NOTHING;

-- Mark all contacted leads as read for history
UPDATE outreach_contacts SET is_read = TRUE WHERE id IN (SELECT contact_id FROM outreach_individual_emails WHERE is_reply = True);
