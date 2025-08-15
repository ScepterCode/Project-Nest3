/**
 * Utility function to retry failed database queries
 */
export async function retryQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<{ data: T | null; error: any }> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await queryFn();
      
      if (!result.error) {
        return result;
      }
      
      lastError = result.error;
      
      // Don't retry on certain types of errors
      if (result.error?.code === 'PGRST116' || // Not found
          result.error?.code === '42P01' ||    // Table doesn't exist
          result.error?.code === '42703') {    // Column doesn't exist
        break;
      }
      
      if (attempt < maxRetries) {
        console.log(`Query attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.log(`Query attempt ${attempt} threw error, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }
  
  return { data: null, error: lastError };
}

/**
 * Enhanced error logging utility
 */
export function logError(context: string, error: any, additionalInfo?: any) {
  console.error(`${context}:`, error);
  
  if (error && typeof error === 'object') {
    console.error(`${context} details:`, JSON.stringify(error, null, 2));
  }
  
  if (additionalInfo) {
    console.error(`${context} additional info:`, additionalInfo);
  }
}