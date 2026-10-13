import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Role, ApplicationStatus } from '@prisma/client';

export class LoginDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsString() @Length(1, 128) password!: string;
}
export class ChangePasswordDto {
  @IsString() @Length(1, 128) currentPassword!: string;
  @IsString() @Length(12, 128) newPassword!: string;
}
export class CreateUserDto {
  @IsString() @Length(2, 100) name!: string;
  @IsEmail() @MaxLength(200) email!: string;
  @IsString() @Length(12, 128) password!: string;
  @IsEnum(Role) role!: Role;
}
export class UserChangeDto {
  @IsInt() @Min(1) version!: number;
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @Length(12, 128) password?: string;
  @IsString() @Length(3, 500) reason!: string;
}
export class SchoolDto {
  @IsInt() @Min(1) version!: number;
  @IsString() @Length(2, 150) name!: string;
  @IsString() @MaxLength(500) address!: string;
  @IsString() @MaxLength(25) phone!: string;
  @IsString() @MaxLength(200) email!: string;
  @Matches(/^[A-Z0-9-]{1,12}$/) admissionPrefix!: string;
}
export class SessionDto {
  @IsString() @Length(3, 50) name!: string;
  @IsDateString({ strict: true }) startDate!: string;
  @IsDateString({ strict: true }) endDate!: string;
  @IsBoolean() current!: boolean;
  @IsBoolean() admissionsOpen!: boolean;
}
export class SessionStateDto {
  @IsBoolean() current!: boolean;
  @IsBoolean() admissionsOpen!: boolean;
}
export class SubjectDto {
  @Matches(/^[A-Z0-9_-]{1,20}$/) code!: string;
  @IsString() @Length(2, 100) name!: string;
}
export class ClassDto {
  @IsString() @Length(1, 100) sessionId!: string;
  @IsString() @Length(1, 30) grade!: string;
  @IsString() @Length(1, 20) section!: string;
  @IsString() @MaxLength(30) stream = '';
  @IsInt() @Min(1) @Max(500) capacity!: number;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) subjectIds: string[] = [];
}
export class ClassChangeDto {
  @IsInt() @Min(1) version!: number;
  @IsInt() @Min(1) @Max(500) capacity!: number;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) subjectIds: string[] = [];
  @IsOptional() @IsString() nextClassId?: string;
}
export class AssignmentDto {
  @IsString() @Length(1, 100) teacherId!: string;
  @IsString() @Length(1, 100) classId!: string;
  @IsDateString({ strict: true }) startDate!: string;
}
export class EndAssignmentDto {
  @IsDateString({ strict: true }) endDate!: string;
  @IsString() @Length(3, 500) reason!: string;
}
export class ChecklistItemDto {
  @IsString() @Length(1, 100) name!: string;
  @IsBoolean() received!: boolean;
  @IsBoolean() verified!: boolean;
}
export class ApplicationDto {
  @IsString() @Length(1, 100) sessionId!: string;
  @IsString() @Length(2, 100) studentName!: string;
  @IsDateString({ strict: true }) dateOfBirth!: string;
  @IsIn(['BOY', 'GIRL', 'OTHER']) gender!: string;
  @IsString() @Length(2, 100) guardianName!: string;
  @Matches(/^[+0-9 ()-]{7,25}$/) guardianPhone!: string;
  @IsString() @MaxLength(200) guardianEmail = '';
  @IsString() @Length(2, 40) relationship = 'Guardian';
  @IsString() @MaxLength(500) address = '';
  @IsString() @MaxLength(500) permanentAddress = '';
  @IsString() @MaxLength(150) previousSchool = '';
  @IsString() @Length(1, 30) appliedGrade!: string;
  @IsString() @Length(1, 100) source!: string;
  @IsOptional() @IsDateString({ strict: true }) nextFollowUp?: string;
  @IsString() @MaxLength(2000) notes = '';
  @IsBoolean() ews = false;
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ChecklistItemDto) documentChecklist: ChecklistItemDto[] = [];
}
export class ApplicationEditDto extends ApplicationDto {
  @IsInt() @Min(1) version!: number;
}
export class DecisionDto {
  @IsInt() @Min(1) version!: number;
  @IsEnum(ApplicationStatus) status!: ApplicationStatus;
  @IsString() @Length(3, 500) reason!: string;
}
export class ConfirmDto {
  @IsInt() @Min(1) version!: number;
  @IsString() @Length(1, 100) classId!: string;
  @IsDateString({ strict: true }) admissionDate!: string;
  @IsString() @Length(1, 50) feeCategory = 'GENERAL';
  @IsOptional() @IsString() @Length(3, 100) siblingAdmissionNumber?: string;
  @IsString() @Length(3, 500) reason!: string;
}
export class StudentEditDto {
  @IsInt() @Min(1) version!: number;
  @IsString() @Length(2, 100) name!: string;
  @IsDateString({ strict: true }) dateOfBirth!: string;
  @IsIn(['BOY', 'GIRL', 'OTHER']) gender!: string;
  @IsString() @MaxLength(500) address!: string;
  @IsString() @MaxLength(500) permanentAddress!: string;
  @IsString() @MaxLength(150) previousSchool!: string;
  @IsString() @Length(3, 500) reason!: string;
}
export class LinkFamilyDto {
  @IsInt() @Min(1) version!: number;
  @IsString() @Length(1, 100) siblingAdmissionNumber!: string;
  @IsString() @Length(3, 500) reason!: string;
}
export class GuardianDto {
  @IsString() @Length(2, 100) name!: string;
  @IsString() @Length(2, 40) relationship!: string;
  @Matches(/^[+0-9 ()-]{7,25}$/) phone!: string;
  @IsString() @MaxLength(200) email = '';
  @IsString() @MaxLength(500) address = '';
}
export class DocumentDto {
  @IsOptional() @IsString() studentId?: string;
  @IsOptional() @IsString() applicationId?: string;
  @IsString() @Length(2, 80) type!: string;
}
export class ListDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() sessionId?: string;
  @IsOptional() @IsString() classId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsDateString({ strict: true }) followUpBefore?: string;
}

