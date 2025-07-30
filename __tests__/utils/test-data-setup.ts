import { UserRole } from '@/lib/types/onboarding';

// Test data generators for onboarding tests
export class OnboardingTestDataGenerator {
  
  /**
   * Generate mock onboarding context data
   */
  static createMockOnboardingContext(overrides: Partial<any> = {}) {
    return {
      currentStep: 0,
      totalSteps: 5,
      onboardingData: {
        userId: 'test-user-' + Math.random().toString(36).substr(2, 9),
        role: undefined,
        institutionId: undefined,
        departmentId: undefined,
        classIds: [],
        skippedSteps: [],
        currentStep: 0,
        completedAt: undefined,
        ...overrides.onboardingData
      },
      updateOnboardingData: jest.fn(),
      nextStep: jest.fn(),
      previousStep: jest.fn(),
      skipStep: jest.fn(),
      completeOnboarding: jest.fn(),
      loading: false,
      ...overrides
    };
  }

  /**
   * Generate mock institution data
   */
  static createMockInstitutions(count: number = 10) {
    return Array.from({ length: count }, (_, i) => ({
      id: `institution-${i}`,
      name: `Test Institution ${i}`,
      domain: `test${i}.edu`,
      userCount: Math.floor(Math.random() * 10000) + 100,
      departmentCount: Math.floor(Math.random() * 50) + 5,
      status: 'active',
      createdAt: new Date().toISOString()
    }));
  }

  /**
   * Generate mock department data
   */
  static createMockDepartments(institutionId: string, count: number = 5) {
    const departments = [
      'Computer Science',
      'Mathematics',
      'Physics',
      'Chemistry',
      'Biology',
      'English',
      'History',
      'Psychology',
      'Economics',
      'Engineering'
    ];

    return Array.from({ length: count }, (_, i) => ({
      id: `department-${i}`,
      institutionId,
      name: departments[i % departments.length],
      userCount: Math.floor(Math.random() * 500) + 10,
      classCount: Math.floor(Math.random() * 100) + 5,
      createdAt: new Date().toISOString()
    }));
  }

  /**
   * Generate mock class data
   */
  static createMockClasses(count: number = 5) {
    const subjects = [
      'Introduction to Programming',
      'Calculus I',
      'Physics 101',
      'Chemistry Fundamentals',
      'Biology Basics',
      'English Composition',
      'World History',
      'Psychology 101',
      'Microeconomics',
      'Engineering Design'
    ];

    return Array.from({ length: count }, (_, i) => ({
      id: `class-${i}`,
      code: `CLS${String(i).padStart(3, '0')}`,
      name: subjects[i % subjects.length],
      description: `A comprehensive course covering ${subjects[i % subjects.length].toLowerCase()}`,
      teacherName: `Professor ${String.fromCharCode(65 + i)}`,
      teacherId: `teacher-${i}`,
      studentCount: Math.floor(Math.random() * 30) + 5,
      maxStudents: 35,
      semester: 'Fall 2024',
      status: 'active',
      createdAt: new Date().toISOString()
    }));
  }

  /**
   * Generate mock user data for different roles
   */
  static createMockUser(role: UserRole, overrides: Partial<any> = {}) {
    const baseUser = {
      id: `user-${Math.random().toString(36).substr(2, 9)}`,
      email: `test.user.${Date.now()}@example.com`,
      firstName: 'Test',
      lastName: 'User',
      role,
      onboardingCompleted: false,
      createdAt: new Date().toISOString(),
      ...overrides
    };

    // Role-specific defaults
    switch (role) {
      case UserRole.STUDENT:
        return {
          ...baseUser,
          firstName: 'Student',
          classIds: [],
          gpa: 3.5
        };
      
      case UserRole.TEACHER:
        return {
          ...baseUser,
          firstName: 'Teacher',
          classIds: [],
          department: 'Computer Science'
        };
      
      case UserRole.DEPARTMENT_ADMIN:
        return {
          ...baseUser,
          firstName: 'Department',
          lastName: 'Admin',
          departmentId: 'dept-1',
          permissions: ['manage_users', 'view_analytics']
        };
      
      case UserRole.INSTITUTION_ADMIN:
        return {
          ...baseUser,
          firstName: 'Institution',
          lastName: 'Admin',
          institutionId: 'inst-1',
          permissions: ['manage_institution', 'manage_departments', 'view_analytics']
        };
      
      case UserRole.SYSTEM_ADMIN:
        return {
          ...baseUser,
          firstName: 'System',
          lastName: 'Admin',
          permissions: ['manage_system', 'manage_institutions', 'view_all_analytics']
        };
      
      default:
        return baseUser;
    }
  }

  /**
   * Generate complete onboarding flow test data
   */
  static createCompleteOnboardingScenario(role: UserRole) {
    const user = this.createMockUser(role);
    const institutions = this.createMockInstitutions(3);
    const selectedInstitution = institutions[0];
    const departments = this.createMockDepartments(selectedInstitution.id, 3);
    const classes = this.createMockClasses(5);

    return {
      user,
      institutions,
      selectedInstitution,
      departments,
      selectedDepartment: departments[0],
      classes,
      selectedClass: classes[0],
      onboardingContext: this.createMockOnboardingContext({
        onboardingData: {
          userId: user.id,
          role,
          institutionId: selectedInstitution.id,
          departmentId: departments[0].id,
          classIds: role === UserRole.STUDENT ? [classes[0].id] : [],
          currentStep: 4
        }
      })
    };
  }
}

