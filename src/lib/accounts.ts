import { Resend } from 'resend';

export interface Account {
  id: string;
  email: string;
  senderName: string;
  displayName: string;
  domain: string;
  // More domains in the same Resend account that land in this inbox. A reply goes
  // out from the domain the customer wrote to (user, 2026-09-29).
  aliasDomains?: string[];
  resendApiKey: string;
}

export function getAccounts(): Account[] {
  return [
    {
      id: 'shiboriclass',
      email: 'hello@shiboriclass.com',
      senderName: 'Aiko Mori - Shibori',
      displayName: 'Aiko Mori - Shibori',
      domain: 'shiboriclass.com',
      resendApiKey: process.env.RESEND_API_KEY_SHIBORICLASS!,
    },
    {
      id: 'sumieclass',
      email: 'hello@sumieclass.com',
      senderName: 'Aiko Mori - Sumie',
      displayName: 'Aiko Mori - Sumie',
      domain: 'sumieclass.com',
      resendApiKey: process.env.RESEND_API_KEY_SUMIECLASS!,
    },
    {
      id: 'suminagashiclass',
      email: 'hello@suminagashiclass.com',
      senderName: 'Aiko Mori - Suminagashi',
      displayName: 'Aiko Mori - Suminagashi',
      domain: 'suminagashiclass.com',
      resendApiKey: process.env.RESEND_API_KEY_SUMINAGASHICLASS!,
    },
    {
      id: 'mandalapractice',
      email: 'hello@mandalapractice.com',
      senderName: 'Aiko Mori',
      displayName: 'Mandala - Aiko Mori',
      domain: 'mandalapractice.com',
      resendApiKey: process.env.RESEND_API_KEY_MANDALAPRACTICE!,
    },
    {
      id: 'watercolorfashion',
      email: 'hello@watercolorfashion.com',
      senderName: 'Aiko Mori',
      displayName: 'Aiko Mori - Watercolor Fashion',
      domain: 'watercolorfashion.com',
      resendApiKey: process.env.RESEND_API_KEY_WATERCOLORFASHION!,
    },
    {
      id: 'visualnotesclass',
      email: 'hello@visualnotesclass.com',
      senderName: 'Aiko Mori',
      displayName: 'Aiko Mori - Visual Notes',
      domain: 'visualnotesclass.com',
      // The course site moved to drawyournotes.com (2026-09-29), same Resend account.
      aliasDomains: ['drawyournotes.com'],
      resendApiKey: process.env.RESEND_API_KEY_VISUALNOTESCLASS!,
    },
    {
      id: 'paletteknifeclass',
      email: 'hello@paletteknifeclass.com',
      senderName: 'Aiko Mori',
      displayName: 'Palette Knife - Aiko Mori',
      domain: 'paletteknifeclass.com',
      resendApiKey: process.env.RESEND_API_KEY_PALETTEKNIFECLASS!,
    },
    {
      id: 'japanesedoodleclass',
      email: 'hello@japanesedoodleclass.com',
      senderName: 'Aiko Mori',
      displayName: 'Aiko Mori - Japanese Doodling',
      domain: 'japanesedoodleclass.com',
      resendApiKey: process.env.RESEND_API_KEY_JAPANESEDOODLECLASS!,
    },
    {
      id: 'inkcatclass',
      email: 'hello@inkcatclass.com',
      senderName: 'Aiko Mori',
      displayName: 'Aiko Mori - Ink Cats',
      domain: 'inkcatclass.com',
      resendApiKey: process.env.RESEND_API_KEY_INKCATCLASS!,
    },
    {
      id: 'tiledoodling',
      email: 'hello@tiledoodling.com',
      senderName: 'Aiko Mori',
      displayName: 'Aiko Mori - Tile Doodling',
      domain: 'tiledoodling.com',
      resendApiKey: process.env.RESEND_API_KEY_TILEDOODLING!,
    },
    {
      id: 'chineseinkclass',
      email: 'hello@chineseinkclass.com',
      senderName: 'Aiko Mori',
      displayName: 'Chinese Ink - Aiko Mori',
      domain: 'chineseinkclass.com',
      resendApiKey: process.env.RESEND_API_KEY_CHINESEINKCLASS!,
    },
    {
      id: 'acryliccatclass',
      email: 'hello@acryliccatclass.com',
      senderName: 'Aiko Mori',
      displayName: 'Acrylic Cats - Aiko Mori',
      domain: 'acryliccatclass.com',
      resendApiKey: process.env.RESEND_API_KEY_ACRYLICCATCLASS!,
    },
    {
      id: 'bibledoodlingclass',
      email: 'hello@bibledoodlingclass.com',
      senderName: 'Grace Bennett',
      displayName: 'Grace Bennett - Bible Doodling',
      domain: 'bibledoodlingclass.com',
      resendApiKey: process.env.RESEND_API_KEY_BIBLEDOODLINGCLASS!,
    },
    {
      id: 'whimsicalscenesclass',
      email: 'hello@whimsicalscenesclass.com',
      senderName: 'Aiko Mori',
      displayName: 'Aiko Mori - Whimsical Scenes',
      domain: 'whimsicalscenesclass.com',
      resendApiKey: process.env.RESEND_API_KEY_WHIMSICALSCENESCLASS!,
    },
    {
      id: 'inkdogclass',
      email: 'hello@inkdogclass.com',
      senderName: 'Aiko Mori',
      displayName: 'Aiko Mori - Ink Dogs',
      domain: 'inkdogclass.com',
      resendApiKey: process.env.RESEND_API_KEY_INKDOGCLASS!,
    },
    {
      id: 'simplesketchesclass',
      email: 'hello@simplesketchesclass.com',
      senderName: 'Aiko Mori',
      displayName: 'Simple Sketch - Aiko Mori',
      domain: 'simplesketchesclass.com',
      resendApiKey: process.env.RESEND_API_KEY_SIMPLESKETCHESCLASS!,
    },
    {
      id: 'bibleinkclass',
      email: 'hello@bibleinkclass.com',
      senderName: 'Grace Bennett',
      displayName: 'Bible Ink - Grace Bennett',
      domain: 'bibleinkclass.com',
      resendApiKey: process.env.RESEND_API_KEY_BIBLEINKCLASS!,
    },
    {
      // The aikoarts.com course platform: the all-courses membership, single courses
      // bought on the platform, billing and refunds.
      id: 'aikoarts',
      email: 'hello@aikoarts.com',
      senderName: 'Aiko Arts',
      displayName: 'Aiko Arts',
      domain: 'aikoarts.com',
      resendApiKey: process.env.RESEND_API_KEY_AIKOARTS!,
    },
  ];
}