export class FeeHeadDto {
  @Matches(/^[A-Z0-9_-]{2,30}$/) code!: string;
  @IsString() @Length(2, 100) name!: string;
  @IsIn(['MONTHLY', 'ANNUAL', 'HALF_YEARLY', 'NEW_ADMISSION', 'SERVICE', 'MISC']) category!: string;
}

export class FeeRuleInputDto {
  @IsString() @Length(1, 100) feeHeadId!: string;
  @IsOptional() @IsString() classId?: string;
  @IsIn(['MONTHLY', 'ANNUAL', 'HALF_YEARLY', 'ONE_TIME']) frequency!: string;
  @Matches(/^\d+$/) amountMinor!: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) assessmentMonth?: number;
  @IsOptional() @IsIn(['ALL', 'NEW_ADMISSION', 'CONTINUING', 'PROMOTED', 'READMISSION']) entryType?: string;
  @IsOptional() @IsIn(['ALL', 'GENERAL', 'EWS', 'STAFF_CHILD', 'SIBLING']) category?: string;
  @IsOptional() @IsInt() @Min(1) @Max(31) dueDay?: number;
}

export class FeePlanDto {
  @IsString() @Length(1, 100) sessionId!: string;
  @IsString() @Length(2, 150) name!: string;
  @IsDateString({ strict: true }) effectiveFrom!: string;
  @IsOptional() @IsDateString({ strict: true }) effectiveTo?: string;
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => FeeRuleInputDto) rules!: FeeRuleInputDto[];
}

export class PublishFeePlanDto {
  @IsInt() @Min(1) versionNumber!: number;
  @IsString() @Length(3, 500) reason!: string;
}

export class AssessmentPreviewDto {
  @IsString() @Length(1, 100) enrollmentId!: string;
  @IsOptional() @IsString() feePlanVersionId?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(36) @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { each: true }) periods!: string[];
}

export class AssessmentCommitDto extends AssessmentPreviewDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class CreditDto {
  @IsString() @Length(1, 100) studentId!: string;
  @Matches(/^\d+$/) amountMinor!: string;
  @IsIn(['OPENING_BALANCE', 'IMPORT', 'ADJUSTMENT']) source!: string;
  @IsString() @Length(3, 500) reason!: string;
}

