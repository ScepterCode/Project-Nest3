import { createClient } from '@/lib/supabase/client'

/**
 * Class code generation utility
 * Generates unique alphanumeric codes for classes
 */

export interface ClassCodeOptions {
  className?: string
  maxRetries?: number
}

/**
 * Generates a unique class code with the following format:
 * - 8-10 characters total
 * - Alphanumeric characters only (A-Z, 0-9)
 * - Format: [CLASS_PREFIX][RANDOM_SUFFIX]
 * - Example: MATH101A, BIO2024B, HIST456C
 */
export class ClassCodeGenerator {
  private static readonly CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  private static readonly MIN_LENGTH = 8
  private static readonly MAX_LENGTH = 10
  private static readonly MAX_RETRIES = 10

  /**
   * Generates a class code based on the class name
   * @param className - The name of the class to generate code for
   * @returns A formatted class code (e.g., "MATH101A")
   */
  private static generateCodeFromName(className: string): string {
    // Extract alphanumeric characters from class name
    const cleanName = className.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    
    // Take first 4-6 characters as prefix
    const prefixLength = Math.min(6, Math.max(4, cleanName.length))
    const prefix = cleanName.substring(0, prefixLength).padEnd(4, 'X')
    
    // Generate random suffix to reach 8-10 characters
    const remainingLength = Math.max(2, this.MIN_LENGTH - prefix.length)
    const suffixLength = Math.min(4, remainingLength)
    
    let suffix = ''
    for (let i = 0; i < suffixLength; i++) {
      suffix += this.CHARS.charAt(Math.floor(Math.random() * this.CHARS.length))
    }
    
    const code = prefix + suffix
    
    // Ensure code is within length limits
    return code.substring(0, this.MAX_LENGTH)
  }

  /**
   * Generates a random class code
   * @returns A random alphanumeric code
   */
  private static generateRandomCode(): string {
    const length = Math.floor(Math.random() * (this.MAX_LENGTH - this.MIN_LENGTH + 1)) + this.MIN_LENGTH
    let code = ''
    
    for (let i = 0; i < length; i++) {
      code += this.CHARS.charAt(Math.floor(Math.random() * this.CHARS.length))
    }
    
    return code
  }

  /**
   * Checks if a class code is unique in the database
   * @param code - The code to check
   * @returns Promise<boolean> - true if unique, false if already exists
   */
  private static async isCodeUnique(code: string): Promise<boolean> {
    try {
      const supabase = createClient()
      
      // First check if we can connect to the database
      const { data, error } = await supabase
        .from('classes')
        .select('id')
        .eq('code', code)
        .limit(1)

      if (error) {
        console.error('Database error checking code uniqueness:', {
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        
        // If it's a table doesn't exist error, we can assume the code is unique
        if (error.message.includes('relation "classes" does not exist') || 
            error.code === 'PGRST116' || 
            error.code === '42P01') {
          console.warn('Classes table does not exist, assuming code is unique')
          return true
        }
        
        throw new Error(`Database error: ${error.message}`)
      }

      return !data || data.length === 0
    } catch (error) {
      console.error('Error in isCodeUnique:', error)
      
      // If it's a network error or connection issue, we should still try to continue
      if (error instanceof Error && (
        error.message.includes('fetch') || 
        error.message.includes('network') ||
        error.message.includes('connection')
      )) {
        console.warn('Network error checking code uniqueness, assuming code is unique')
        return true
      }
      
      throw error
    }
  }

  /**
   * Generates a unique class code
   * @param options - Configuration options
   * @returns Promise<string> - A unique class code
   * @throws Error if unable to generate unique code after max retries
   */
  public static async generateUniqueCode(options: ClassCodeOptions = {}): Promise<string> {
    const { className, maxRetries = this.MAX_RETRIES } = options
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Generate code based on class name if provided, otherwise random
        let code = className 
          ? this.generateCodeFromName(className)
          : this.generateRandomCode()

        // Add timestamp-based suffix for better uniqueness on retries
        if (attempt > 0) {
          const timestamp = Date.now().toString().slice(-3)
          code = code.substring(0, this.MAX_LENGTH - 3) + timestamp
        }

        // Check if code is unique
        const isUnique = await this.isCodeUnique(code)
        
        if (isUnique) {
          console.log(`Generated unique class code: ${code} (attempt ${attempt + 1})`)
          return code
        }
        
        // If not unique, try again with slight variation
        console.log(`Code ${code} already exists, retrying... (attempt ${attempt + 1}/${maxRetries})`)
        
      } catch (error) {
        console.error(`Error generating code on attempt ${attempt + 1}:`, error)
        
        // If database is unavailable, generate a code with timestamp for uniqueness
        if (error instanceof Error && (
          error.message.includes('Database error') ||
          error.message.includes('fetch') ||
          error.message.includes('network')
        )) {
          console.warn('Database unavailable, generating timestamp-based code')
          const timestamp = Date.now().toString()
          const fallbackCode = className 
            ? this.generateCodeFromName(className).substring(0, 6) + timestamp.slice(-4)
            : 'CLASS' + timestamp.slice(-6)
          
          console.log(`Generated fallback code: ${fallbackCode}`)
          return fallbackCode.substring(0, this.MAX_LENGTH)
        }
        
        // If it's the last attempt, throw the error
        if (attempt === maxRetries - 1) {
          throw new Error(`Failed to generate unique class code after ${maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
        
        // Otherwise, continue to next attempt
        continue
      }
    }
    
    throw new Error(`Failed to generate unique class code after ${maxRetries} attempts`)
  }

  /**
   * Validates a class code format
   * @param code - The code to validate
   * @returns boolean - true if valid format
   */
  public static validateCodeFormat(code: string): boolean {
    if (!code || typeof code !== 'string') {
      return false
    }
    
    // Check length
    if (code.length < this.MIN_LENGTH || code.length > this.MAX_LENGTH) {
      return false
    }
    
    // Check characters (only alphanumeric)
    const validChars = /^[A-Z0-9]+$/
    return validChars.test(code)
  }

  /**
   * Formats a code for display (adds spacing for readability)
   * @param code - The code to format
   * @returns string - Formatted code
   */
  public static formatForDisplay(code: string): string {
    if (!code || code.length <= 4) {
      return code
    }
    
    // Add space after first 4 characters for readability
    return code.substring(0, 4) + ' ' + code.substring(4)
  }
}

/**
 * Simple fallback function to generate a class code without database checks
 * Used when database is unavailable or as a last resort
 */
export function generateSimpleClassCode(className?: string): string {
  const timestamp = Date.now().toString()
  
  if (className) {
    const cleanName = className.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const prefix = cleanName.substring(0, 4).padEnd(4, 'X')
    return prefix + timestamp.slice(-4)
  }
  
  return 'CLASS' + timestamp.slice(-6)
}

// Export convenience functions
export const generateUniqueClassCode = ClassCodeGenerator.generateUniqueCode
export const validateClassCodeFormat = ClassCodeGenerator.validateCodeFormat
export const formatClassCodeForDisplay = ClassCodeGenerator.formatForDisplay