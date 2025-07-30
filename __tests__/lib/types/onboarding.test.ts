// Unit tests for onboarding types and validation

// Jest globals are available by default
import { 
  OnboardingError, 
  OnboardingErrorCode, 
  UserRole,
  InstitutionType,
  InstitutionStatus,
  DepartmentStatus
} from '@/lib/types/onboarding';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';

describe('OnboardingError', () => {
  it('should create error with all properties', () => {
    const error = new OnboardingError(
      'Test error',
      OnboardingErrorCode.INVALID_STEP,
      2,
      'role'
    );

    expect(error.message).toBe('Test error');
    expect(error.code).toBe(OnboardingErrorCode.INVALID_STEP);
    expect(error.step).toBe(2);
    expect(error.field).toBe('role');
    expect(error.name).toBe('OnboardingError');
    expect(error instanceof Error).toBe(true);
  });

  it('should create error with minimal properties', () => {
    const error = new OnboardingError(
      'Simple error',
      OnboardingErrorCode.VALIDATION_FAILED
    );

    expect(error.message).toBe('Simple error');
    expect(error.code).toBe(OnboardingErrorCode.VALIDATION_FAILED);
    expect(error.step).toBeUndefined();
    expect(error.field).toBeUndefined();
  });
});

describe('Enums', () => {
  it('should have correct UserRole values', () => {
    expect(UserRole.STUDENT).toBe('student');
    expect(UserRole.TEACHER).toBe('teacher');
    expect(UserRole.DEPARTMENT_ADMIN).toBe('department_admin');
    expect(UserRole.INSTITUTION_ADMIN).toBe('institution_admin');
    expect(UserRole.SYSTEM_ADMIN).toBe('system_admin');
  });

  it('should have correct InstitutionType values', () => {
    expect(InstitutionType.UNIVERSITY).toBe('university');
    expect(InstitutionType.COLLEGE).toBe('college');
    expect(InstitutionType.SCHOOL).toBe('school');
    expect(InstitutionType.TRAINING_CENTER).toBe('training_center');
    expect(InstitutionType.OTHER).toBe('other');
  });

  it('should have correct InstitutionStatus values', () => {
    expect(InstitutionStatus.ACTIVE).toBe('active');
    expect(InstitutionStatus.INACTIVE).toBe('inactive');
    expect(InstitutionStatus.SUSPENDED).toBe('suspended');
    expect(InstitutionStatus.PENDING).toBe('pending');
  });

  it('should have correct DepartmentStatus values', () => {
    expect(DepartmentStatus.ACTIVE).toBe('active');
    expect(DepartmentStatus.INACTIVE).toBe('inactive');
    expect(DepartmentStatus.ARCHIVED).toBe('archived');
  });
});

describe('OnboardingErrorCode', () => {
  it('should have all required error codes', () => {
    expect(OnboardingErrorCode.INVALID_STEP).toBe('INVALID_STEP');
    expect(OnboardingErrorCode.MISSING_REQUIRED_DATA).toBe('MISSING_REQUIRED_DATA');
    expect(OnboardingErrorCode.INVALID_ROLE).toBe('INVALID_ROLE');
    expect(OnboardingErrorCode.INSTITUTION_NOT_FOUND).toBe('INSTITUTION_NOT_FOUND');
    expect(OnboardingErrorCode.DEPARTMENT_NOT_FOUND).toBe('DEPARTMENT_NOT_FOUND');
    expect(OnboardingErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(OnboardingErrorCode.SESSION_EXPIRED).toBe('SESSION_EXPIRED');
    expect(OnboardingErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
  });
});