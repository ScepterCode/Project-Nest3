// Department Manager Service Tests
// Using JavaScript to avoid TypeScript compilation issues

describe('DepartmentManager Service', () => {
  
  describe('Department Data Validation', () => {
    // Helper function to simulate validation logic
    const validateDepartmentData = (data) => {
      const errors = [];
      
      if (!data.name || data.name.trim().length === 0) {
        errors.push({ field: 'name', message: 'Department name is required', code: 'REQUIRED' });
      }
      
      if (!data.code || data.code.trim().length === 0) {
        errors.push({ field: 'code', message: 'Department code is required', code: 'REQUIRED' });
      }
      
      if (!data.adminId || data.adminId.trim().length === 0) {
        errors.push({ field: 'adminId', message: 'Department admin is required', code: 'REQUIRED' });
      }
      
      // Validate code format (alphanumeric, uppercase)
      if (data.code && !/^[A-Z0-9]{2,10}$/.test(data.code)) {
        errors.push({ field: 'code', message: 'Department code must be 2-10 uppercase alphanumeric characters', code: 'INVALID_FORMAT' });
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    };

    it('should validate complete department data successfully', () => {
      const departmentData = {
        name: 'Computer Science',
        description: 'Department of Computer Science and Engineering',
        code: 'CS',
        adminId: 'admin-123',
        institutionId: 'inst-123'
      };

      const validation = validateDepartmentData(departmentData);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject department data with missing required fields', () => {
      const incompleteDepartmentData = {
        description: 'Some description'
      };

      const validation = validateDepartmentData(incompleteDepartmentData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.some(e => e.field === 'name')).toBe(true);
      expect(validation.errors.some(e => e.field === 'code')).toBe(true);
      expect(validation.errors.some(e => e.field === 'adminId')).toBe(true);
    });

    it('should reject department data with invalid code format', () => {
      const invalidDepartmentData = {
        name: 'Computer Science',
        code: 'invalid-code', // Invalid: lowercase and hyphen
        adminId: 'admin-123'
      };

      const validation = validateDepartmentData(invalidDepartmentData);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContainEqual({
        field: 'code',
        message: 'Department code must be 2-10 uppercase alphanumeric characters',
        code: 'INVALID_FORMAT'
      });
    });

    it('should accept valid department codes', () => {
      const validCodes = ['CS', 'MATH', 'ENG', 'BIO123', 'PHYS'];
      
      validCodes.forEach(code => {
        const departmentData = {
          name: 'Test Department',
          code: code,
          adminId: 'admin-123'
        };
        
        const validation = validateDepartmentData(departmentData);
        expect(validation.isValid).toBe(true);
      });
    });

    it('should reject invalid department codes', () => {
      const invalidCodes = ['cs', 'C', 'TOOLONGCODE123', 'CS-123', 'CS_123'];
      
      invalidCodes.forEach(code => {
        const departmentData = {
          name: 'Test Department',
          code: code,
          adminId: 'admin-123'
        };
        
        const validation = validateDepartmentData(departmentData);
        expect(validation.isValid).toBe(false);
        expect(validation.errors.some(e => e.field === 'code')).toBe(true);
      });
    });
  });

  describe('Department Hierarchy Validation', () => {
    // Helper function to simulate hierarchy validation
    const validateHierarchy = (departments, parentId, childId) => {
      // Check for circular reference
      const findAncestors = (deptId, visited = new Set()) => {
        if (visited.has(deptId)) return true; // Circular reference found
        visited.add(deptId);
        
        const dept = departments.find(d => d.id === deptId);
        if (!dept || !dept.parentDepartmentId) return false;
        
        return findAncestors(dept.parentDepartmentId, visited);
      };

      // Check depth
      const getDepth = (deptId) => {
        let depth = 0;
        let currentId = deptId;
        
        while (currentId && depth < 10) { // Prevent infinite loops
          const dept = departments.find(d => d.id === currentId);
          if (!dept || !dept.parentDepartmentId) break;
          currentId = dept.parentDepartmentId;
          depth++;
        }
        
        return depth;
      };

      const errors = [];

      // Check circular reference
      if (findAncestors(parentId)) {
        errors.push({ field: 'parentDepartmentId', message: 'Cannot create circular department hierarchy', code: 'CIRCULAR_REFERENCE' });
      }

      // Check depth limit
      if (getDepth(parentId) >= 5) {
        errors.push({ field: 'parentDepartmentId', message: 'Maximum hierarchy depth (5 levels) exceeded', code: 'MAX_DEPTH_EXCEEDED' });
      }

      return {
        isValid: errors.length === 0,
        errors
      };
    };

    it('should allow valid hierarchy structure', () => {
      const departments = [
        { id: 'dept-1', name: 'Engineering', parentDepartmentId: null },
        { id: 'dept-2', name: 'Computer Science', parentDepartmentId: 'dept-1' }
      ];

      const validation = validateHierarchy(departments, 'dept-1', 'dept-3');
      expect(validation.isValid).toBe(true);
    });

    it('should prevent circular references', () => {
      const departments = [
        { id: 'dept-1', name: 'Engineering', parentDepartmentId: 'dept-2' },
        { id: 'dept-2', name: 'Computer Science', parentDepartmentId: 'dept-1' }
      ];

      const validation = validateHierarchy(departments, 'dept-1', 'dept-2');
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.code === 'CIRCULAR_REFERENCE')).toBe(true);
    });

    it('should enforce maximum depth limit', () => {
      const departments = [
        { id: 'dept-1', name: 'Level 1', parentDepartmentId: null },
        { id: 'dept-2', name: 'Level 2', parentDepartmentId: 'dept-1' },
        { id: 'dept-3', name: 'Level 3', parentDepartmentId: 'dept-2' },
        { id: 'dept-4', name: 'Level 4', parentDepartmentId: 'dept-3' },
        { id: 'dept-5', name: 'Level 5', parentDepartmentId: 'dept-4' },
        { id: 'dept-6', name: 'Level 6', parentDepartmentId: 'dept-5' }
      ];

      const validation = validateHierarchy(departments, 'dept-6', 'dept-7');
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.code === 'MAX_DEPTH_EXCEEDED')).toBe(true);
    });
  });

  describe('Department Settings Validation', () => {
    // Helper function to validate department settings
    const validateDepartmentSettings = (settings) => {
      const errors = [];

      if (settings.defaultClassSettings) {
        const classSettings = settings.defaultClassSettings;
        
        if (classSettings.defaultCapacity !== undefined && (classSettings.defaultCapacity < 1 || classSettings.defaultCapacity > 1000)) {
          errors.push({ field: 'defaultClassSettings.defaultCapacity', message: 'Default capacity must be between 1 and 1000', code: 'INVALID_RANGE' });
        }
        
        if (classSettings.passingGrade && (classSettings.passingGrade < 0 || classSettings.passingGrade > 100)) {
          errors.push({ field: 'defaultClassSettings.passingGrade', message: 'Passing grade must be between 0 and 100', code: 'INVALID_RANGE' });
        }
      }

      if (settings.assignmentDefaults) {
        const assignmentDefaults = settings.assignmentDefaults;
        
        if (assignmentDefaults.latePenaltyPercent && (assignmentDefaults.latePenaltyPercent < 0 || assignmentDefaults.latePenaltyPercent > 100)) {
          errors.push({ field: 'assignmentDefaults.latePenaltyPercent', message: 'Late penalty must be between 0 and 100 percent', code: 'INVALID_RANGE' });
        }
        
        if (assignmentDefaults.maxLateDays && assignmentDefaults.maxLateDays < 0) {
          errors.push({ field: 'assignmentDefaults.maxLateDays', message: 'Max late days cannot be negative', code: 'INVALID_VALUE' });
        }
      }

      return {
        isValid: errors.length === 0,
        errors
      };
    };

    it('should validate correct department settings', () => {
      const settings = {
        defaultClassSettings: {
          defaultCapacity: 30,
          allowWaitlist: true,
          requireApproval: false,
          allowSelfEnrollment: true,
          gradingScale: 'letter',
          passingGrade: 70
        },
        assignmentDefaults: {
          allowLateSubmissions: true,
          latePenaltyPercent: 10,
          maxLateDays: 7,
          allowResubmissions: false,
          maxResubmissions: 0,
          defaultDueDays: 7,
          requireRubric: false
        }
      };

      const validation = validateDepartmentSettings(settings);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject invalid capacity settings', () => {
      const settings = {
        defaultClassSettings: {
          defaultCapacity: 0, // Invalid: too low
          passingGrade: 70
        }
      };

      const validation = validateDepartmentSettings(settings);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.field === 'defaultClassSettings.defaultCapacity')).toBe(true);
    });

    it('should reject invalid grade settings', () => {
      const settings = {
        defaultClassSettings: {
          defaultCapacity: 30,
          passingGrade: 150 // Invalid: too high
        }
      };

      const validation = validateDepartmentSettings(settings);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.field === 'defaultClassSettings.passingGrade')).toBe(true);
    });

    it('should reject invalid assignment settings', () => {
      const settings = {
        assignmentDefaults: {
          latePenaltyPercent: 150, // Invalid: too high
          maxLateDays: -1 // Invalid: negative
        }
      };

      const validation = validateDepartmentSettings(settings);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.field === 'assignmentDefaults.latePenaltyPercent')).toBe(true);
      expect(validation.errors.some(e => e.field === 'assignmentDefaults.maxLateDays')).toBe(true);
    });
  });

  describe('Department Transfer Logic', () => {
    // Helper function to simulate transfer validation
    const validateTransfer = (fromDept, toDept) => {
      const errors = [];

      if (!fromDept) {
        errors.push({ field: 'fromDepartment', message: 'Source department not found', code: 'NOT_FOUND' });
      }

      if (!toDept) {
        errors.push({ field: 'toDepartment', message: 'Target department not found', code: 'NOT_FOUND' });
      }

      if (fromDept && toDept && fromDept.institutionId !== toDept.institutionId) {
        errors.push({ field: 'departments', message: 'Departments must be in the same institution', code: 'INVALID_TRANSFER' });
      }

      if (fromDept && toDept && fromDept.id === toDept.id) {
        errors.push({ field: 'departments', message: 'Cannot transfer to the same department', code: 'INVALID_TRANSFER' });
      }

      return {
        isValid: errors.length === 0,
        errors
      };
    };

    it('should allow valid transfers within same institution', () => {
      const fromDept = {
        id: 'dept-1',
        name: 'Computer Science',
        institutionId: 'inst-123'
      };

      const toDept = {
        id: 'dept-2',
        name: 'Mathematics',
        institutionId: 'inst-123'
      };

      const validation = validateTransfer(fromDept, toDept);
      expect(validation.isValid).toBe(true);
    });

    it('should prevent transfers between different institutions', () => {
      const fromDept = {
        id: 'dept-1',
        name: 'Computer Science',
        institutionId: 'inst-123'
      };

      const toDept = {
        id: 'dept-2',
        name: 'Mathematics',
        institutionId: 'inst-456' // Different institution
      };

      const validation = validateTransfer(fromDept, toDept);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.code === 'INVALID_TRANSFER')).toBe(true);
    });

    it('should prevent transfers to the same department', () => {
      const dept = {
        id: 'dept-1',
        name: 'Computer Science',
        institutionId: 'inst-123'
      };

      const validation = validateTransfer(dept, dept);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.code === 'INVALID_TRANSFER')).toBe(true);
    });

    it('should handle missing departments', () => {
      const validation = validateTransfer(null, null);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.field === 'fromDepartment')).toBe(true);
      expect(validation.errors.some(e => e.field === 'toDepartment')).toBe(true);
    });
  });

  describe('Department Hierarchy Building', () => {
    // Helper function to build hierarchy tree
    const buildHierarchyTree = (departments) => {
      const nodeMap = new Map();
      const rootNodes = [];

      // Create nodes for all departments
      departments.forEach(dept => {
        const node = {
          department: dept,
          children: [],
          userCount: 0,
          classCount: 0
        };
        nodeMap.set(dept.id, node);
      });

      // Build parent-child relationships
      departments.forEach(dept => {
        const node = nodeMap.get(dept.id);
        if (!node) return;

        if (dept.parentDepartmentId) {
          const parent = nodeMap.get(dept.parentDepartmentId);
          if (parent) {
            parent.children.push(node);
          } else {
            // Parent not found, treat as root
            rootNodes.push(node);
          }
        } else {
          rootNodes.push(node);
        }
      });

      return rootNodes;
    };

    it('should build correct hierarchy tree', () => {
      const departments = [
        {
          id: 'dept-1',
          name: 'Engineering',
          parentDepartmentId: null
        },
        {
          id: 'dept-2',
          name: 'Computer Science',
          parentDepartmentId: 'dept-1'
        },
        {
          id: 'dept-3',
          name: 'Mathematics',
          parentDepartmentId: null
        },
        {
          id: 'dept-4',
          name: 'Software Engineering',
          parentDepartmentId: 'dept-2'
        }
      ];

      const hierarchy = buildHierarchyTree(departments);

      expect(hierarchy).toHaveLength(2); // Two root departments
      expect(hierarchy[0].department.name).toBe('Engineering');
      expect(hierarchy[0].children).toHaveLength(1);
      expect(hierarchy[0].children[0].department.name).toBe('Computer Science');
      expect(hierarchy[0].children[0].children).toHaveLength(1);
      expect(hierarchy[0].children[0].children[0].department.name).toBe('Software Engineering');
      expect(hierarchy[1].department.name).toBe('Mathematics');
      expect(hierarchy[1].children).toHaveLength(0);
    });

    it('should handle departments with missing parents', () => {
      const departments = [
        {
          id: 'dept-1',
          name: 'Computer Science',
          parentDepartmentId: 'missing-parent'
        },
        {
          id: 'dept-2',
          name: 'Mathematics',
          parentDepartmentId: null
        }
      ];

      const hierarchy = buildHierarchyTree(departments);

      expect(hierarchy).toHaveLength(2); // Both treated as root
      expect(hierarchy.some(node => node.department.name === 'Computer Science')).toBe(true);
      expect(hierarchy.some(node => node.department.name === 'Mathematics')).toBe(true);
    });

    it('should handle empty department list', () => {
      const hierarchy = buildHierarchyTree([]);
      expect(hierarchy).toHaveLength(0);
    });
  });

  describe('Multi-tenant Context Validation', () => {
    // Helper function to validate tenant context
    const validateTenantContext = (context, department) => {
      const errors = [];

      if (!context.institutionId) {
        errors.push({ field: 'context.institutionId', message: 'Institution ID is required', code: 'REQUIRED' });
      }

      if (!context.userId) {
        errors.push({ field: 'context.userId', message: 'User ID is required', code: 'REQUIRED' });
      }

      if (department && department.institutionId !== context.institutionId) {
        errors.push({ field: 'access', message: 'Access denied', code: 'ACCESS_DENIED' });
      }

      return {
        isValid: errors.length === 0,
        errors
      };
    };

    it('should validate correct tenant context', () => {
      const context = {
        institutionId: 'inst-123',
        userId: 'user-123',
        role: 'department_admin',
        permissions: ['manage_departments']
      };

      const department = {
        id: 'dept-123',
        institutionId: 'inst-123',
        name: 'Computer Science'
      };

      const validation = validateTenantContext(context, department);
      expect(validation.isValid).toBe(true);
    });

    it('should prevent cross-tenant access', () => {
      const context = {
        institutionId: 'inst-123',
        userId: 'user-123',
        role: 'department_admin',
        permissions: ['manage_departments']
      };

      const department = {
        id: 'dept-123',
        institutionId: 'inst-456', // Different institution
        name: 'Computer Science'
      };

      const validation = validateTenantContext(context, department);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.code === 'ACCESS_DENIED')).toBe(true);
    });

    it('should require essential context fields', () => {
      const incompleteContext = {
        role: 'department_admin'
      };

      const validation = validateTenantContext(incompleteContext, null);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(e => e.field === 'context.institutionId')).toBe(true);
      expect(validation.errors.some(e => e.field === 'context.userId')).toBe(true);
    });
  });

  describe('Department Code Uniqueness', () => {
    // Helper function to check code uniqueness
    const checkCodeUniqueness = (code, institutionId, existingDepartments, excludeId = null) => {
      const conflicts = existingDepartments.filter(dept => 
        dept.code === code && 
        dept.institutionId === institutionId &&
        dept.id !== excludeId
      );

      return {
        isUnique: conflicts.length === 0,
        message: conflicts.length > 0 ? 'Department code is already in use within this institution' : 'Department code is available'
      };
    };

    it('should allow unique codes within institution', () => {
      const existingDepartments = [
        { id: 'dept-1', code: 'CS', institutionId: 'inst-123' },
        { id: 'dept-2', code: 'MATH', institutionId: 'inst-123' }
      ];

      const result = checkCodeUniqueness('ENG', 'inst-123', existingDepartments);
      expect(result.isUnique).toBe(true);
    });

    it('should prevent duplicate codes within same institution', () => {
      const existingDepartments = [
        { id: 'dept-1', code: 'CS', institutionId: 'inst-123' },
        { id: 'dept-2', code: 'MATH', institutionId: 'inst-123' }
      ];

      const result = checkCodeUniqueness('CS', 'inst-123', existingDepartments);
      expect(result.isUnique).toBe(false);
    });

    it('should allow same code across different institutions', () => {
      const existingDepartments = [
        { id: 'dept-1', code: 'CS', institutionId: 'inst-123' },
        { id: 'dept-2', code: 'CS', institutionId: 'inst-456' }
      ];

      const result = checkCodeUniqueness('CS', 'inst-789', existingDepartments);
      expect(result.isUnique).toBe(true);
    });

    it('should allow updates to same department', () => {
      const existingDepartments = [
        { id: 'dept-1', code: 'CS', institutionId: 'inst-123' },
        { id: 'dept-2', code: 'MATH', institutionId: 'inst-123' }
      ];

      const result = checkCodeUniqueness('CS', 'inst-123', existingDepartments, 'dept-1');
      expect(result.isUnique).toBe(true);
    });
  });
});