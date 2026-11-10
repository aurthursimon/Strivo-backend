import { IsString, IsOptional, Matches, MaxLength, MinLength } from 'class-validator';
export class VerifyApplePurchaseDto {
  @IsString()
  @Matches(/^\d+$/)
  @MaxLength(64)
  transactionId!: string;
  @IsOptional()
  @IsString()
  @MaxLength(2000000)
  receiptData?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100000)
  signedTransaction?: string;
}
export class AppleNotificationDto {
  @IsString()
  @MinLength(20)
  @MaxLength(100000)
  signedPayload!: string;
}
