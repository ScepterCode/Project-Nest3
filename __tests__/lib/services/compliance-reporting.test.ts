import { ComplianceReportingService } from '@/lib/services/compliance-reporting';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}));

// Mock the compliance services
jest.mock('@/lib/services/gdpr-compliance', () => ({
  GDPRComplianceService: jest.fn().mockImplementation(() => ({
    conductGDPRAssessment: jest.fn().mockResolvedValue({
      institutionId: 'test-institution',
      assessmentDate: new Date(),
      overallCompliance: 85,
      riskLevel: 'medium',
      findings: [
        {
          category: 'Data Processing',
          compliant: true,
          issues: [],
          recommendations: []
        },
        {
          category: 'Consent Management',
          compliant: false,
          issues: ['Missing consent records'],
          recommendations: ['Implement consent tracking']
        }
      ]
    })
  }))
}));

jest.mock('@/lib/services/ferpa-compliance', () => ({
  FERPAComplianceService: jest.fn().mockImplementation(() => ({
    conductFERPAAssessment: jest.fn().mockResolvedValue({
      institutionId: 'test-institution',
      assessmentDate: new Date(),
      overallCompliance: 90,
      riskLevel: 'low',
      findings: [
        {
          category: 'Educational Records',
          compliant: true,
          issues: [],
          recommendations: []
        }
      ]
    })
  }))
}));

jest.mock('@/lib/services/audit-logger', () => ({
  AuditLogger: jest.fn().mockImplementation(() => ({
    logComplianceAction: jest.fn().mockResolvedValue('audit-id')
  }))
}));

