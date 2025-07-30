import { createClient } from '@/lib/supabase/server';
import { GDPRComplianceService } from './gdpr-compliance';
import { FERPAComplianceService } from './ferpa-compliance';
import { AuditLogger } from './audit-logger';

export interface ComplianceCertification {
  id: string;
  institutionId: string;
  certificationType: 'gdpr' | 'ferpa' | 'sox' | 'hipaa' | 'iso27001';
  status: 'in_progress' | 'compliant' | 'non_compliant' | 'expired';
  issuedDate?: Date;
  expiryDate?: Date;
  certifyingBody?: string;
  certificateNumber?: string;
  complianceScore: number; // 0-100
  requirements: ComplianceRequirement[];
  evidence: ComplianceEvidence[];
  gaps: ComplianceGap[];
  nextAssessmentDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceRequirement {
  id: string;
  category: string;
  requirement: string;
  description: string;
  mandatory: boolean;
  status: 'met' | 'partially_met' | 'not_met' | 'not_applicable';
  evidence: string[];
  lastVerified?: Date;
  verifiedBy?: string;
  notes?: string;
}

export interface ComplianceEvidence {
  id: string;
  requirementId: string;
  type: 'document' | 'policy' | 'procedure' | 'audit_log' | 'screenshot' | 'certificate';
  title: string;
  description: string;
  filePath?: string;
  url?: string;
  uploadedBy: string;
  uploadedAt: Date;
  validUntil?: Date;
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: Date;
}

export interface ComplianceGap {
  id: string;
  requirementId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  remediation: string;
  estimatedEffort: string;
  targetDate?: Date;
  assignedTo?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'accepted_risk';
  createdAt: Date;
  updatedAt: Date;
}

export interface ComplianceReport {
  id: string;
  institutionId: string;
  reportType: 'assessment' | 'certification' | 'audit' | 'gap_analysis' | 'remediation';
  title: string;
  description: string;
  generatedBy: string;
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  status: 'draft' | 'final' | 'submitted' | 'approved';
  executiveSummary: string;
  findings: ComplianceFinding[];
  recommendations: ComplianceRecommendation[];
  attachments: string[];
  approvedBy?: string;
  approvedAt?: Date;
  submittedTo?: string;
  submittedAt?: Date;
}

export interface ComplianceFinding {
  id: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  evidence: string[];
  impact: string;
  likelihood: 'low' | 'medium' | 'high';
  riskRating: number; // 1-10
  affectedSystems: string[];
  affectedData: string[];
  regulatoryReference?: string;
}

export interface ComplianceRecommendation {
  id: string;
  findingId?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  implementation: string;
  estimatedCost?: string;
  estimatedTimeframe: string;
  benefits: string[];
  risks: string[];
  dependencies: string[];
  assignedTo?: string;
  targetDate?: Date;
  status: 'proposed' | 'approved' | 'in_progress' | 'completed' | 'rejected';
}

export class ComplianceReportingService {
  private supabase = createClient();
  private gdprService = new GDPRComplianceService();
  private ferpaService = new FERPAComplianceService();
  private auditLogger = new AuditLogger();

  /**
   * Generate comprehensive compliance assessment report
   */
  async generateComplianceAssessment(
    institutionId: string,
    certificationType: ComplianceCertification['certificationType'],
    generatedBy: string
  ): Promise<ComplianceReport> {
    const reportId = crypto.randomUUID();
    const generatedAt = new Date();
    const periodStart = new Date(generatedAt.getTime() - (365 * 24 * 60 * 60 * 1000)); // 1 year ago
    const periodEnd = generatedAt;

    let findings: ComplianceFinding[] = [];
    let recommendations: ComplianceRecommendation[] = [];
    let executiveSummary = '';

    switch (certificationType) {
      case 'gdpr':
        const gdprAssessment = await this.gdprService.conductGDPRAssessment(institutionId);
        findings = await this.convertGDPRFindingsToCompliance(gdprAssessment.findings);
        recommendations = await this.generateGDPRRecommendations(gdprAssessment);
        executiveSummary = this.generateGDPRExecutiveSummary(gdprAssessment);
        break;

      case 'ferpa':
        const ferpaAssessment = await this.ferpaService.conductFERPAAssessment(institutionId);
        findings = await this.convertFERPAFindingsToCompliance(ferpaAssessment.findings);
        recommendations = await this.generateFERPARecommendations(ferpaAssessment);
        executiveSummary = this.generateFERPAExecutiveSummary(ferpaAssessment);
        break;

      default:
        throw new Error(`Unsupported certification type: ${certificationType}`);
    }

    const report: ComplianceReport = {
      id: reportId,
      institutionId,
      reportType: 'assessment',
      title: `${certificationType.toUpperCase()} Compliance Assessment`,
      description: `Comprehensive compliance assessment for ${certificationType.toUpperCase()} requirements`,
      generatedBy,
      generatedAt,
      periodStart,
      periodEnd,
      status: 'draft',
      executiveSummary,
      findings,
      recommendations,
      attachments: []
    };

    // Store the report
    await this.storeComplianceReport(report);

    // Log the assessment generation
    await this.auditLogger.logComplianceAction(
      'institution',
      institutionId,
      'compliance_assessment_generated',
      generatedBy,
      'compliance_officer',
      undefined,
      {
        reportId,
        certificationType,
        findingsCount: findings.length,
        recommendationsCount: recommendations.length
      },
      'medium'
    );

    return report;
  }