export class ServiceAssignmentDto {
  @IsString() @Length(1, 100) enrollmentId!: string;
  @IsIn(['TRANSPORT', 'HOSTEL']) type!: string;
  @IsString() @Length(2, 150) label!: string;
  @Matches(/^\d+$/) amountMinor!: string;
  @IsIn(['MONTHLY', 'ONE_TIME']) frequency = 'MONTHLY';
  @IsDateString({ strict: true }) startDate!: string;
  @IsOptional() @IsDateString({ strict: true }) endDate?: string;
}

export class EndServiceDto {
  @IsDateString({ strict: true }) endDate!: string;
  @IsString() @Length(3, 500) reason!: string;
}

export class TransportRouteDto {
  @IsString() @Length(2, 150) name!: string;
  @IsOptional() @IsString() @MaxLength(100) campus?: string;
  @IsOptional() @IsString() @MaxLength(150) destination?: string;
  @Matches(/^\d+$/) monthlyAmountMinor!: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) capacity?: number;
}

export class TransportVehicleDto {
  @IsString() @Length(2, 100) name!: string;
  @IsString() @Length(1, 30) busNumber!: string;
  @IsInt() @Min(1) @Max(500) capacity!: number;
  @IsOptional() @IsString() @MaxLength(100) driver1Name?: string;
  @IsOptional() @Matches(/^[+0-9 ()-]{7,25}$/) driver1Phone?: string;
  @IsOptional() @IsString() @MaxLength(100) driver2Name?: string;
  @IsOptional() @Matches(/^[+0-9 ()-]{7,25}$/) driver2Phone?: string;
}

export class TransportAllocationDto {
  @IsString() @Length(1, 100) enrollmentId!: string;
  @IsString() @Length(1, 100) routeId!: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsDateString({ strict: true }) startDate!: string;
  @IsOptional() @IsDateString({ strict: true }) endDate?: string;
}

export class StoreGroupDto {
  @Matches(/^[A-Z0-9_-]{2,30}$/) code!: string;
  @IsString() @Length(2, 100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class StoreVendorDto {
  @IsString() @Length(2, 150) name!: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @Matches(/^[+0-9 ()-]{7,25}$/) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsString() @MaxLength(500) contactAddress?: string;
  @IsOptional() @Matches(/^[+0-9 ()-]{7,25}$/) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(50) bankAccount?: string;
  @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @IsOptional() @Matches(/^[A-Z0-9]{4,20}$/) ifsc?: string;
  @IsOptional() @IsString() @MaxLength(100) upi?: string;
}

export class StoreProductDto {
  @IsString() @Length(2, 150) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() groupId?: string;
  @Matches(/^\d+$/) unitCostMinor!: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000000) alertQuantity?: number;
}

export class StoreClusterLineDto {
  @IsString() @Length(1, 100) productId!: string;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
}

export class StoreClusterDto {
  @IsString() @Length(2, 150) name!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => StoreClusterLineDto) items!: StoreClusterLineDto[];
}

export class StoreStockReceiptLineDto {
  @IsString() @Length(1, 100) productId!: string;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @Matches(/^\d+$/) unitCostMinor!: string;
}

export class StoreStockReceiptDto {
  @IsOptional() @IsString() vendorId?: string;
  @IsDateString({ strict: true }) receivedAt!: string;
  @IsString() @Length(3, 500) reason!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => StoreStockReceiptLineDto) lines!: StoreStockReceiptLineDto[];
}

export class StoreIssueLineDto {
  @IsString() @Length(1, 100) productId!: string;
  @IsInt() @Min(1) @Max(1000000) quantity!: number;
}

export class StoreIssueDto {
  @IsString() @Length(1, 100) studentId!: string;
  @IsString() @Length(1, 100) enrollmentId!: string;
  @IsDateString({ strict: true }) issuedAt!: string;
  @IsString() @Length(3, 500) reason!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => StoreIssueLineDto) lines!: StoreIssueLineDto[];
}

