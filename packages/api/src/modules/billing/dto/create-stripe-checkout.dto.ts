import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const STRIPE_MARKETS = ['US', 'CA', 'GB', 'DE', 'FR', 'ES', 'PH', 'IN'] as const;
export type StripeMarket = (typeof STRIPE_MARKETS)[number];
export const STRIPE_PLANS = ['weekly', 'monthly', 'yearly'] as const;
export type StripePlan = (typeof STRIPE_PLANS)[number];
// Where Stripe should send the user back to after checkout. 'site' (default)
// is the web-funnel marketing site; 'app' is frontend-mobile's web build,
// mounted at /app on the same origin (Vercel multi-zone) — the checkout that
// now runs directly inside the webapp for Android/iOS, since distribution is
// no longer through the App Store/Play Store. 'app-upgrade' is the same
// in-app destination as 'app', used specifically by the Home free-tier
// banner's "upgrade now" entry point: a Free-plan user has already had (or
// was offered) the no-card trial window right after onboarding, so this
// checkout must charge immediately instead of granting a second Stripe
// trial on top of it (see createCheckoutSession). A closed enum, never a raw
// client-supplied URL, so there is no open-redirect surface.
export const STRIPE_RETURN_CONTEXTS = ['site', 'app', 'app-upgrade'] as const;
export type StripeReturnContext = (typeof STRIPE_RETURN_CONTEXTS)[number];

/**
 * O checkout agora exige autenticacao (JwtAuthGuard). Identidade (userId,
 * email) vem do usuario autenticado, nunca do body — por isso este DTO
 * aceita somente os dados de escolha de produto. A ValidationPipe global
 * (whitelist + forbidNonWhitelisted) rejeita qualquer campo extra, incluindo
 * tentativas de enviar userId/email.
 */
export class CreateStripeCheckoutDto {
  @IsIn(STRIPE_PLANS)
  plan!: StripePlan;

  @IsIn(STRIPE_MARKETS)
  market!: StripeMarket;

  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(200)
  idempotencyKey?: string;

  @IsOptional()
  @IsIn(STRIPE_RETURN_CONTEXTS)
  returnContext?: StripeReturnContext;
}

export class ClaimStripeCheckoutDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  claimToken!: string;
}