  /**
   * Create compliance certification tracking
   */
  async createComplianceCertification(
    institutionId: string,
    certificationType: ComplianceCertification['certificationType'],
    createdBy: string
  ): Promise<ComplianceCertification> {
    const certificationId = crypto.randomUUID();
    const createdAt = new Date();
    const nextAssessmentDate = new Date(createdAt.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 year

    // Get requirements for the certification type
    const requirements = await this.getComplianceRequirements(certificationType);
    
    const certification: ComplianceCertification = {
      id: certificationId,
      institutionId,
      certificationType,
      status: 'in_progress',
      complianceScore: 0,
      requirements,
      evidence: [],
      gaps: [],
      nextAssessmentDate,
      createdAt,
      updatedAt: createdAt
    };

    // Store the certification
    await this.storeComplianceCertification(certification);

    // Log the certification creation
    await this.auditLogger.logComplianceAction(
      'institution',
      institutionId,
      'compliance_certification_created',
      createdBy,
      'compliance_officer',
      undefined,
      {
        certificationId,
        certificationType,
        requirementsCount: requirements.length
      },
      'medium'
    );

    return certification;
  }

  /**
   * Update compliance requirement status with evidence
   */
  async updateComplianceRequirement(
    certificationId: string,
    requirementId: string,
    status: ComplianceRequirement['status'],
    evidence: string[],
    notes: string,
    verifiedBy: string
  ): Promise<void> {
    const verifiedAt = new Date();

    // Update requirement status
    const { error: updateError } = await this.supabase
      .from('compliance_requirements')
      .update({
        status,
        evidence,
        notes,
        last_verified: verifiedAt.toISOString(),
        verified_by: verifiedBy,
        updated_at: verifiedAt.toISOString()
      })
      .eq('id', requirementId)
      .eq('certification_id', certificationId);

    if (updateError) {
      throw new Error(`Failed to update compliance requirement: ${updateError.message}`);
    }

    // Recalculate compliance score
    await this.recalculateComplianceScore(certificationId);

    // Log the requirement update
    await this.auditLogger.logComplianceAction(
      'certification',
      certificationId,
      'compliance_requirement_updated',
      verifiedBy,
      'compliance_officer',
      undefined,
      {
        requirementId,
        status,
        evidenceCount: evidence.length,
        notes
      },
      'low'
    );
  }

  /**
   * Upload compliance evidence
   */
  async uploadComplianceEvidence(
    certificationId: string,
    requirementId: string,
    evidence: Omit<ComplianceEvidence, 'id' | 'uploadedAt'>,
    uploadedBy: string
  ): Promise<ComplianceEvidence> {
    const evidenceId = crypto.randomUUID();
    const uploadedAt = new Date();

    const fullEvidence: ComplianceEvidence = {
      ...evidence,
      id: evidenceId,
      requirementId,
      uploadedBy,
      uploadedAt,
      verified: false
    };

    // Store evidence
    const { error } = await this.supabase
      .from('compliance_evidence')
      .insert({
        id: evidenceId,
        certification_id: certificationId,
        requirement_id: requirementId,
        type: evidence.type,
        title: evidence.title,
        description: evidence.description,
        file_path: evidence.filePath,
        url: evidence.url,
        uploaded_by: uploadedBy,
        uploaded_at: uploadedAt.toISOString(),
        valid_until: evidence.validUntil?.toISOString(),
        verified: false
      });

    if (error) {
      throw new Error(`Failed to upload compliance evidence: ${error.message}`);
    }

    // Log the evidence upload
    await this.auditLogger.logComplianceAction(
      'certification',
      certificationId,
      'compliance_evidence_uploaded',
      uploadedBy,
      'compliance_officer',
      undefined,
      {
        evidenceId,
        requirementId,
        evidenceType: evidence.type,
        title: evidence.title
      },
      'low'
    );

    return fullEvidence;
  }

  /**
   * Verify compliance evidence
   */
  async verifyComplianceEvidence(
    evidenceId: string,
    verified: boolean,
    verifiedBy: string,
    notes?: string
  ): Promise<void> {
    const verifiedAt = new Date();

    const { error } = await this.supabase
      .from('compliance_evidence')
      .update({
        verified,
        verified_by: verifiedBy,
        verified_at: verifiedAt.toISOString(),
        notes
      })
      .eq('id', evidenceId);

    if (error) {
      throw new Error(`Failed to verify compliance evidence: ${error.message}`);
    }

    // Log the evidence verification
    await this.auditLogger.logComplianceAction(
      'evidence',
      evidenceId,
      'compliance_evidence_verified',
      verifiedBy,
      'compliance_officer',
      undefined,
      {
        verified,
        notes
      },
      'low'
    );
  }

  /**
   * Identify and track compliance gaps
   */
  async identifyComplianceGaps(
    certificationId: string,
    analyzedBy: string
  ): Promise<ComplianceGap[]> {
    // Get certification with requirements
    const { data: certification, error } = await this.supabase
      .from('compliance_certifications')
      .select(`
        *,
        compliance_requirements (*)
      `)
      .eq('id', certificationId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch certification: ${error.message}`);
    }

    const gaps: ComplianceGap[] = [];
    const requirements = certification.compliance_requirements || [];

    for (const requirement of requirements) {
      if (requirement.status === 'not_met' || requirement.status === 'partially_met') {
        const gapId = crypto.randomUUID();
        const severity = this.determineGapSeverity(requirement);
        
        const gap: ComplianceGap = {
          id: gapId,
          requirementId: requirement.id,
          severity,
          description: `Requirement not fully met: ${requirement.requirement}`,
          impact: this.determineGapImpact(requirement, severity),
          remediation: this.generateRemediationPlan(requirement),
          estimatedEffort: this.estimateRemediationEffort(requirement, severity),
          status: 'open',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        gaps.push(gap);

        // Store the gap
        await this.storeComplianceGap(certificationId, gap);
      }
    }

    // Log the gap analysis
    await this.auditLogger.logComplianceAction(
      'certification',
      certificationId,
      'compliance_gaps_identified',
      analyzedBy,
      'compliance_officer',
      undefined,
      {
        gapsCount: gaps.length,
        criticalGaps: gaps.filter(g => g.severity === 'critical').length,
        highGaps: gaps.filter(g => g.severity === 'high').length
      },
      'medium'
    );

    return gaps;
  }

  /**
   * Generate compliance remediation plan
   */
  async generateRemediationPlan(
    certificationId: string,
    generatedBy: string
  ): Promise<ComplianceReport> {
    const reportId = crypto.randomUUID();
    const generatedAt = new Date();

    // Get gaps for the certification
    const { data: gaps, error } = await this.supabase
      .from('compliance_gaps')
      .select('*')
      .eq('certification_id', certificationId)
      .eq('status', 'open')
      .order('severity', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch compliance gaps: ${error.message}`);
    }

    const recommendations: ComplianceRecommendation[] = [];

    for (const gap of gaps || []) {
      const recommendationId = crypto.randomUUID();
      
      const recommendation: ComplianceRecommendation = {
        id: recommendationId,
        findingId: gap.id,
        priority: gap.severity as ComplianceRecommendation['priority'],
        title: `Remediate: ${gap.description}`,
        description: gap.remediation,
        implementation: this.generateImplementationPlan(gap),
        estimatedTimeframe: gap.estimatedEffort,
        benefits: this.identifyRemediationBenefits(gap),
        risks: this.identifyRemediationRisks(gap),
        dependencies: this.identifyRemediationDependencies(gap),
        status: 'proposed'
      };

      recommendations.push(recommendation);
    }

    const report: ComplianceReport = {
      id: reportId,
      institutionId: certification.institution_id,
      reportType: 'remediation',
      title: 'Compliance Remediation Plan',
      description: 'Detailed plan to address identified compliance gaps',
      generatedBy,
      generatedAt,
      periodStart: generatedAt,
      periodEnd: new Date(generatedAt.getTime() + (180 * 24 * 60 * 60 * 1000)), // 6 months
      status: 'draft',
      executiveSummary: this.generateRemediationExecutiveSummary(gaps || [], recommendations),
      findings: [],
      recommendations,
      attachments: []
    };

    // Store the remediation plan
    await this.storeComplianceReport(report);

    return report;
  }

