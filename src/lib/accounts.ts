import { Resend } from 'resend';

export interface Account {
  id: string;
  email: string;
  senderName: string;
  displayName: string;
  domain: string;
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
      id: 'mizuhikiclass',
      email: 'hello@mizuhikiclass.com',
      senderName: 'Aiko Mori - Mizuhiki',
      displayName: 'Aiko Mori - Mizuhiki',
      domain: 'mizuhikiclass.com',
      resendApiKey: process.env.RESEND_API_KEY_MIZUHIKICLASS!,
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
  ];
}

export function getAccount(id: string): Account | undefined {
  return getAccounts().find((a) => a.id === id);
}

export function getAccountByEmail(email: string): Account | undefined {
  return getAccounts().find(
    (a) => a.email === email || email.endsWith(`@${a.domain}`)
  );
}

export function getResendClient(account: Account): Resend {
  return new Resend(account.resendApiKey);
}
