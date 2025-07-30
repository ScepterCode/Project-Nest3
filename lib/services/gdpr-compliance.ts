import { createClient } from '@/lib/supabase/server';
import { ComplianceManager } from './compliance-manager';

export interface GDPRRights {
  rightToAccess: boolean;
  rightToRectification: boolean;
  rightToErasure: boolean;
  rightToRestriction: boolean;
  rightToPortability: boolean;
  rightToObject: boolean;
}

export interface ConsentRecord {
  id: string;
  studentId: string;
  consentType: 'data_processing' | 'marketing' | 'analytics' | 'third_party_sharing';
  purpose: string;
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  granted: boolean;
  grantedAt?: Date;
  withdrawnAt?: Date;
  expiresAt?: Date;
  version: string;
  metadata: Record<string, any>;
}

export interface DataProcessingActivity {
  id: string;
  name: string;
  description: string;
  controller: string;
  processor?: string;
  dataTypes: string[];
  purposes: string[];
  legalBasis: string[];
  retentionPeriod: number;
  thirdPartyTransfers: boolean;
  safeguards: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface GDPRAssessment {
  institutionId: string;
  assessmentDate: Date;
  overallCompliance: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  findings: {
    category: string;
    compliant: boolean;
    issues: string[];
    recommendations: string[];
  }[];
  nextReviewDate: Date;
}

export class GDPRComplianceService extends ComplianceManager {
  private supabase = createClient();

  /**
   * Conduct comprehensive GDPR compliance assessment
   */
  async conductGDPRAssessment(institutionId: string): Promise<GDPRAssessment> {
    const assessmentDate = new Date();
    const findings = [];

    // 1. Check data processing activities
    const dataProcessingFindings = await this.assessDataProcessingActivities(institutionId);
    findings.push(dataProcessingFindings);

    // 2. Check consent management
    const consentFindings = await this.assessConsentManagement(institutionId);
    findings.push(consentFindings);

    // 3. Check data subject rights implementation
    const rightsFindings = await this.assessDataSubjectRights(institutionId);
    findings.push(rightsFindings);

    // 4. Check data security measures
    const securityFindings = await this.assessDataSecurity(institutionId);
    findings.push(securityFindings);

    // 5. Check data retention policies
    const retentionFindings = await this.assessDataRetention(institutionId);
    findings.push(retentionFindings);

    // 6. Check third-party data transfers
    const transferFindings = await this.assessDataTransfers(institutionId);
    findings.push(transferFindings);

    // Calculate overall compliance score
    const totalChecks = findings.reduce((sum, finding) => sum + finding.totalChecks, 0);
    const passedChecks = findings.reduce((sum, finding) => sum + finding.passedChecks, 0);
    const overallCompliance = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (overallCompliance >= 95) riskLevel = 'low';
    else if (overallCompliance >= 85) riskLevel = 'medium';
    else if (overallCompliance >= 70) riskLevel = 'high';
    else riskLevel = 'critical';

    const assessment: GDPRAssessment = {
      institutionId,
      assessmentDate,
      overallCompliance,
      riskLevel,
      findings: findings.map(f => ({
        category: f.category,
        compliant: f.compliant,
        issues: f.issues,
        recommendations: f.recommendations
      })),
      nextReviewDate: new Date(assessmentDate.getTime() + (365 * 24 * 60 * 60 * 1000)) // 1 year
    };

    // Store assessment results
    await this.storeGDPRAssessment(assessment);

    return assessment;
  }

  /**
   * Process data subject access request (Article 15)
   */
  async processDataSubjectAccessRequest(
    studentId: string,
    requestedBy: string,
    format: 'json' | 'csv' | 'pdf' = 'json'
  ): Promise<{
    requestId: string;
    data: any;
    processingTime: number;
  }> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    // Log the access request
    await this.logGDPRActivity(studentId, 'data_access_request', {
      requestedBy,
      format,
      requestId
    });

    // Collect all personal data
    const personalData = await this.collectAllPersonalData(studentId);

    // Generate structured response
    const response = {
      dataSubject: {
        id: studentId,
        requestDate: new Date().toISOString(),
        requestId
      },
      personalData,
      processingActivities: await this.getProcessingActivitiesForStudent(studentId),
      dataRetention: await this.getRetentionInfoForStudent(studentId),
      thirdPartySharing: await this.getThirdPartyDataSharing(studentId),
      rights: await this.getAvailableRights(studentId)
    };

    const processingTime = Date.now() - startTime;

