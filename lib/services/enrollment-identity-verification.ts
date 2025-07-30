import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export interface VerificationChallenge {
  id: string;
  userId: string;
  type: 'email' | 'sms' | 'security_question' | 'admin_approval';
  challenge: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
}

export interface VerificationResult {
  success: boolean;
  challengeId?: string;
  message: string;
  remainingAttempts?: number;
  nextVerificationMethod?: string;
}

export interface SensitiveOperation {
  operation: 'bulk_enrollment' | 'override_capacity' | 'bypass_prerequisites' | 'admin_enrollment' | 'emergency_drop';
  userId: string;
  targetUserId?: string;
  classId?: string;
  metadata: Record<string, any>;
}

export class EnrollmentIdentityVerificationService {
  private supabase = createClient();

  /**
   * Initiate identity verification for sensitive operations
   */
  async initiateVerification(
    userId: string,
    operation: SensitiveOperation,
    preferredMethod?: 'email' | 'sms' | 'security_question'
  ): Promise<VerificationResult> {
    try {
      // Check if user requires verification for this operation
      const requiresVerification = await this.requiresVerification(userId, operation);
      if (!requiresVerification) {
        return {
          success: true,
          message: 'No verification required for this operation'
        };
      }

      // Get user verification methods
      const availableMethods = await this.getAvailableVerificationMethods(userId);
      if (availableMethods.length === 0) {
        return {
          success: false,
          message: 'No verification methods available. Please contact administrator.'
        };
      }

      // Select verification method
      const method = preferredMethod && availableMethods.includes(preferredMethod) 
        ? preferredMethod 
        : availableMethods[0];

      // Create verification challenge
      const challenge = await this.createVerificationChallenge(userId, method, operation);
      
      // Send challenge
      await this.sendVerificationChallenge(challenge);

      return {
        success: true,
        challengeId: challenge.id,
        message: `Verification challenge sent via ${method}`,
        remainingAttempts: challenge.maxAttempts
      };
    } catch (error) {
      console.error('Error initiating verification:', error);
      return {
        success: false,
        message: 'Failed to initiate verification. Please try again.'
      };
    }
  }

  /**
   * Verify identity challenge response
   */
  async verifyChallenge(
    challengeId: string,
    response: string,
    userId: string
  ): Promise<VerificationResult> {
    try {
      // Get challenge
      const challenge = await this.getVerificationChallenge(challengeId);
      if (!challenge) {
        return {
          success: false,
          message: 'Invalid or expired verification challenge'
        };
      }

      // Check if challenge belongs to user
      if (challenge.userId !== userId) {
        return {
          success: false,
          message: 'Unauthorized verification attempt'
        };
      }

      // Check if challenge is expired
      if (challenge.expiresAt < new Date()) {
        await this.invalidateChallenge(challengeId);
        return {
          success: false,
          message: 'Verification challenge has expired'
        };
      }

      // Check if already verified
      if (challenge.verified) {
        return {
          success: true,
          message: 'Challenge already verified'
        };
      }

      // Check attempts limit
      if (challenge.attempts >= challenge.maxAttempts) {
        await this.invalidateChallenge(challengeId);
        return {
          success: false,
          message: 'Maximum verification attempts exceeded'
        };
      }

      // Verify response
      const isValid = await this.validateChallengeResponse(challenge, response);
      
      // Update challenge attempts
      await this.updateChallengeAttempts(challengeId, challenge.attempts + 1);

      if (isValid) {
        // Mark as verified
        await this.markChallengeVerified(challengeId);
        
        // Log successful verification
        await this.logVerificationEvent(userId, challengeId, 'success');

        return {
          success: true,
          message: 'Identity verified successfully'
        };
      } else {
        const remainingAttempts = challenge.maxAttempts - challenge.attempts - 1;
        
        // Log failed attempt
        await this.logVerificationEvent(userId, challengeId, 'failed_attempt');

        if (remainingAttempts <= 0) {
          await this.invalidateChallenge(challengeId);
          return {
            success: false,
            message: 'Verification failed. Maximum attempts exceeded.'
          };
        }

        return {
          success: false,
          message: 'Verification failed. Please try again.',
          remainingAttempts
        };
      }
    } catch (error) {
      console.error('Error verifying challenge:', error);
      return {
        success: false,
        message: 'Verification failed due to system error'
      };
    }
  }

  /**
   * Check if operation requires verification
   */
  private async requiresVerification(
    userId: string,
    operation: SensitiveOperation
  ): Promise<boolean> {
    // Get user role and permissions
    const { data: user, error } = await this.supabase
      .from('users')
      .select('role, metadata')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return true; // Require verification if we can't determine user role
    }

    // Define operations that require verification by role
    const verificationRules: Record<string, string[]> = {
      student: ['bulk_enrollment', 'override_capacity', 'bypass_prerequisites'],
      teacher: ['bulk_enrollment', 'override_capacity'],
      department_admin: ['override_capacity', 'bypass_prerequisites'],
      institution_admin: ['emergency_drop']
    };