export class StoreStockAdjustmentDto {
  @IsString() @Length(1, 100) productId!: string;
  @Matches(/^-?\d+$/) quantityDelta!: string;
  @IsString() @Length(3, 500) reason!: string;
}

export class PaymentQuoteDto {
  @IsString() @Length(1, 100) studentId!: string;
  @Matches(/^\d{1,19}$/) amountMinor!: string;
}

export class PaymentDto {
  @IsString() @Length(1, 100) quoteId!: string;
  @IsInt() @Min(1) @Max(2147483647) quoteVersion!: number;
  @Matches(/^\d{1,19}$/) receivedAmountMinor!: string;
  @IsDateString({ strict: true }) businessDate!: string;
  @IsIn(['CASH', 'MANUAL_ELECTRONIC', 'CHEQUE']) mode!: string;
  @IsOptional() @IsIn(['INR']) currency = 'INR';
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(2, 150) payerName!: string;
  @IsOptional() @Matches(/^[+0-9 ()-]{7,25}$/) payerPhone?: string;
  @IsOptional() @IsString() @MaxLength(150) reference?: string;
  @IsOptional() @IsIn(['UPI', 'BANK_TRANSFER', 'CARD', 'OTHER']) electronicChannel?: string;
  @ValidateIf(body => body.mode === 'MANUAL_ELECTRONIC' || body.electronicVerified !== undefined) @IsBoolean() @IsIn([true]) electronicVerified?: boolean;
  @ValidateIf(body => body.mode === 'MANUAL_ELECTRONIC' || body.electronicVerificationNote !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(3, 500) electronicVerificationNote?: string;
  @IsOptional() @Matches(/^\d{1,19}$/) tenderedAmountMinor?: string;
  @IsOptional() @IsString() @Length(3, 80) chequeNumber?: string;
  @IsOptional() @IsString() @Length(2, 150) chequeBank?: string;
  @IsOptional() @IsDateString({ strict: true }) chequeDate?: string;
}

export class PaymentActionDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(3, 500) reason!: string;
}

export class PaymentCorrectionDto extends PaymentActionDto {
  @IsOptional() @IsDateString({ strict: true }) businessDate?: string;
  @IsOptional() @IsString() @Length(1, 100) shiftId?: string;
}

export class PaymentRefundDto extends PaymentCorrectionDto {
  @Matches(/^\d{1,19}$/) amountMinor!: string;
  @IsOptional() @IsString() @MaxLength(150) reference?: string;
}

export class ChequeClearDto extends PaymentActionDto {
  @IsDateString({ strict: true }) businessDate!: string;
}

export class OpenCashierShiftDto {
  @IsDateString({ strict: true }) businessDate!: string;
  @Matches(/^\d{1,19}$/) openingFloatMinor!: string;
}

export class CloseCashierShiftDto {
  @Matches(/^\d{1,19}$/) countedCashMinor!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(500) reason = '';
}

export class PaymentListDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(100) cashierId?: string;
  @IsOptional() @IsString() @MaxLength(30) status?: string;
  @IsOptional() @IsIn(['CASH', 'MANUAL_ELECTRONIC', 'CHEQUE']) mode?: string;
  @IsOptional() @IsString() @Length(1, 100) studentId?: string;
  @IsOptional() @IsString() @MaxLength(80) receiptNumber?: string;
  @IsOptional() @IsIn(['ISSUED', 'VOID', 'PARTIALLY_REFUNDED', 'REFUNDED']) receiptStatus?: string;
  @IsOptional() @IsDateString({ strict: true }) businessDate?: string;
  @IsOptional() @IsDateString({ strict: true }) fromDate?: string;
  @IsOptional() @IsDateString({ strict: true }) toDate?: string;
}

export class CollectionReportDto {
  @IsOptional() @IsDateString({ strict: true }) fromDate?: string;
  @IsOptional() @IsDateString({ strict: true }) toDate?: string;
  @IsOptional() @IsIn(['CASH', 'MANUAL_ELECTRONIC', 'CHEQUE']) mode?: string;
  @IsOptional() @IsString() cashierId?: string;
}
