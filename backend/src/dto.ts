import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
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
