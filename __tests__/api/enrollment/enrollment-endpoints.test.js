const fs = require('fs');
const path = require('path');

describe('Enrollment API Endpoints', () => {
  const apiBasePath = path.join(process.cwd(), 'app', 'api');

  describe('Enrollment Management Endpoints', () => {
    it('should have main enrollments endpoint', () => {
      const enrollmentsPath = path.join(apiBasePath, 'enrollments', 'route.ts');
      expect(fs.existsSync(enrollmentsPath)).toBe(true);
      
      const content = fs.readFileSync(enrollmentsPath, 'utf8');
      expect(content).toContain('export async function POST');
      expect(content).toContain('export async function GET');
      expect(content).toContain('EnrollmentManager');
    });

    it('should have bulk enrollment endpoint', () => {
      const bulkPath = path.join(apiBasePath, 'enrollments', 'bulk', 'route.ts');
      expect(fs.existsSync(bulkPath)).toBe(true);
      
      const content = fs.readFileSync(bulkPath, 'utf8');
      expect(content).toContain('export async function POST');
      expect(content).toContain('bulkEnroll');
    });

    it('should have individual enrollment endpoint', () => {
      const idPath = path.join(apiBasePath, 'enrollments', '[id]', 'route.ts');
      expect(fs.existsSync(idPath)).toBe(true);
      
      const content = fs.readFileSync(idPath, 'utf8');
      expect(content).toContain('export async function DELETE');
      expect(content).toContain('export async function GET');
    });
  });

  describe('Class Discovery Endpoints', () => {
    it('should have class search endpoint', () => {
      const searchPath = path.join(apiBasePath, 'classes', 'search', 'route.ts');
      expect(fs.existsSync(searchPath)).toBe(true);
      
      const content = fs.readFileSync(searchPath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('ClassDiscoveryService');
      expect(content).toContain('searchClasses');
    });

    it('should have available classes endpoint', () => {
      const availablePath = path.join(apiBasePath, 'classes', 'available', 'route.ts');
      expect(fs.existsSync(availablePath)).toBe(true);
      
      const content = fs.readFileSync(availablePath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('getAvailableClasses');
    });

    it('should have class details endpoint', () => {
      const detailsPath = path.join(apiBasePath, 'classes', '[id]', 'details', 'route.ts');
      expect(fs.existsSync(detailsPath)).toBe(true);
      
      const content = fs.readFileSync(detailsPath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('getClassDetails');
      expect(content).toContain('checkEnrollmentEligibility');
    });
  });

  describe('Waitlist Management Endpoints', () => {
    it('should have main waitlists endpoint', () => {
      const waitlistsPath = path.join(apiBasePath, 'waitlists', 'route.ts');
      expect(fs.existsSync(waitlistsPath)).toBe(true);
      
      const content = fs.readFileSync(waitlistsPath, 'utf8');
      expect(content).toContain('export async function POST');
      expect(content).toContain('export async function GET');
      expect(content).toContain('WaitlistManager');
    });

    it('should have class-specific waitlist join endpoint', () => {
      const joinPath = path.join(apiBasePath, 'waitlists', '[classId]', 'join', 'route.ts');
      expect(fs.existsSync(joinPath)).toBe(true);
      
      const content = fs.readFileSync(joinPath, 'utf8');
      expect(content).toContain('export async function POST');
      expect(content).toContain('addToWaitlist');
    });

    it('should have waitlist position endpoint', () => {
      const positionPath = path.join(apiBasePath, 'waitlists', '[classId]', 'position', 'route.ts');
      expect(fs.existsSync(positionPath)).toBe(true);
      
      const content = fs.readFileSync(positionPath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('getWaitlistPosition');
      expect(content).toContain('estimateEnrollmentProbability');
    });
  });

  describe('Class Configuration Endpoints', () => {
    it('should have enrollment config endpoint', () => {
      const configPath = path.join(apiBasePath, 'classes', '[id]', 'enrollment-config', 'route.ts');
      expect(fs.existsSync(configPath)).toBe(true);
      
      const content = fs.readFileSync(configPath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('export async function PUT');
      expect(content).toContain('enrollmentConfigService');
    });

    it('should have prerequisites endpoints', () => {
      const prereqPath = path.join(apiBasePath, 'classes', '[id]', 'prerequisites', 'route.ts');
      expect(fs.existsSync(prereqPath)).toBe(true);
      
      const content = fs.readFileSync(prereqPath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('export async function POST');
      expect(content).toContain('getPrerequisites');
      expect(content).toContain('addPrerequisite');

      const prereqIdPath = path.join(apiBasePath, 'classes', '[id]', 'prerequisites', '[prerequisiteId]', 'route.ts');
      expect(fs.existsSync(prereqIdPath)).toBe(true);
      
      const idContent = fs.readFileSync(prereqIdPath, 'utf8');
      expect(idContent).toContain('export async function DELETE');
      expect(idContent).toContain('export async function PUT');
    });

    it('should have restrictions endpoints', () => {
      const restrictPath = path.join(apiBasePath, 'classes', '[id]', 'restrictions', 'route.ts');
      expect(fs.existsSync(restrictPath)).toBe(true);
      
      const content = fs.readFileSync(restrictPath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('export async function POST');
      expect(content).toContain('getRestrictions');
      expect(content).toContain('addRestriction');

      const restrictIdPath = path.join(apiBasePath, 'classes', '[id]', 'restrictions', '[restrictionId]', 'route.ts');
      expect(fs.existsSync(restrictIdPath)).toBe(true);
      
      const idContent = fs.readFileSync(restrictIdPath, 'utf8');
      expect(idContent).toContain('export async function DELETE');
      expect(idContent).toContain('export async function PUT');
    });
  });

  describe('Roster Management Endpoints', () => {
    it('should have class roster endpoint', () => {
      const rosterPath = path.join(apiBasePath, 'classes', '[id]', 'roster', 'route.ts');
      expect(fs.existsSync(rosterPath)).toBe(true);
      
      const content = fs.readFileSync(rosterPath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('TeacherRosterService');
      expect(content).toContain('getClassRoster');
    });

    it('should have roster export endpoint', () => {
      const exportPath = path.join(apiBasePath, 'classes', '[id]', 'roster', 'export', 'route.ts');
      expect(fs.existsSync(exportPath)).toBe(true);
      
      const content = fs.readFileSync(exportPath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('exportRoster');
    });
  });

  describe('Invitation Management Endpoints', () => {
    it('should have class invitations endpoint', () => {
      const invitePath = path.join(apiBasePath, 'classes', '[id]', 'invitations', 'route.ts');
      expect(fs.existsSync(invitePath)).toBe(true);
      
      const content = fs.readFileSync(invitePath, 'utf8');
      expect(content).toContain('export async function POST');
      expect(content).toContain('export async function GET');
      expect(content).toContain('InvitationManager');
    });

    it('should have invitation acceptance endpoint', () => {
      const acceptPath = path.join(apiBasePath, 'invitations', '[token]', 'route.ts');
      expect(fs.existsSync(acceptPath)).toBe(true);
      
      const content = fs.readFileSync(acceptPath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('export async function POST');
      expect(content).toContain('acceptInvitation');
    });
  });

  describe('Analytics and Reporting Endpoints', () => {
    it('should have existing enrollment analytics endpoint', () => {
      const analyticsPath = path.join(apiBasePath, 'enrollment', 'analytics', 'route.ts');
      expect(fs.existsSync(analyticsPath)).toBe(true);
      
      const content = fs.readFileSync(analyticsPath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('EnrollmentAnalyticsService');
    });

    it('should have existing enrollment conflicts endpoint', () => {
      const conflictsPath = path.join(apiBasePath, 'enrollment', 'conflicts', 'route.ts');
      expect(fs.existsSync(conflictsPath)).toBe(true);
      
      const content = fs.readFileSync(conflictsPath, 'utf8');
      expect(content).toContain('export async function GET');
      expect(content).toContain('export async function POST');
      expect(content).toContain('EnrollmentConflictResolver');
    });
  });

  describe('API Endpoint Structure Validation', () => {
    it('should have proper authentication checks in all endpoints', () => {
      const endpointFiles = [
        'enrollments/route.ts',
        'enrollments/bulk/route.ts',
        'enrollments/[id]/route.ts',
        'classes/search/route.ts',
        'classes/available/route.ts',
        'waitlists/route.ts',
        'waitlists/[classId]/join/route.ts'
      ];

      endpointFiles.forEach(file => {
        const filePath = path.join(apiBasePath, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          expect(content).toContain('supabase.auth.getUser()');
          expect(content).toContain('Unauthorized');
        }
      });
    });

    it('should have proper error handling in all endpoints', () => {
      const endpointFiles = [
        'enrollments/route.ts',
        'enrollments/bulk/route.ts',
        'classes/search/route.ts',
        'waitlists/route.ts'
      ];

      endpointFiles.forEach(file => {
        const filePath = path.join(apiBasePath, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          expect(content).toContain('try {');
          expect(content).toContain('catch (error)');
          expect(content).toContain('console.error');
          expect(content).toContain('status: 500');
        }
      });
    });

    it('should have proper permission checks for admin operations', () => {
      const adminEndpointFiles = [
        'enrollments/bulk/route.ts',
        'classes/[id]/enrollment-config/route.ts',
        'classes/[id]/prerequisites/route.ts',
        'classes/[id]/restrictions/route.ts',
        'classes/[id]/roster/route.ts',
        'classes/[id]/invitations/route.ts'
      ];

      adminEndpointFiles.forEach(file => {
        const filePath = path.join(apiBasePath, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          expect(content).toContain('isTeacher') || expect(content).toContain('isAdmin');
          expect(content).toContain('Forbidden');
          expect(content).toContain('status: 403');
        }
      });
    });
  });
});