  /**
   * Track compliance certification progress
   */
  async getComplianceCertificationProgress(
    certificationId: string
  ): Promise<{
    overallProgress: number;
    requirementProgress: { category: string; completed: number; total: number }[];
    recentActivity: any[];
    upcomingDeadlines: any[];
    riskAreas: string[];
  }> {
    // Get certification with requirements
    const { data: certification, error } = await this.supabase
      .from('compliance_certifications')
      .select(`
        *,
        compliance_requirements (*),
        compliance_gaps (*)
      `)
      .eq('id', certificationId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch certification progress: ${error.message}`);
    }

    const requirements = certification.compliance_requirements || [];
    const gaps = certification.compliance_gaps || [];

    // Calculate overall progress
    const completedRequirements = requirements.filter(r => r.status === 'met').length;
    const overallProgress = requirements.length > 0 ? (completedRequirements / requirements.length) * 100 : 0;

    // Calculate progress by category
    const categoryProgress: Record<string, { completed: number; total: number }> = {};
    
    requirements.forEach(req => {
      if (!categoryProgress[req.category]) {
        categoryProgress[req.category] = { completed: 0, total: 0 };
      }
      categoryProgress[req.category].total++;
      if (req.status === 'met') {
        categoryProgress[req.category].completed++;
      }
    });

    const requirementProgress = Object.entries(categoryProgress).map(([category, progress]) => ({
      category,
      ...progress
    }));

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
    const { data: recentActivity } = await this.supabase
      .from('comprehensive_audit_log')
      .select('*')
      .eq('entity_type', 'certification')
      .eq('entity_id', certificationId)
      .gte('timestamp', thirtyDaysAgo.toISOString())
      .order('timestamp', { ascending: false })
      .limit(10);

    // Identify upcoming deadlines
    const upcomingDeadlines = gaps
      .filter(gap => gap.target_date && new Date(gap.target_date) > new Date())
      .sort((a, b) => new Date(a.target_date).getTime() - new Date(b.target_date).getTime())
      .slice(0, 5);

    // Identify risk areas
    const riskAreas = gaps
      .filter(gap => gap.severity === 'critical' || gap.severity === 'high')
      .map(gap => gap.description)
      .slice(0, 5);

    return {
      overallProgress,
      requirementProgress,
      recentActivity: recentActivity || [],
      upcomingDeadlines,
      riskAreas
    };
  }

  // Private helper methods
  private async getComplianceRequirements(
    certificationType: ComplianceCertification['certificationType']
  ): Promise<ComplianceRequirement[]> {
    const requirements: ComplianceRequirement[] = [];

    switch (certificationType) {
      case 'gdpr':
        requirements.push(
          ...this.getGDPRRequirements()
        );
        break;
      case 'ferpa':
        requirements.push(
          ...this.getFERPARequirements()
        );
        break;
      // Add other certification types as needed
    }

    return requirements;
  }

  private getGDPRRequirements(): ComplianceRequirement[] {
    return [
      {
        id: crypto.randomUUID(),
        category: 'Data Processing',
        requirement: 'Article 6 - Lawful basis for processing',
        description: 'Establish and document lawful basis for all data processing activities',
        mandatory: true,
        status: 'not_met',
        evidence: []
      },
      {
        id: crypto.randomUUID(),
        category: 'Data Subject Rights',
        requirement: 'Article 15 - Right of access',
        description: 'Implement processes to handle data subject access requests',
        mandatory: true,
        status: 'not_met',
        evidence: []
      },
      {
        id: crypto.randomUUID(),
        category: 'Data Subject Rights',
        requirement: 'Article 17 - Right to erasure',
        description: 'Implement processes to handle data erasure requests',
        mandatory: true,
        status: 'not_met',
        evidence: []
      },
      {
        id: crypto.randomUUID(),
        category: 'Data Protection',
        requirement: 'Article 32 - Security of processing',
        description: 'Implement appropriate technical and organizational measures',
        mandatory: true,
        status: 'not_met',
        evidence: []
      },
      {
        id: crypto.randomUUID(),
        category: 'Accountability',
        requirement: 'Article 30 - Records of processing activities',
        description: 'Maintain records of all processing activities',
        mandatory: true,
        status: 'not_met',
        evidence: []
      }
    ];
  }

  private getFERPARequirements(): ComplianceRequirement[] {
    return [
      {
        id: crypto.randomUUID(),
        category: 'Educational Records',
        requirement: '34 CFR 99.3 - Definition of education records',
        description: 'Properly classify and protect educational records',
        mandatory: true,
        status: 'not_met',
        evidence: []
      },
      {
        id: crypto.randomUUID(),
        category: 'Directory Information',
        requirement: '34 CFR 99.37 - Directory information',
        description: 'Implement directory information policies and opt-out procedures',
        mandatory: true,
        status: 'not_met',
        evidence: []
      },
      {
        id: crypto.randomUUID(),
        category: 'Disclosure',
        requirement: '34 CFR 99.32 - Disclosure record',
        description: 'Maintain records of all disclosures of educational records',
        mandatory: true,
        status: 'not_met',
        evidence: []
      },
      {
        id: crypto.randomUUID(),
        category: 'Access Rights',
        requirement: '34 CFR 99.10 - Right to inspect and review',
        description: 'Provide students access to their educational records',
        mandatory: true,
        status: 'not_met',
        evidence: []
      },
      {
        id: crypto.randomUUID(),
        category: 'Consent',
        requirement: '34 CFR 99.30 - Prior consent for disclosure',
        description: 'Obtain consent before disclosing educational records',
        mandatory: true,
        status: 'not_met',
        evidence: []
      }
    ];
  }

  private async convertGDPRFindingsToCompliance(findings: any[]): Promise<ComplianceFinding[]> {
    return findings.map(finding => ({
      id: crypto.randomUUID(),
      category: finding.category,
      severity: finding.compliant ? 'low' : 'high',
      title: finding.category,
      description: finding.issues.join('; '),
      evidence: [],
      impact: 'Potential GDPR compliance violation',
      likelihood: finding.compliant ? 'low' : 'medium',
      riskRating: finding.compliant ? 2 : 6,
      affectedSystems: ['student_data_system'],
      affectedData: ['personal_data'],
      regulatoryReference: 'GDPR'
    }));
  }

  private async convertFERPAFindingsToCompliance(findings: any[]): Promise<ComplianceFinding[]> {
    return findings.map(finding => ({
      id: crypto.randomUUID(),
      category: finding.category,
      severity: finding.compliant ? 'low' : 'high',
      title: finding.category,
      description: finding.issues.join('; '),
      evidence: [],
      impact: 'Potential FERPA compliance violation',
      likelihood: finding.compliant ? 'low' : 'medium',
      riskRating: finding.compliant ? 2 : 6,
      affectedSystems: ['educational_records_system'],
      affectedData: ['educational_records'],
      regulatoryReference: 'FERPA'
    }));
  }

  private async generateGDPRRecommendations(assessment: any): Promise<ComplianceRecommendation[]> {
    const recommendations: ComplianceRecommendation[] = [];
    
    assessment.findings.forEach((finding: any) => {
      if (!finding.compliant) {
        finding.recommendations.forEach((rec: string) => {
          recommendations.push({
            id: crypto.randomUUID(),
            priority: 'high',
            title: `GDPR: ${finding.category}`,
            description: rec,
            implementation: 'Implement recommended controls and procedures',
            estimatedTimeframe: '30-60 days',
            benefits: ['GDPR compliance', 'Reduced regulatory risk'],
            risks: ['Regulatory penalties if not addressed'],
            dependencies: ['Legal review', 'Technical implementation'],
            status: 'proposed'
          });
        });
      }
    });

    return recommendations;
  }

  private async generateFERPARecommendations(assessment: any): Promise<ComplianceRecommendation[]> {
    const recommendations: ComplianceRecommendation[] = [];
    
    assessment.findings.forEach((finding: any) => {
      if (!finding.compliant) {
        finding.recommendations.forEach((rec: string) => {
          recommendations.push({
            id: crypto.randomUUID(),
            priority: 'high',
            title: `FERPA: ${finding.category}`,
            description: rec,
            implementation: 'Implement recommended controls and procedures',
            estimatedTimeframe: '30-60 days',
            benefits: ['FERPA compliance', 'Reduced regulatory risk'],
            risks: ['Loss of federal funding if not addressed'],
            dependencies: ['Policy updates', 'Staff training'],
            status: 'proposed'
          });
        });
      }
    });

    return recommendations;
  }

  private generateGDPRExecutiveSummary(assessment: any): string {
    return `GDPR Compliance Assessment Summary:
    
Overall Compliance Score: ${assessment.overallCompliance}%
Risk Level: ${assessment.riskLevel}
Assessment Date: ${assessment.assessmentDate.toISOString().split('T')[0]}

Key Findings:
${assessment.findings.map((f: any) => `- ${f.category}: ${f.compliant ? 'Compliant' : 'Non-compliant'}`).join('\n')}

This assessment evaluates the institution's compliance with GDPR requirements across all key areas including data processing activities, consent management, data subject rights, data security, retention policies, and international transfers.`;
  }

  private generateFERPAExecutiveSummary(assessment: any): string {
    return `FERPA Compliance Assessment Summary:
    
Overall Compliance Score: ${assessment.overallCompliance}%
Risk Level: ${assessment.riskLevel}
Assessment Date: ${assessment.assessmentDate.toISOString().split('T')[0]}

Key Findings:
${assessment.findings.map((f: any) => `- ${f.category}: ${f.compliant ? 'Compliant' : 'Non-compliant'}`).join('\n')}

This assessment evaluates the institution's compliance with FERPA requirements including educational record classification, directory information management, disclosure tracking, access controls, and consent management.`;
  }

  private determineGapSeverity(requirement: any): ComplianceGap['severity'] {
    if (requirement.mandatory && requirement.status === 'not_met') {
      return 'critical';
    }
    if (requirement.mandatory && requirement.status === 'partially_met') {
      return 'high';
    }
    if (requirement.status === 'not_met') {
      return 'medium';
    }
    return 'low';
  }

  private determineGapImpact(requirement: any, severity: ComplianceGap['severity']): string {
    const impacts = {
      critical: 'Significant regulatory risk, potential penalties, loss of certification',
      high: 'Moderate regulatory risk, compliance violations',
      medium: 'Minor compliance issues, potential audit findings',
      low: 'Best practice recommendations, minimal risk'
    };
    return impacts[severity];
  }

  private generateRemediationPlan(requirement: any): string {
    return `Implement controls and procedures to meet requirement: ${requirement.requirement}. Review current processes, update policies, provide training, and establish monitoring procedures.`;
  }

  private estimateRemediationEffort(requirement: any, severity: ComplianceGap['severity']): string {
    const efforts = {
      critical: '60-90 days',
      high: '30-60 days',
      medium: '15-30 days',
      low: '5-15 days'
    };
    return efforts[severity];
  }

  private generateImplementationPlan(gap: ComplianceGap): string {
    return `1. Review current state and identify specific deficiencies
2. Develop implementation plan and timeline
3. Update policies and procedures as needed
4. Implement technical controls and safeguards
5. Provide staff training and awareness
6. Test and validate implementation
7. Document evidence and maintain records
8. Monitor ongoing compliance`;
  }

  private identifyRemediationBenefits(gap: ComplianceGap): string[] {
    return [
      'Improved regulatory compliance',
      'Reduced risk of penalties',
      'Enhanced data protection',
      'Better audit readiness',
      'Increased stakeholder confidence'
    ];
  }

  private identifyRemediationRisks(gap: ComplianceGap): string[] {
    return [
      'Implementation delays',
      'Resource constraints',
      'Technical complexity',
      'Change management challenges',
      'Ongoing maintenance requirements'
    ];
  }

  private identifyRemediationDependencies(gap: ComplianceGap): string[] {
    return [
      'Management approval',
      'Budget allocation',
      'Technical resources',
      'Legal review',
      'Staff training'
    ];
  }

  private generateRemediationExecutiveSummary(gaps: any[], recommendations: ComplianceRecommendation[]): string {
    const criticalGaps = gaps.filter(g => g.severity === 'critical').length;
    const highGaps = gaps.filter(g => g.severity === 'high').length;
    
    return `Compliance Remediation Plan Summary:

Total Gaps Identified: ${gaps.length}
- Critical: ${criticalGaps}
- High: ${highGaps}
- Medium/Low: ${gaps.length - criticalGaps - highGaps}

Total Recommendations: ${recommendations.length}

This remediation plan addresses all identified compliance gaps with prioritized recommendations, implementation timelines, and resource requirements. Critical and high-priority items should be addressed immediately to reduce regulatory risk.`;
  }

  private async recalculateComplianceScore(certificationId: string): Promise<void> {
    const { data: requirements, error } = await this.supabase
      .from('compliance_requirements')
      .select('status, mandatory')
      .eq('certification_id', certificationId);

    if (error) {
      console.error('Failed to fetch requirements for score calculation:', error);
      return;
    }

    const totalRequirements = requirements?.length || 0;
    const metRequirements = requirements?.filter(r => r.status === 'met').length || 0;
    const partiallyMetRequirements = requirements?.filter(r => r.status === 'partially_met').length || 0;

    // Calculate weighted score (met = 1.0, partially met = 0.5, not met = 0.0)
    const score = totalRequirements > 0 
      ? Math.round(((metRequirements + (partiallyMetRequirements * 0.5)) / totalRequirements) * 100)
      : 0;

    // Determine status based on score
    let status: ComplianceCertification['status'];
    if (score >= 95) status = 'compliant';
    else if (score >= 70) status = 'in_progress';
    else status = 'non_compliant';

    // Update certification
    await this.supabase
      .from('compliance_certifications')
      .update({
        compliance_score: score,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', certificationId);
  }

  private async storeComplianceReport(report: ComplianceReport): Promise<void> {
    const { error } = await this.supabase
      .from('compliance_reports')
      .insert({
        id: report.id,
        institution_id: report.institutionId,
        report_type: report.reportType,
        title: report.title,
        description: report.description,
        generated_by: report.generatedBy,
        generated_at: report.generatedAt.toISOString(),
        period_start: report.periodStart.toISOString(),
        period_end: report.periodEnd.toISOString(),
        status: report.status,
        executive_summary: report.executiveSummary,
        findings: report.findings,
        recommendations: report.recommendations,
        attachments: report.attachments
      });

    if (error) {
      throw new Error(`Failed to store compliance report: ${error.message}`);
    }
  }

  private async storeComplianceCertification(certification: ComplianceCertification): Promise<void> {
    const { error } = await this.supabase
      .from('compliance_certifications')
      .insert({
        id: certification.id,
        institution_id: certification.institutionId,
        certification_type: certification.certificationType,
        status: certification.status,
        compliance_score: certification.complianceScore,
        next_assessment_date: certification.nextAssessmentDate.toISOString(),
        created_at: certification.createdAt.toISOString(),
        updated_at: certification.updatedAt.toISOString()
      });

    if (error) {
      throw new Error(`Failed to store compliance certification: ${error.message}`);
    }

    // Store requirements
    for (const requirement of certification.requirements) {
      await this.supabase
        .from('compliance_requirements')
        .insert({
          id: requirement.id,
          certification_id: certification.id,
          category: requirement.category,
          requirement: requirement.requirement,
          description: requirement.description,
          mandatory: requirement.mandatory,
          status: requirement.status,
          evidence: requirement.evidence
        });
    }
  }

  private async storeComplianceGap(certificationId: string, gap: ComplianceGap): Promise<void> {
    const { error } = await this.supabase
      .from('compliance_gaps')
      .insert({
        id: gap.id,
        certification_id: certificationId,
        requirement_id: gap.requirementId,
        severity: gap.severity,
        description: gap.description,
        impact: gap.impact,
        remediation: gap.remediation,
        estimated_effort: gap.estimatedEffort,
        target_date: gap.targetDate?.toISOString(),
        assigned_to: gap.assignedTo,
        status: gap.status,
        created_at: gap.createdAt.toISOString(),
        updated_at: gap.updatedAt.toISOString()
      });

    if (error) {
      throw new Error(`Failed to store compliance gap: ${error.message}`);
    }
  }
}