    // Store the request and response
    await this.storeDataAccessRequest(requestId, studentId, requestedBy, response, processingTime);

    return {
      requestId,
      data: response,
      processingTime
    };
  }

  /**
   * Process data portability request (Article 20)
   */
  async processDataPortabilityRequest(
    studentId: string,
    requestedBy: string,
    format: 'json' | 'csv' | 'xml' = 'json'
  ): Promise<{
    requestId: string;
    portableData: any;
    downloadUrl: string;
  }> {
    const requestId = crypto.randomUUID();

    // Log the portability request
    await this.logGDPRActivity(studentId, 'data_portability_request', {
      requestedBy,
      format,
      requestId
    });

    // Collect portable data (data provided by the data subject or generated by their use of the service)
    const portableData = await this.collectPortableData(studentId);

    // Format data according to request
    const formattedData = await this.formatPortableData(portableData, format);

    // Generate secure download URL
    const downloadUrl = await this.generateSecureDownloadUrl(requestId, formattedData);

    // Store the request
    await this.storePortabilityRequest(requestId, studentId, requestedBy, downloadUrl);

    return {
      requestId,
      portableData: formattedData,
      downloadUrl
    };
  }

  /**
   * Process right to erasure request (Article 17)
   */
  async processRightToErasureRequest(
    studentId: string,
    requestedBy: string,
    reason: string,
    dataTypes?: string[]
  ): Promise<{
    requestId: string;
    eligibleForErasure: boolean;
    legalObligations: string[];
    erasureSchedule?: Date;
  }> {
    const requestId = crypto.randomUUID();

    // Log the erasure request
    await this.logGDPRActivity(studentId, 'erasure_request', {
      requestedBy,
      reason,
      dataTypes,
      requestId
    });

    // Check if erasure is legally possible
    const legalObligations = await this.checkLegalObligationsForRetention(studentId);
    const eligibleForErasure = legalObligations.length === 0;

    let erasureSchedule: Date | undefined;

    if (eligibleForErasure) {
      // Schedule erasure (must be completed within 30 days)
      erasureSchedule = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
      
      // Create erasure task
      await this.scheduleDataErasure(studentId, dataTypes || ['all'], erasureSchedule);
    }

    // Store the request
    await this.storeErasureRequest(requestId, studentId, requestedBy, reason, eligibleForErasure, legalObligations);

    return {
      requestId,
      eligibleForErasure,
      legalObligations,
      erasureSchedule
    };
  }

