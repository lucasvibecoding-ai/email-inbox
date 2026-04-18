import { Resend } from 'resend';

export interface Account {
  id: string;
  email: string;
  senderName: string;
  domain: string;
  resendApiKey: string;
}

export function getAccounts(): Account[] {
  return [
    {
      id: 'clairedoesperfumes',
      email: 'hello@clairedoesperfumes.com',
      senderName: 'Claire Beaumont',
      domain: 'clairedoesperfumes.com',
      resendApiKey: process.env.RESEND_API_KEY_CLAIREDOESPERFUMES!,
    },
    {
      id: 'thebonsaipath',
      email: 'hello@thebonsaipath.com',
      senderName: 'Keiko Murakami - Bonsai Path',
      domain: 'thebonsaipath.com',
      resendApiKey: process.env.RESEND_API_KEY_THEBONSAIPATH!,
    },
    {
      id: 'emmasterrariums',
      email: 'hello@emmasterrariums.com',
      senderName: 'Emma Wilson',
      domain: 'emmasterrariums.com',
      resendApiKey: process.env.RESEND_API_KEY_EMMASTERRARIUMS!,
    },
    {
      id: 'shiboriclass',
      email: 'hello@shiboriclass.com',
      senderName: 'Aiko Mori - Shibori',
      domain: 'shiboriclass.com',
      resendApiKey: process.env.RESEND_API_KEY_SHIBORICLASS!,
    },
    {
      id: 'busymomslearnai',
      email: 'hello@busymomslearnai.com',
      senderName: 'Sarah Wilson',
      domain: 'busymomslearnai.com',
      resendApiKey: process.env.RESEND_API_KEY_BUSYMOMSLEARNAI!,
    },
    {
      id: 'mizuhikiclass',
      email: 'hello@mizuhikiclass.com',
      senderName: 'Aiko Mori - Mizuhiki',
      domain: 'mizuhikiclass.com',
      resendApiKey: process.env.RESEND_API_KEY_MIZUHIKICLASS!,
    },
    {
      id: 'sumieclass',
      email: 'hello@sumieclass.com',
      senderName: 'Aiko Mori - Sumie',
      domain: 'sumieclass.com',
      resendApiKey: process.env.RESEND_API_KEY_SUMIECLASS!,
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