    const requiredVerifications = verificationRules[user.role] || [];
    return requiredVerifications.includes(operation.operation);
  }

  /**
   * Get available verification methods for user
   */
  private async getAvailableVerificationMethods(userId: string): Promise<string[]> {
    const { data: user, error } = await this.supabase
      .from('users')
      .select('email, phone, metadata')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return [];
    }

    const methods: string[] = [];
    
    if (user.email) {
      methods.push('email');
    }
    
    if (user.phone) {
      methods.push('sms');
    }
    
    // Check if user has security questions set up
    if (user.metadata?.security_questions) {
      methods.push('security_question');
    }

    return methods;
  }

  /**
   * Create verification challenge
   */
  private async createVerificationChallenge(
    userId: string,
    method: string,
    operation: SensitiveOperation
  ): Promise<VerificationChallenge> {
    const challengeId = crypto.randomUUID();
    let challenge = '';
    let maxAttempts = 3;

    switch (method) {
      case 'email':
        challenge = this.generateEmailCode();
        maxAttempts = 3;
        break;
      case 'sms':
        challenge = this.generateSMSCode();
        maxAttempts = 3;
        break;
      case 'security_question':
        challenge = await this.getSecurityQuestion(userId);
        maxAttempts = 2;
        break;
      default:
        throw new Error(`Unsupported verification method: ${method}`);
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const verificationChallenge: VerificationChallenge = {
      id: challengeId,
      userId,
      type: method as any,
      challenge,
      expiresAt,
      attempts: 0,
      maxAttempts,
      verified: false
    };

    // Store challenge in database
    await this.supabase
      .from('verification_challenges')
      .insert({
        id: challengeId,
        user_id: userId,
        type: method,
        challenge_data: challenge,
        expires_at: expiresAt.toISOString(),
        attempts: 0,
        max_attempts: maxAttempts,
        verified: false,
        operation_type: operation.operation,
        operation_metadata: operation.metadata
      });

    return verificationChallenge;
  }

  /**
   * Send verification challenge to user
   */
  private async sendVerificationChallenge(challenge: VerificationChallenge): Promise<void> {
    switch (challenge.type) {
      case 'email':
        await this.sendEmailChallenge(challenge);
        break;
      case 'sms':
        await this.sendSMSChallenge(challenge);
        break;
      case 'security_question':
        // Security questions don't need to be "sent"
        break;
    }
  }

  /**
   * Generate email verification code
   */
  private generateEmailCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generate SMS verification code
   */
  private generateSMSCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Get security question for user
   */
  private async getSecurityQuestion(userId: string): Promise<string> {
    const { data: user, error } = await this.supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .single();

    if (error || !user?.metadata?.security_questions) {
      throw new Error('No security questions found for user');
    }

    const questions = user.metadata.security_questions;
    const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
    return randomQuestion.question;
  }

  /**
   * Send email challenge
   */
  private async sendEmailChallenge(challenge: VerificationChallenge): Promise<void> {
    // This would integrate with your email service
    console.log(`Sending email verification code ${challenge.challenge} to user ${challenge.userId}`);
  }

  /**
   * Send SMS challenge
   */
  private async sendSMSChallenge(challenge: VerificationChallenge): Promise<void> {
    // This would integrate with your SMS service
    console.log(`Sending SMS verification code ${challenge.challenge} to user ${challenge.userId}`);
  }

  /**
   * Validate challenge response
   */
  private async validateChallengeResponse(
    challenge: VerificationChallenge,
    response: string
  ): Promise<boolean> {
    switch (challenge.type) {
      case 'email':
      case 'sms':
        return challenge.challenge === response.trim();
      
      case 'security_question':
        return await this.validateSecurityQuestionAnswer(challenge.userId, challenge.challenge, response);
      
      default:
        return false;
    }
  }

  /**
   * Validate security question answer
   */
  private async validateSecurityQuestionAnswer(
    userId: string,
    question: string,
    answer: string
  ): Promise<boolean> {
    const { data: user, error } = await this.supabase
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .single();

    if (error || !user?.metadata?.security_questions) {
      return false;
    }

    const questions = user.metadata.security_questions;
    const matchingQuestion = questions.find((q: any) => q.question === question);
    
    if (!matchingQuestion) {
      return false;
    }

    // Case-insensitive comparison
    return matchingQuestion.answer.toLowerCase().trim() === answer.toLowerCase().trim();
  }

  /**
   * Get verification challenge from database
   */
  private async getVerificationChallenge(challengeId: string): Promise<VerificationChallenge | null> {
    const { data, error } = await this.supabase
      .from('verification_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      type: data.type,
      challenge: data.challenge_data,
      expiresAt: new Date(data.expires_at),
      attempts: data.attempts,
      maxAttempts: data.max_attempts,
      verified: data.verified
    };
  }

  /**
   * Update challenge attempts
   */
  private async updateChallengeAttempts(challengeId: string, attempts: number): Promise<void> {
    await this.supabase
      .from('verification_challenges')
      .update({ attempts })
      .eq('id', challengeId);
  }

  /**
   * Mark challenge as verified
   */
  private async markChallengeVerified(challengeId: string): Promise<void> {
    await this.supabase
      .from('verification_challenges')
      .update({ 
        verified: true,
        verified_at: new Date().toISOString()
      })
      .eq('id', challengeId);
  }

  /**
   * Invalidate challenge
   */
  private async invalidateChallenge(challengeId: string): Promise<void> {
    await this.supabase
      .from('verification_challenges')
      .update({ 
        verified: false,
        invalidated_at: new Date().toISOString()
      })
      .eq('id', challengeId);
  }

  /**
   * Log verification event
   */
  private async logVerificationEvent(
    userId: string,
    challengeId: string,
    event: 'success' | 'failed_attempt' | 'expired' | 'invalidated'
  ): Promise<void> {
    await this.supabase
      .from('verification_events')
      .insert({
        user_id: userId,
        challenge_id: challengeId,
        event_type: event,
        timestamp: new Date().toISOString()
      });
  }

  /**
   * Check if challenge is verified and valid
   */
  async isChallengeVerified(challengeId: string, userId: string): Promise<boolean> {
    const challenge = await this.getVerificationChallenge(challengeId);
    
    return !!(
      challenge &&
      challenge.userId === userId &&
      challenge.verified &&
      challenge.expiresAt > new Date()
    );
  }
}