// Mock hook implementations for testing
export class OnboardingTestMocks {
  
  /**
   * Create mock role selection hook
   */
  static createMockRoleSelectionHook(overrides: Partial<any> = {}) {
    return {
      selectRole: jest.fn().mockResolvedValue(true),
      validating: false,
      error: null,
      ...overrides
    };
  }

  /**
   * Create mock institution search hook
   */
  static createMockInstitutionSearchHook(institutions: any[] = [], overrides: Partial<any> = {}) {
    return {
      institutions,
      loading: false,
      error: null,
      searchInstitutions: jest.fn(),
      selectInstitution: jest.fn().mockResolvedValue(true),
      clearSearch: jest.fn(),
      ...overrides
    };
  }

  /**
   * Create mock class join hook
   */
  static createMockClassJoinHook(overrides: Partial<any> = {}) {
    return {
      joinClass: jest.fn().mockResolvedValue({ 
        success: true, 
        class: OnboardingTestDataGenerator.createMockClasses(1)[0] 
      }),
      loading: false,
      error: null,
      ...overrides
    };
  }

  /**
   * Create mock onboarding completion hook
   */
  static createMockOnboardingCompletionHook(overrides: Partial<any> = {}) {
    return {
      completeOnboarding: jest.fn().mockResolvedValue(true),
      loading: false,
      error: null,
      ...overrides
    };
  }
}

// Test utilities for setup and cleanup
export class OnboardingTestUtils {
  
  /**
   * Setup common test environment
   */
  static setupTestEnvironment() {
    // Mock window methods
    Object.defineProperty(window, 'history', {
      value: {
        back: jest.fn(),
        pushState: jest.fn(),
        replaceState: jest.fn()
      },
      writable: true
    });

    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock
    });

    // Mock sessionStorage
    Object.defineProperty(window, 'sessionStorage', {
      value: localStorageMock
    });

    // Mock IntersectionObserver
    global.IntersectionObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn()
    }));

    // Mock ResizeObserver
    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn()
    }));

    return {
      cleanup: () => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
      }
    };
  }

  /**
   * Setup viewport for responsive testing
   */
  static setupViewport(width: number = 1024, height: number = 768) {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: height,
    });
    
    // Trigger resize event
    window.dispatchEvent(new Event('resize'));
  }

  /**
   * Wait for async operations to complete
   */
  static async waitForAsyncOperations() {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * Simulate network delay
   */
  static async simulateNetworkDelay(ms: number = 100) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create performance measurement utility
   */
  static createPerformanceMeasurement() {
    const startTime = performance.now();
    
    return {
      measure: () => performance.now() - startTime,
      expectUnder: (threshold: number) => {
        const duration = performance.now() - startTime;
        expect(duration).toBeLessThan(threshold);
        return duration;
      }
    };
  }

  /**
   * Setup accessibility testing
   */
  static setupAccessibilityTesting() {
    // Add custom matchers for accessibility
    expect.extend({
      toHaveAccessibleName(received, expected) {
        const accessibleName = received.getAttribute('aria-label') || 
                              received.getAttribute('aria-labelledby') ||
                              received.textContent;
        
        const pass = accessibleName === expected;
        
        return {
          message: () => 
            `expected element to have accessible name "${expected}" but got "${accessibleName}"`,
          pass
        };
      },
      
      toBeAccessible(received) {
        const hasRole = received.hasAttribute('role');
        const hasAriaLabel = received.hasAttribute('aria-label') || 
                           received.hasAttribute('aria-labelledby');
        const isInteractive = ['button', 'link', 'input'].includes(received.tagName.toLowerCase());
        
        const pass = !isInteractive || (hasRole && hasAriaLabel);
        
        return {
          message: () => 
            `expected element to be accessible (have proper role and labels)`,
          pass
        };
      }
    });
  }

  /**
   * Cleanup test environment
   */
  static cleanup() {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    
    // Reset DOM
    document.body.innerHTML = '';
    
    // Clear any timers
    jest.clearAllTimers();
  }
}

// Export commonly used test data
export const TEST_ROLES = [
  UserRole.STUDENT,
  UserRole.TEACHER,
  UserRole.DEPARTMENT_ADMIN,
  UserRole.INSTITUTION_ADMIN,
  UserRole.SYSTEM_ADMIN
];

export const TEST_INSTITUTIONS = OnboardingTestDataGenerator.createMockInstitutions(5);
export const TEST_CLASSES = OnboardingTestDataGenerator.createMockClasses(10);

// Common test scenarios
export const ONBOARDING_SCENARIOS = {
  STUDENT_COMPLETE: OnboardingTestDataGenerator.createCompleteOnboardingScenario(UserRole.STUDENT),
  TEACHER_COMPLETE: OnboardingTestDataGenerator.createCompleteOnboardingScenario(UserRole.TEACHER),
  ADMIN_COMPLETE: OnboardingTestDataGenerator.createCompleteOnboardingScenario(UserRole.INSTITUTION_ADMIN)
};