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
