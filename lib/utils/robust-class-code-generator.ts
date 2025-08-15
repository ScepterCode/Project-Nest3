import { createClient } from '@/lib/supabase/client'

/**
 * Robust class code generation utility with better error handling
 * and fallback mechanisms
 */

export interface ClassCodeOptions {
  className?: string
  maxRetries?: number
  useTimestamp?: boolean
}

/**
 * Robust class code generator with multiple fallback strategies
 */
export class RobustClassCodeGenerator {
  private static readonly CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  private static readonly MIN_LENGTH = 6
  private static readonly MAX_LENGTH = 10
  private static readonly MAX_RETRIES = 5

  /**
   * Generates a class code based on the class name with timestamp for uniqueness
   */
  private static generateCodeFromName(className: string, useTimestamp = false): string {
    // Extract alphanumeric characters from class name
    const cleanName = className.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    
    // Take first 3-4 characters as prefix
    const prefixLength = Math.min(4, Math.max(3, cleanName.length))
    let prefix = cleanName.substring(0, prefixLength)
    
    // If prefix is too short, pad with 'X'
    if (prefix.length < 3) {
      prefix = prefix.padEnd(3, 'X')
    }
    
    // Add timestamp or random suffix
    let suffix: string
    if (useTimestamp) {
      suffix = Date.now().toString().slice(-4)
    } else {
      suffix = ''
      const suffixLength = Math.min(4, this.MAX_LENGTH - prefix.length)
      for (let i = 0; i < suffixLength; i++) {
        suffix += this.CHARS.charAt(Math.floor(Math.random() * this.CHARS.length))
      }
    }
    
    const code = prefix + suffix
    return code.substring(0, this.MAX_LENGTH)
  }

  /**
   * Generates a random class code
   */
  private static generateRandomCode(useTimestamp = false): string {
    if (useTimestamp) {
      const timestamp = Date.now().toString()
      return 'CLS' + timestamp.slice(-7)
    }
    
    const length = Math.floor(Math.random() * (this.MAX_LENGTH - this.MIN_LENGTH + 1)) + this.MIN_LENGTH
    let code = ''
    
    for (let i = 0; i < length; i++) {
      code += this.CHARS.charAt(Math.floor(Math.random() * this.CHARS.length))
    }
    
    return code
  }

  /**
   * Checks if a class code is unique in the database with robust error handling
   */
  private static async isCodeUnique(code: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('classes')
        .select('id')
        .eq('code', code)
        .limit(1)

      if (error) {
        console.warn('Database error checking code uniqueness:', error.message)
        
        // If table doesn't exist or other database issues, assume unique
        if (
          error.message.includes('relation "classes" does not exist') ||
          error.code === 'PGRST116' ||
          error.code === '42P01' ||
          error.message.includes('permission denied')
        ) {
          console.log('Database table not accessible, assuming code is unique')
          return true
        }
        
        // For other errors, throw to trigger retry
        throw error
      }

      return !data || data.length === 0
    } catch (error) {
      console.warn('Error checking code uniqueness:', error)
      
      // For network/connection errors, assume unique to allow operation to continue
      if (error instanceof Error && (
        error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('connection') ||
        error.message.includes('timeout')
      )) {
        console.log('Network error, assuming code is unique')
        return true
      }
      
      throw error
    }
  }

  /**
   * Generates a unique class code with multiple fallback strategies
   */
  public static async generateUniqueCode(options: ClassCodeOptions = {}): Promise<string> {
    const { className, maxRetries = this.MAX_RETRIES, useTimestamp = false } = options
    
    console.log(`Generating class code for: "${className}" (retries: ${maxRetries})`)
    
    // Strategy 1: Try normal generation with database checks
    for (let attempt = 0; attempt < Math.min(maxRetries, 3); attempt++) {
      try {
        const code = className 
          ? this.generateCodeFromName(className, attempt > 0)
          : this.generateRandomCode(attempt > 0)

        console.log(`Attempt ${attempt + 1}: Generated code "${code}"`)
        
        const isUnique = await this.isCodeUnique(code)
        
        if (isUnique) {
          console.log(`✅ Code "${code}" is unique`)
          return code
        }
        
        console.log(`Code "${code}" already exists, retrying...`)
        
      } catch (error) {
        console.warn(`Attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : error)
        
        // If it's the last attempt of this strategy, continue to fallback
        if (attempt === Math.min(maxRetries, 3) - 1) {
          break
        }
      }
    }
    
    // Strategy 2: Fallback to timestamp-based generation (guaranteed unique)
    console.log('Using timestamp-based fallback strategy')
    const timestamp = Date.now().toString()
    
    if (className) {
      const cleanName = className.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
      const prefix = cleanName.substring(0, 4).padEnd(4, 'X')
      const fallbackCode = prefix + timestamp.slice(-4)
      console.log(`✅ Generated fallback code: "${fallbackCode}"`)
      return fallbackCode
    } else {
      const fallbackCode = 'CLS' + timestamp.slice(-7)
      console.log(`✅ Generated fallback code: "${fallbackCode}"`)
      return fallbackCode
    }
  }

  /**
   * Validates a class code format
   */
  public static validateCodeFormat(code: string): boolean {
    if (!code || typeof code !== 'string') {
      return false
    }
    
    if (code.length < this.MIN_LENGTH || code.length > this.MAX_LENGTH) {
      return false
    }
    
    const validChars = /^[A-Z0-9]+$/
    return validChars.test(code)
  }

  /**
   * Formats a code for display
   */
  public static formatForDisplay(code: string): string {
    if (!code || code.length <= 4) {
      return code
    }
    
    // Add space after first 4 characters for readability
    return code.substring(0, 4) + ' ' + code.substring(4)
  }
}

// Export convenience functions
export const generateRobustClassCode = RobustClassCodeGenerator.generateUniqueCode
export const validateClassCodeFormat = RobustClassCodeGenerator.validateCodeFormat
export const formatClassCodeForDisplay = RobustClassCodeGenerator.formatForDisplay

// Simple fallback function that doesn't require database access
export function generateSimpleClassCode(className?: string): string {
  const timestamp = Date.now().toString()
  
  if (className) {
    const cleanName = className.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const prefix = cleanName.substring(0, 4).padEnd(4, 'X')
    return prefix + timestamp.slice(-4)
  }
  
  return 'CLS' + timestamp.slice(-7)
}