describe('ComplianceReportingService', () => {
  let service: ComplianceReportingService;
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null })
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    service = new ComplianceReportingService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateComplianceAssessment', () => {
    it('should generate GDPR compliance assessment report', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const report = await service.generateComplianceAssessment(
        'test-institution',
        'gdpr',
        'compliance-officer'
      );

      expect(report).toBeDefined();
      expect(report.reportType).toBe('assessment');
      expect(report.title).toBe('GDPR Compliance Assessment');
      expect(report.institutionId).toBe('test-institution');
      expect(report.generatedBy).toBe('compliance-officer');
      expect(report.findings).toHaveLength(2);
      expect(report.recommendations).toHaveLength(1);
      expect(report.executiveSummary).toContain('GDPR Compliance Assessment Summary');
    });

    it('should generate FERPA compliance assessment report', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const report = await service.generateComplianceAssessment(
        'test-institution',
        'ferpa',
        'compliance-officer'
      );

      expect(report).toBeDefined();
      expect(report.reportType).toBe('assessment');
      expect(report.title).toBe('FERPA Compliance Assessment');
      expect(report.institutionId).toBe('test-institution');
      expect(report.findings).toHaveLength(1);
      expect(report.executiveSummary).toContain('FERPA Compliance Assessment Summary');
    });

    it('should throw error for unsupported certification type', async () => {
      await expect(
        service.generateComplianceAssessment(
          'test-institution',
          'unsupported' as any,
          'compliance-officer'
        )
      ).rejects.toThrow('Unsupported certification type: unsupported');
    });

    it('should handle database errors when storing report', async () => {
      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.generateComplianceAssessment(
          'test-institution',
          'gdpr',
          'compliance-officer'
        )
      ).rejects.toThrow('Failed to store compliance report: Database error');
    });
  });

  describe('createComplianceCertification', () => {
    it('should create GDPR compliance certification', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const certification = await service.createComplianceCertification(
        'test-institution',
        'gdpr',
        'compliance-officer'
      );

      expect(certification).toBeDefined();
      expect(certification.institutionId).toBe('test-institution');
      expect(certification.certificationType).toBe('gdpr');
      expect(certification.status).toBe('in_progress');
      expect(certification.complianceScore).toBe(0);
      expect(certification.requirements).toHaveLength(5);
      expect(certification.evidence).toHaveLength(0);
      expect(certification.gaps).toHaveLength(0);
    });

    it('should create FERPA compliance certification', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const certification = await service.createComplianceCertification(
        'test-institution',
        'ferpa',
        'compliance-officer'
      );

      expect(certification).toBeDefined();
      expect(certification.certificationType).toBe('ferpa');
      expect(certification.requirements).toHaveLength(5);
      expect(certification.requirements[0].category).toBe('Educational Records');
      expect(certification.requirements[1].category).toBe('Directory Information');
    });

    it('should handle database errors when storing certification', async () => {
      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.createComplianceCertification(
          'test-institution',
          'gdpr',
          'compliance-officer'
        )
      ).rejects.toThrow('Failed to store compliance certification: Database error');
    });
  });

  describe('updateComplianceRequirement', () => {
    it('should update compliance requirement status', async () => {
      mockSupabase.update.mockResolvedValue({ error: null });
      mockSupabase.select.mockResolvedValue({ 
        data: [
          { status: 'met', mandatory: true },
          { status: 'not_met', mandatory: true }
        ], 
        error: null 
      });

      await service.updateComplianceRequirement(
        'cert-id',
        'req-id',
        'met',
        ['evidence1', 'evidence2'],
        'Requirement has been met',
        'compliance-officer'
      );

      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'met',
        evidence: ['evidence1', 'evidence2'],
        notes: 'Requirement has been met',
        last_verified: expect.any(String),
        verified_by: 'compliance-officer',
        updated_at: expect.any(String)
      });
    });

    it('should handle database errors when updating requirement', async () => {
      mockSupabase.update.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.updateComplianceRequirement(
          'cert-id',
          'req-id',
          'met',
          ['evidence1'],
          'Notes',
          'officer'
        )
      ).rejects.toThrow('Failed to update compliance requirement: Database error');
    });
  });

  describe('uploadComplianceEvidence', () => {
    it('should upload compliance evidence', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const evidence = await service.uploadComplianceEvidence(
        'cert-id',
        'req-id',
        {
          type: 'document',
          title: 'Policy Document',
          description: 'Data protection policy',
          filePath: '/path/to/file.pdf',
          verified: false
        },
        'compliance-officer'
      );

      expect(evidence).toBeDefined();
      expect(evidence.requirementId).toBe('req-id');
      expect(evidence.type).toBe('document');
      expect(evidence.title).toBe('Policy Document');
      expect(evidence.uploadedBy).toBe('compliance-officer');
      expect(evidence.verified).toBe(false);
    });

    it('should handle database errors when uploading evidence', async () => {
      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.uploadComplianceEvidence(
          'cert-id',
          'req-id',
          {
            type: 'document',
            title: 'Test',
            description: 'Test',
            verified: false
          },
          'officer'
        )
      ).rejects.toThrow('Failed to upload compliance evidence: Database error');
    });
  });

  describe('verifyComplianceEvidence', () => {
    it('should verify compliance evidence', async () => {
      mockSupabase.update.mockResolvedValue({ error: null });

      await service.verifyComplianceEvidence(
        'evidence-id',
        true,
        'compliance-officer',
        'Evidence verified successfully'
      );

      expect(mockSupabase.update).toHaveBeenCalledWith({
        verified: true,
        verified_by: 'compliance-officer',
        verified_at: expect.any(String),
        notes: 'Evidence verified successfully'
      });
    });

    it('should handle database errors when verifying evidence', async () => {
      mockSupabase.update.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.verifyComplianceEvidence(
          'evidence-id',
          true,
          'officer'
        )
      ).rejects.toThrow('Failed to verify compliance evidence: Database error');
    });
  });

  describe('identifyComplianceGaps', () => {
    it('should identify compliance gaps', async () => {
      mockSupabase.select.mockResolvedValue({
        data: {
          compliance_requirements: [
            {
              id: 'req1',
              requirement: 'Test requirement 1',
              status: 'not_met',
              mandatory: true
            },
            {
              id: 'req2',
              requirement: 'Test requirement 2',
              status: 'partially_met',
              mandatory: false
            },
            {
              id: 'req3',
              requirement: 'Test requirement 3',
              status: 'met',
              mandatory: true
            }
          ]
        },
        error: null
      });

      mockSupabase.insert.mockResolvedValue({ error: null });

      const gaps = await service.identifyComplianceGaps(
        'cert-id',
        'compliance-officer'
      );

      expect(gaps).toHaveLength(2);
      expect(gaps[0].severity).toBe('critical'); // mandatory not_met
      expect(gaps[1].severity).toBe('medium'); // non-mandatory partially_met
      expect(gaps[0].status).toBe('open');
      expect(gaps[1].status).toBe('open');
    });

    it('should handle database errors when fetching certification', async () => {
      mockSupabase.select.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.identifyComplianceGaps('cert-id', 'officer')
      ).rejects.toThrow('Failed to fetch certification: Database error');
    });
  });

  describe('generateRemediationPlan', () => {
    it('should generate remediation plan', async () => {
      mockSupabase.select
        .mockResolvedValueOnce({
          data: [
            {
              id: 'gap1',
              description: 'Critical gap',
              severity: 'critical',
              remediation: 'Fix critical issue',
              estimated_effort: '30-60 days'
            },
            {
              id: 'gap2',
              description: 'Medium gap',
              severity: 'medium',
              remediation: 'Fix medium issue',
              estimated_effort: '15-30 days'
            }
          ],
          error: null
        });

      mockSupabase.insert.mockResolvedValue({ error: null });

      const plan = await service.generateRemediationPlan(
        'cert-id',
        'compliance-officer'
      );

      expect(plan).toBeDefined();
      expect(plan.reportType).toBe('remediation');
      expect(plan.title).toBe('Compliance Remediation Plan');
      expect(plan.recommendations).toHaveLength(2);
      expect(plan.recommendations[0].priority).toBe('critical');
      expect(plan.recommendations[1].priority).toBe('medium');
      expect(plan.executiveSummary).toContain('Total Gaps Identified: 2');
      expect(plan.executiveSummary).toContain('Critical: 1');
    });
  });

  describe('getComplianceCertificationProgress', () => {
    it('should get certification progress', async () => {
      mockSupabase.select.mockResolvedValue({
        data: {
          compliance_requirements: [
            { category: 'Data Processing', status: 'met' },
            { category: 'Data Processing', status: 'not_met' },
            { category: 'Consent Management', status: 'met' },
            { category: 'Consent Management', status: 'partially_met' }
          ],
          compliance_gaps: [
            { severity: 'critical', target_date: '2024-12-31', description: 'Critical gap' },
            { severity: 'high', target_date: '2024-11-30', description: 'High gap' }
          ]
        },
        error: null
      });

      mockSupabase.select.mockResolvedValueOnce({
        data: [
          { timestamp: '2024-01-01', action: 'test_action' }
        ],
        error: null
      });

      const progress = await service.getComplianceCertificationProgress('cert-id');

      expect(progress).toBeDefined();
      expect(progress.overallProgress).toBe(50); // 2 out of 4 requirements met
      expect(progress.requirementProgress).toHaveLength(2);
      expect(progress.requirementProgress[0].category).toBe('Data Processing');
      expect(progress.requirementProgress[0].completed).toBe(1);
      expect(progress.requirementProgress[0].total).toBe(2);
      expect(progress.upcomingDeadlines).toHaveLength(2);
      expect(progress.riskAreas).toHaveLength(2);
    });

    it('should handle database errors when fetching progress', async () => {
      mockSupabase.select.mockResolvedValue({ 
        error: { message: 'Database error' } 
      });

      await expect(
        service.getComplianceCertificationProgress('cert-id')
      ).rejects.toThrow('Failed to fetch certification progress: Database error');
    });
  });

  describe('compliance requirement generation', () => {
    it('should generate correct GDPR requirements', async () => {
      const service = new ComplianceReportingService();
      const requirements = (service as any).getGDPRRequirements();

      expect(requirements).toHaveLength(5);
      expect(requirements[0].category).toBe('Data Processing');
      expect(requirements[0].requirement).toBe('Article 6 - Lawful basis for processing');
      expect(requirements[1].category).toBe('Data Subject Rights');
      expect(requirements[1].requirement).toBe('Article 15 - Right of access');
      expect(requirements[2].requirement).toBe('Article 17 - Right to erasure');
      expect(requirements[3].requirement).toBe('Article 32 - Security of processing');
      expect(requirements[4].requirement).toBe('Article 30 - Records of processing activities');
    });

    it('should generate correct FERPA requirements', async () => {
      const service = new ComplianceReportingService();
      const requirements = (service as any).getFERPARequirements();

      expect(requirements).toHaveLength(5);
      expect(requirements[0].category).toBe('Educational Records');
      expect(requirements[0].requirement).toBe('34 CFR 99.3 - Definition of education records');
      expect(requirements[1].category).toBe('Directory Information');
      expect(requirements[2].category).toBe('Disclosure');
      expect(requirements[3].category).toBe('Access Rights');
      expect(requirements[4].category).toBe('Consent');
    });
  });

  describe('gap severity determination', () => {
    it('should determine correct gap severity', () => {
      const service = new ComplianceReportingService();
      
      // Critical: mandatory not_met
      expect((service as any).determineGapSeverity({ mandatory: true, status: 'not_met' }))
        .toBe('critical');
      
      // High: mandatory partially_met
      expect((service as any).determineGapSeverity({ mandatory: true, status: 'partially_met' }))
        .toBe('high');
      
      // Medium: non-mandatory not_met
      expect((service as any).determineGapSeverity({ mandatory: false, status: 'not_met' }))
        .toBe('medium');
      
      // Low: non-mandatory partially_met
      expect((service as any).determineGapSeverity({ mandatory: false, status: 'partially_met' }))
        .toBe('low');
    });
  });
});