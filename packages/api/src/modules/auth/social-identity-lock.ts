import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';

export type SocialIdentityProvider = 'APPLE' | 'GOOGLE';

export function socialIdentitySubjectHash(
  provider: SocialIdentityProvider,
  providerSubject: string,
): string {
  return createHash('sha256').update(`${provider}\0${providerSubject}`).digest('hex');
}

export function legacyAppleIdentitySubjectHash(providerSubject: string): string {
  return createHash('sha256').update(providerSubject).digest('hex');
}

export async function lockSocialIdentity(
  tx: Prisma.TransactionClient,
  provider: SocialIdentityProvider,
  providerSubject: string,
): Promise<void> {
  const digest = createHash('sha256')
    .update(`my-peptides:social-identity-lock:v1:${provider}\0${providerSubject}`)
    .digest();
  const firstKey = digest.readInt32BE(0);
  const secondKey = digest.readInt32BE(4);
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(${firstKey}, ${secondKey})
  `;
}
