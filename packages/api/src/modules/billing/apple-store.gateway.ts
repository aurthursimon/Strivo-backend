import {
  Injectable,
  ServiceUnavailableException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import {
  AppStoreServerAPIClient,
  SignedDataVerifier,
  Environment,
  type JWSTransactionDecodedPayload,
  type JWSRenewalInfoDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from '../../config';
import { verifyAppleReceipt } from './apple-receipt';

export const APPLE_STORE_GATEWAY = Symbol('APPLE_STORE_GATEWAY');
export interface AppleSubscriptionEvidence {
  transaction: JWSTransactionDecodedPayload;
  renewal?: JWSRenewalInfoDecodedPayload;
  status: number;
}
export interface AppleStoreGatewayPort {
  latest(transactionId: string): Promise<AppleSubscriptionEvidence>;
  receipt?(
    transactionId: string,
    receiptData: string,
    signedTransaction: string,
  ): Promise<AppleSubscriptionEvidence>;
  renewal?(signedPayload: string): Promise<JWSRenewalInfoDecodedPayload>;
  notification(signedPayload: string): Promise<ResponseBodyV2DecodedPayload>;
  transaction(signedPayload: string): Promise<JWSTransactionDecodedPayload>;
}
export function appleStoreConfigured(env: Env): boolean {
  return Boolean(env.APPLE_IAP_SHARED_SECRET) || appleServerApiConfigured(env);
}
export function appleServerApiConfigured(env: Env): boolean {
  return Boolean(
    env.APPLE_IAP_KEY_ID && env.APPLE_IAP_ISSUER_ID && env.APPLE_IAP_PRIVATE_KEY_BASE64,
  );
}
@Injectable()
export class AppleStoreGateway implements AppleStoreGatewayPort {
  private verifier?: SignedDataVerifier;
  private sdk?: { client: AppStoreServerAPIClient; verifier: SignedDataVerifier };
  constructor(private readonly env: Env) {}
  private getSdk() {
    if (this.sdk) return this.sdk;
    if (!appleStoreConfigured(this.env))
      throw new ServiceUnavailableException('Apple purchases are not configured');
    const environment =
      this.env.APPLE_IAP_ENVIRONMENT === 'Sandbox' ? Environment.SANDBOX : Environment.PRODUCTION;
    if (!appleServerApiConfigured(this.env))
      throw new ServiceUnavailableException('Apple Server API key is not configured');
    const privateKey = Buffer.from(this.env.APPLE_IAP_PRIVATE_KEY_BASE64!, 'base64').toString(
      'utf8',
    );
    this.sdk = {
      client: new AppStoreServerAPIClient(
        privateKey,
        this.env.APPLE_IAP_KEY_ID!,
        this.env.APPLE_IAP_ISSUER_ID!,
        this.env.APPLE_IAP_BUNDLE_ID,
        environment,
      ),
      verifier: this.getVerifier(),
    };
    return this.sdk;
  }
  private getVerifier() {
    if (this.verifier) return this.verifier;
    const environment =
      this.env.APPLE_IAP_ENVIRONMENT === 'Sandbox' ? Environment.SANDBOX : Environment.PRODUCTION;
    const roots = ['AppleRootCA-G3.cer', 'AppleRootCA-G2.cer'].map((name) =>
      readFileSync(join(__dirname, 'certs', name)),
    );
    this.verifier = new SignedDataVerifier(
      roots,
      true,
      environment,
      this.env.APPLE_IAP_BUNDLE_ID,
      environment === Environment.PRODUCTION ? this.env.APPLE_IAP_APP_ID : undefined,
    );
    return this.verifier;
  }
  receipt(transactionId: string, receiptData: string, signedTransaction: string) {
    return this.bounded(async () => {
      const signed = await this.getVerifier().verifyAndDecodeTransaction(signedTransaction);
      if (
        signed.transactionId !== transactionId ||
        !signed.originalTransactionId ||
        !signed.appAccountToken
      )
        throw new BadRequestException('Apple signed purchase identity missing or mismatched');
      return verifyAppleReceipt(this.env, signed, receiptData);
    });
  }
  renewal(signedPayload: string) {
    return this.bounded(() => this.getVerifier().verifyAndDecodeRenewalInfo(signedPayload));
  }
  private async bounded<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ServiceUnavailableException('Apple verification timed out; retry the purchase'),
              ),
            10_000,
          );
        }),
      ]);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Do not expose Apple's JWT, credentials, OCSP or transport diagnostics.
      throw new ServiceUnavailableException('Apple verification unavailable or evidence invalid');
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  notification(signedPayload: string) {
    return this.bounded(() => this.getVerifier().verifyAndDecodeNotification(signedPayload));
  }
  transaction(signedPayload: string) {
    return this.bounded(() => this.getVerifier().verifyAndDecodeTransaction(signedPayload));
  }
  latest(transactionId: string): Promise<AppleSubscriptionEvidence> {
    return this.bounded(() => this.fetchLatest(transactionId));
  }
  private async fetchLatest(transactionId: string): Promise<AppleSubscriptionEvidence> {
    const { client, verifier } = this.getSdk();
    const original = await client.getTransactionInfo(transactionId);
    if (!original.signedTransactionInfo)
      throw new BadRequestException('Apple transaction not found');
    const submitted = await verifier.verifyAndDecodeTransaction(original.signedTransactionInfo);
    if (!submitted.originalTransactionId)
      throw new BadRequestException('Apple subscription identity missing');
    const response = await client.getAllSubscriptionStatuses(submitted.originalTransactionId);
    const candidates: AppleSubscriptionEvidence[] = [];
    for (const group of response.data ?? []) {
      for (const item of group.lastTransactions ?? []) {
        if (
          item.originalTransactionId !== submitted.originalTransactionId ||
          !item.signedTransactionInfo ||
          item.status == null
        )
          continue;
        const transaction = await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
        if (transaction.originalTransactionId !== submitted.originalTransactionId)
          throw new BadRequestException('Apple transaction identity mismatch');
        const renewal = item.signedRenewalInfo
          ? await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo)
          : undefined;
        if (
          renewal?.originalTransactionId &&
          renewal.originalTransactionId !== submitted.originalTransactionId
        )
          throw new BadRequestException('Apple renewal identity mismatch');
        candidates.push({ transaction, renewal, status: item.status });
      }
    }
    candidates.sort((a, b) => (b.transaction.signedDate ?? 0) - (a.transaction.signedDate ?? 0));
    if (!candidates[0]) throw new BadRequestException('Apple subscription status not found');
    return candidates[0];
  }
}
