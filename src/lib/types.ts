export interface Email {
  id: string;
  message_id: string | null;
  thread_id: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[] | null;
  bcc_addresses: string[] | null;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
  direction: 'inbound' | 'outbound';
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  is_trash: boolean;
  in_reply_to: string | null;
  references: string[] | null;
  created_at: string;
}

export interface Attachment {
  id: string;
  email_id: string;
  filename: string | null;
  content_type: string | null;
  size: number | null;
  url: string | null;
  created_at: string;
}
