import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import { PaymentActionDto, PaymentCorrectionDto } from './dto';

export class FinancePageDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class FinanceRequestListDto extends FinancePageDto {
  @IsOptional() @IsIn(['REQUESTED', 'APPLIED', 'REJECTED', 'STALE']) status?: string;
}
export class FinanceRequestDto extends PaymentCorrectionDto {
  @IsString() @Length(1, 100) paymentId!: string;
  @IsIn(['REFUND', 'REVERSE', 'BOUNCE']) type!: string;
  @ValidateIf(body => body.type === 'REFUND' || body.amountMinor !== undefined) @Matches(/^\d{1,19}$/) amountMinor?: string;
}
export class FinancePolicyDto extends PaymentActionDto {
  @IsInt() @Min(1) @Max(2147483646) version!: number;
  @Matches(/^[A-Z0-9]+(?:[/-][A-Z0-9]+)*$/) @Length(1, 40) receiptPrefix!: string;
  @IsIn(['SCHOOL', 'FINANCIAL_YEAR']) receiptScope!: string;
  @IsBoolean() allowAdvance!: boolean;
  @IsBoolean() blockPreviousSession!: boolean;
  @Matches(/^\d{1,19}$/) bounceFeeMinor!: string;
}
export class CashMovementDto extends PaymentActionDto {
  @IsIn(['DEPOSIT', 'HANDOVER', 'EXPENSE']) type!: string;
  @Matches(/^\d{1,19}$/) amountMinor!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(3, 150) reference!: string;
}
export class DuesReportDto extends FinancePageDto {
  @IsOptional() @IsString() @Length(1, 100) studentId?: string;
  @IsOptional() @IsString() @Length(1, 100) sessionId?: string;
  @IsOptional() @IsString() @Length(1, 100) classId?: string;
  @IsOptional() @IsString() @Length(1, 100) feeHeadId?: string;
  @IsOptional() @IsDateString({ strict: true }) asOf?: string;
}
export class JournalReportDto extends FinancePageDto {
  @IsOptional() @IsString() @Length(1, 100) studentId?: string;
  @IsOptional() @IsDateString({ strict: true }) fromDate?: string;
  @IsOptional() @IsDateString({ strict: true }) toDate?: string;
}