export function getAccount(id: string): Account | undefined {
  return getAccounts().find((a) => a.id === id);
}

const domainsOf = (a: Account) => [a.domain, ...(a.aliasDomains ?? [])];

// "Aiko <hello@x.com>" or "hello@x.com" -> "hello@x.com"
const bareAddress = (raw: string | null | undefined) =>
  (raw?.match(/<([^>]+)>/)?.[1] ?? raw ?? '').trim().toLowerCase();

export function getAccountByEmail(email: string): Account | undefined {
  return getAccounts().find(
    (a) => a.email === email || domainsOf(a).some((d) => email.endsWith(`@${d}`))
  );
}

/** Every address this inbox answers for: its own, plus the same mailbox on each alias domain. */
export function accountAddresses(account: Account): string[] {
  const mailbox = account.email.split('@')[0];
  return [account.email, ...(account.aliasDomains ?? []).map((d) => `${mailbox}@${d}`)].map((a) =>
    a.toLowerCase()
  );
}

/**
 * The address to answer from: this inbox's mailbox on the domain the customer
 * wrote to, so a reply never switches domains mid-conversation. Falls back to
 * the inbox's own address (new emails, or nothing to go on).
 */
export function replyAddress(account: Account, wroteTo?: (string | null)[] | null): string {
  const mailbox = account.email.split('@')[0];
  for (const raw of wroteTo ?? []) {
    const domain = domainsOf(account).find((d) => bareAddress(raw).endsWith(`@${d}`));
    if (domain) return `${mailbox}@${domain}`;
  }
  return account.email;
}

export function getResendClient(account: Account): Resend {
  return new Resend(account.resendApiKey);
}