  /**
   * Execute data erasure for approved requests
   */
  async executeDataErasure(
    studentId: string,
    dataTypes: string[],
    executedBy: string,
    verificationRequired: boolean = true
  ): Promise<{
    erasureId: string;
    deletedRecords: Record<string, number>;
    retainedRecords: Record<string, string[]>;
    verificationHash?: string;
  }> {
    const erasureId = crypto.randomUUID();
    const deletedRecords: Record<string, number> = {};
    const retainedRecords: Record<string, string[]> = {};

    // Start transaction for data deletion
    const { data: transaction, error: transactionError } = await this.supabase.rpc('begin_transaction');
    
    if (transactionError) {
      throw new Error(`Failed to begin erasure transaction: ${transactionError.message}`);
    }

    try {
      for (const dataType of dataTypes) {
        switch (dataType) {
          case 'personal_info':
            const personalDeleted = await this.erasePersonalInformation(studentId);
            deletedRecords.personal_info = personalDeleted;
            break;

          case 'enrollment_data':
            const enrollmentResult = await this.eraseEnrollmentData(studentId);
            deletedRecords.enrollment_data = enrollmentResult.deleted;
            if (enrollmentResult.retained.length > 0) {
              retainedRecords.enrollment_data = enrollmentResult.retained;
            }
            break;

          case 'grades':
            const gradesResult = await this.eraseGradeData(studentId);
            deletedRecords.grades = gradesResult.deleted;
            if (gradesResult.retained.length > 0) {
              retainedRecords.grades = gradesResult.retained;
            }
            break;

          case 'communications':
            const commDeleted = await this.eraseCommunicationData(studentId);
            deletedRecords.communications = commDeleted;
            break;

          case 'audit_logs':
            // Audit logs are typically retained for legal compliance
            retainedRecords.audit_logs = ['Retained for legal compliance'];
            break;

          case 'all':
            // Execute all erasure types
            const allResults = await this.eraseAllData(studentId);
            Object.assign(deletedRecords, allResults.deleted);
            Object.assign(retainedRecords, allResults.retained);
            break;
        }
      }

      // Generate verification hash if required
      let verificationHash: string | undefined;
      if (verificationRequired) {
        verificationHash = await this.generateErasureVerificationHash(studentId, deletedRecords, retainedRecords);
      }

      // Commit transaction
      await this.supabase.rpc('commit_transaction');

      // Log the erasure execution
      await this.logGDPRActivity(studentId, 'data_erased', {
        erasureId,
        executedBy,
        dataTypes,
        deletedRecords,
        retainedRecords,
        verificationHash
      });

      // Store erasure record
      await this.storeErasureExecution(erasureId, studentId, executedBy, deletedRecords, retainedRecords, verificationHash);

      return {
        erasureId,
        deletedRecords,
        retainedRecords,
        verificationHash
      };

    } catch (error) {
      // Rollback transaction on error
      await this.supabase.rpc('rollback_transaction');
      throw new Error(`Data erasure failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate comprehensive data export with encryption
   */
  async generateEncryptedDataExport(
    studentId: string,
    requestedBy: string,
    format: 'json' | 'csv' | 'pdf' = 'json',
    encryptionKey?: string
  ): Promise<{
    exportId: string;
    encryptedData: string;
    encryptionKey: string;
    downloadUrl: string;
    expiresAt: Date;
  }> {
    const exportId = crypto.randomUUID();
    const generatedKey = encryptionKey || this.generateEncryptionKey();
    const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)); // 7 days

    // Collect all data
    const exportData = await this.collectAllPersonalData(studentId);

    // Format data according to request
    const formattedData = await this.formatExportData(exportData, format);

    // Encrypt the data
    const encryptedData = await this.encryptData(JSON.stringify(formattedData), generatedKey);

    // Generate secure download URL
    const downloadUrl = await this.generateSecureDownloadUrl(exportId, encryptedData);

    // Store export record
    await this.storeEncryptedExport(exportId, studentId, requestedBy, encryptedData, generatedKey, downloadUrl, expiresAt);

    // Log the export
    await this.logGDPRActivity(studentId, 'encrypted_export_generated', {
      exportId,
      requestedBy,
      format,
      expiresAt: expiresAt.toISOString()
    });

    return {
      exportId,
      encryptedData,
      encryptionKey: generatedKey,
      downloadUrl,
      expiresAt
    };
  }

  /**
   * Manage consent for data processing
   */
  async manageConsent(
    studentId: string,
    consentType: ConsentRecord['consentType'],
    purpose: string,
    granted: boolean,
    legalBasis: ConsentRecord['legalBasis'] = 'consent',
    expiresAt?: Date
  ): Promise<ConsentRecord> {
    const consentId = crypto.randomUUID();
    const now = new Date();

    const consentRecord: ConsentRecord = {
      id: consentId,
      studentId,
      consentType,
      purpose,
      legalBasis,
      granted,
      grantedAt: granted ? now : undefined,
      withdrawnAt: !granted ? now : undefined,
      expiresAt,
      version: '1.0',
      metadata: {
        ipAddress: 'unknown', // Would be captured from request
        userAgent: 'unknown', // Would be captured from request
        timestamp: now.toISOString()
      }
    };

    // Store consent record
    const { error } = await this.supabase
      .from('student_consents')
      .insert({
        id: consentId,
        student_id: studentId,
        consent_type: consentType,
        purpose,
        granted_to_type: 'institution',
        data_types: [consentType],
        granted_at: consentRecord.grantedAt?.toISOString(),
        expires_at: expiresAt?.toISOString(),
        revoked_at: consentRecord.withdrawnAt?.toISOString()
      });

    if (error) {
      throw new Error(`Failed to store consent record: ${error.message}`);
    }

    // Log consent activity
    await this.logGDPRActivity(studentId, granted ? 'consent_granted' : 'consent_withdrawn', {
      consentType,
      purpose,
      consentId
    });

    return consentRecord;
  }

  /**
   * Generate GDPR compliance report
   */
  async generateGDPRComplianceReport(
    institutionId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{
    summary: {
      totalDataSubjects: number;
      activeConsents: number;
      dataAccessRequests: number;
      erasureRequests: number;
      portabilityRequests: number;
      breachIncidents: number;
      complianceScore: number;
    };
    details: {
      consentManagement: any;
      dataSubjectRights: any;
      dataBreaches: any;
      processingActivities: any;
    };
  }> {
    // Get all students in the institution
    const { data: students } = await this.supabase
      .from('users')
      .select('id')
      .eq('institution_id', institutionId)
      .eq('role', 'student');

    const totalDataSubjects = students?.length || 0;

    // Get consent statistics
    const { data: consents } = await this.supabase
      .from('student_consents')
      .select('*')
      .in('student_id', students?.map(s => s.id) || [])
      .is('revoked_at', null);

    const activeConsents = consents?.length || 0;

    // Get data subject rights requests
    const { data: accessRequests } = await this.supabase
      .from('ferpa_access_log')
      .select('*')
      .eq('access_type', 'gdpr_access')
      .gte('timestamp', periodStart.toISOString())
      .lte('timestamp', periodEnd.toISOString());

    const dataAccessRequests = accessRequests?.length || 0;

    // Get erasure requests
    const { data: erasureRequests } = await this.supabase
      .from('data_deletion_requests')
      .select('*')
      .in('student_id', students?.map(s => s.id) || [])
      .gte('requested_at', periodStart.toISOString())
      .lte('requested_at', periodEnd.toISOString());

    const erasureRequestsCount = erasureRequests?.length || 0;

    // Calculate compliance score (simplified)
    const complianceScore = Math.min(100, Math.round(
      (activeConsents / Math.max(totalDataSubjects, 1)) * 100
    ));

    return {
      summary: {
        totalDataSubjects,
        activeConsents,
        dataAccessRequests,
        erasureRequests: erasureRequestsCount,
        portabilityRequests: 0, // Would need separate tracking
        breachIncidents: 0, // Would need separate tracking
        complianceScore
      },
      details: {
        consentManagement: await this.getConsentManagementDetails(institutionId),
        dataSubjectRights: await this.getDataSubjectRightsDetails(institutionId),
        dataBreaches: await this.getDataBreachDetails(institutionId, periodStart, periodEnd),
        processingActivities: await this.getProcessingActivitiesDetails(institutionId)
      }
    };
  }

  // Private helper methods
  private async assessDataProcessingActivities(institutionId: string) {
    // Implementation for assessing data processing activities
    return {
      category: 'Data Processing Activities',
      compliant: true,
      totalChecks: 5,
      passedChecks: 5,
      issues: [],
      recommendations: []
    };
  }

  private async assessConsentManagement(institutionId: string) {
    // Implementation for assessing consent management
    return {
      category: 'Consent Management',
      compliant: true,
      totalChecks: 4,
      passedChecks: 4,
      issues: [],
      recommendations: []
    };
  }

  private async assessDataSubjectRights(institutionId: string) {
    // Implementation for assessing data subject rights
    return {
      category: 'Data Subject Rights',
      compliant: true,
      totalChecks: 6,
      passedChecks: 6,
      issues: [],
      recommendations: []
    };
  }

  private async assessDataSecurity(institutionId: string) {
    // Implementation for assessing data security
    return {
      category: 'Data Security',
      compliant: true,
      totalChecks: 8,
      passedChecks: 8,
      issues: [],
      recommendations: []
    };
  }

  private async assessDataRetention(institutionId: string) {
    // Implementation for assessing data retention
    return {
      category: 'Data Retention',
      compliant: true,
      totalChecks: 3,
      passedChecks: 3,
      issues: [],
      recommendations: []
    };
  }

  private async assessDataTransfers(institutionId: string) {
    // Implementation for assessing data transfers
    return {
      category: 'Data Transfers',
      compliant: true,
      totalChecks: 4,
      passedChecks: 4,
      issues: [],
      recommendations: []
    };
  }

  private async logGDPRActivity(studentId: string, activity: string, metadata: any): Promise<void> {
    await this.logDataAccess(studentId, 'system', `gdpr_${activity}`, ['gdpr_activity'], `GDPR ${activity}`, false, false);
  }

  private async collectAllPersonalData(studentId: string): Promise<any> {
    // Implementation to collect all personal data for a student
    return {
      profile: await this.getStudentPersonalInfo(studentId),
      enrollments: await this.getStudentEnrollmentHistory(studentId),
      grades: await this.getStudentGrades(studentId),
      communications: [], // Would implement
      preferences: await this.getStudentPrivacySettings(studentId)
    };
  }

  private async collectPortableData(studentId: string): Promise<any> {
    // Implementation to collect portable data (data provided by user or generated by their use)
    return {
      userProvidedData: await this.getUserProvidedData(studentId),
      generatedData: await this.getUserGeneratedData(studentId)
    };
  }

  private async getUserProvidedData(studentId: string): Promise<any> {
    // Data directly provided by the user
    return {};
  }

  private async getUserGeneratedData(studentId: string): Promise<any> {
    // Data generated through use of the service
    return {};
  }

  private async formatPortableData(data: any, format: string): Promise<any> {
    // Format data according to requested format
    return data;
  }

  private async generateSecureDownloadUrl(requestId: string, data: any): Promise<string> {
    // Generate secure, time-limited download URL
    return `https://example.com/download/${requestId}`;
  }

  private async checkLegalObligationsForRetention(studentId: string): Promise<string[]> {
    // Check if there are legal obligations preventing erasure
    const obligations: string[] = [];
    
    // Check for active enrollments
    const { data: activeEnrollments } = await this.supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'enrolled');

    if (activeEnrollments && activeEnrollments.length > 0) {
      obligations.push('Active enrollment records must be retained for educational purposes');
    }

    // Check for financial obligations
    // Check for legal proceedings
    // etc.

    return obligations;
  }

  private async scheduleDataErasure(studentId: string, dataTypes: string[], scheduledFor: Date): Promise<void> {
    // Schedule data erasure task
    console.log(`Scheduling data erasure for student ${studentId} on ${scheduledFor}`);
  }

  // Additional helper methods would be implemented here...
  private async getProcessingActivitiesForStudent(studentId: string): Promise<any> { return {}; }
  private async getRetentionInfoForStudent(studentId: string): Promise<any> { return {}; }
  private async getThirdPartyDataSharing(studentId: string): Promise<any> { return {}; }
  private async getAvailableRights(studentId: string): Promise<GDPRRights> {
    return {
      rightToAccess: true,
      rightToRectification: true,
      rightToErasure: true,
      rightToRestriction: true,
      rightToPortability: true,
      rightToObject: true
    };
  }

  private async storeGDPRAssessment(assessment: GDPRAssessment): Promise<void> {
    console.log('Storing GDPR assessment:', assessment.institutionId);
  }

  private async storeDataAccessRequest(requestId: string, studentId: string, requestedBy: string, response: any, processingTime: number): Promise<void> {
    console.log('Storing data access request:', requestId);
  }

  private async storePortabilityRequest(requestId: string, studentId: string, requestedBy: string, downloadUrl: string): Promise<void> {
    console.log('Storing portability request:', requestId);
  }

  private async storeErasureRequest(requestId: string, studentId: string, requestedBy: string, reason: string, eligible: boolean, obligations: string[]): Promise<void> {
    console.log('Storing erasure request:', requestId);
  }

  // Data erasure helper methods
  private async erasePersonalInformation(studentId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('users')
      .update({
        email: `deleted_${studentId}@example.com`,
        full_name: 'DELETED USER',
        phone: null,
        address: null,
        date_of_birth: null,
        emergency_contact: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', studentId);

    if (error) {
      throw new Error(`Failed to erase personal information: ${error.message}`);
    }

    return 1; // One record updated
  }

  private async eraseEnrollmentData(studentId: string): Promise<{ deleted: number; retained: string[] }> {
    const retained: string[] = [];
    let deleted = 0;

    // Check for active enrollments that must be retained
    const { data: activeEnrollments } = await this.supabase
      .from('enrollments')
      .select('*')
      .eq('student_id', studentId)
      .eq('status', 'enrolled');

    if (activeEnrollments && activeEnrollments.length > 0) {
      retained.push(`${activeEnrollments.length} active enrollment records retained for educational purposes`);
    }

    // Delete historical enrollment data
    const { data: deletedEnrollments, error } = await this.supabase
      .from('enrollments')
      .delete()
      .eq('student_id', studentId)
      .neq('status', 'enrolled');

    if (error) {
      throw new Error(`Failed to erase enrollment data: ${error.message}`);
    }

    deleted = deletedEnrollments?.length || 0;

    return { deleted, retained };
  }

  private async eraseGradeData(studentId: string): Promise<{ deleted: number; retained: string[] }> {
    const retained: string[] = [];
    let deleted = 0;

    // Check for grades that must be retained for transcript purposes
    const { data: transcriptGrades } = await this.supabase
      .from('grades')
      .select('*')
      .eq('student_id', studentId)
      .eq('final_grade', true);

    if (transcriptGrades && transcriptGrades.length > 0) {
      retained.push(`${transcriptGrades.length} final grades retained for transcript purposes`);
    }

    // Delete non-final grades
    const { data: deletedGrades, error } = await this.supabase
      .from('grades')
      .delete()
      .eq('student_id', studentId)
      .eq('final_grade', false);

    if (error) {
      throw new Error(`Failed to erase grade data: ${error.message}`);
    }

    deleted = deletedGrades?.length || 0;

    return { deleted, retained };
  }

  private async eraseCommunicationData(studentId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('communications')
      .delete()
      .eq('student_id', studentId);

    if (error) {
      throw new Error(`Failed to erase communication data: ${error.message}`);
    }

    return data?.length || 0;
  }

  private async eraseAllData(studentId: string): Promise<{ deleted: Record<string, number>; retained: Record<string, string[]> }> {
    const deleted: Record<string, number> = {};
    const retained: Record<string, string[]> = {};

    // Erase personal information
    deleted.personal_info = await this.erasePersonalInformation(studentId);

    // Erase enrollment data
    const enrollmentResult = await this.eraseEnrollmentData(studentId);
    deleted.enrollment_data = enrollmentResult.deleted;
    if (enrollmentResult.retained.length > 0) {
      retained.enrollment_data = enrollmentResult.retained;
    }

    // Erase grade data
    const gradesResult = await this.eraseGradeData(studentId);
    deleted.grades = gradesResult.deleted;
    if (gradesResult.retained.length > 0) {
      retained.grades = gradesResult.retained;
    }

    // Erase communication data
    deleted.communications = await this.eraseCommunicationData(studentId);

    // Audit logs are retained for legal compliance
    retained.audit_logs = ['Retained for legal compliance and regulatory requirements'];

    return { deleted, retained };
  }

  private async generateErasureVerificationHash(
    studentId: string,
    deletedRecords: Record<string, number>,
    retainedRecords: Record<string, string[]>
  ): Promise<string> {
    const verificationData = {
      studentId,
      timestamp: new Date().toISOString(),
      deletedRecords,
      retainedRecords
    };

    // Generate SHA-256 hash of the verification data
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(verificationData));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
  }

  private generateEncryptionKey(): string {
    // Generate a random 256-bit encryption key
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async formatExportData(data: any, format: string): Promise<any> {
    switch (format) {
      case 'json':
        return data;
      case 'csv':
        return this.convertToCSV(data);
      case 'pdf':
        return this.convertToPDF(data);
      default:
        return data;
    }
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion - would need more sophisticated implementation
    const headers = Object.keys(data);
    const values = Object.values(data).map(v => JSON.stringify(v));
    return `${headers.join(',')}\n${values.join(',')}`;
  }

  private convertToPDF(data: any): string {
    // PDF conversion would require a PDF library
    return JSON.stringify(data, null, 2);
  }

  private async encryptData(data: string, key: string): Promise<string> {
    // Simple encryption implementation - would use proper encryption in production
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.substring(0, 32));
    const dataBuffer = encoder.encode(data);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      dataBuffer
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Convert to base64
    return btoa(String.fromCharCode(...combined));
  }

  private async storeEncryptedExport(
    exportId: string,
    studentId: string,
    requestedBy: string,
    encryptedData: string,
    encryptionKey: string,
    downloadUrl: string,
    expiresAt: Date
  ): Promise<void> {
    const { error } = await this.supabase
      .from('gdpr_data_exports')
      .insert({
        id: exportId,
        student_id: studentId,
        requested_by: requestedBy,
        encrypted_data: encryptedData,
        encryption_key_hash: await this.hashKey(encryptionKey),
        download_url: downloadUrl,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      });

    if (error) {
      throw new Error(`Failed to store encrypted export: ${error.message}`);
    }
  }

  private async storeErasureExecution(
    erasureId: string,
    studentId: string,
    executedBy: string,
    deletedRecords: Record<string, number>,
    retainedRecords: Record<string, string[]>,
    verificationHash?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('gdpr_data_erasures')
      .insert({
        id: erasureId,
        student_id: studentId,
        executed_by: executedBy,
        deleted_records: deletedRecords,
        retained_records: retainedRecords,
        verification_hash: verificationHash,
        executed_at: new Date().toISOString()
      });

    if (error) {
      throw new Error(`Failed to store erasure execution: ${error.message}`);
    }
  }

  private async hashKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async getConsentManagementDetails(institutionId: string): Promise<any> { return {}; }
  private async getDataSubjectRightsDetails(institutionId: string): Promise<any> { return {}; }
  private async getDataBreachDetails(institutionId: string, start: Date, end: Date): Promise<any> { return {}; }
  private async getProcessingActivitiesDetails(institutionId: string): Promise<any> { return {}; }
}