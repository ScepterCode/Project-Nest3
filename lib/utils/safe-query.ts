/**
 * Safe query wrapper that provides fallback behavior for failed database queries
 */
export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  fallbackData: T,
  context: string = 'Query'
): Promise<{ data: T; error: any | null }> {
  try {
    const result = await queryFn();
    
    if (result.error) {
      console.warn(`${context} failed, using fallback:`, result.error.message);
      return { data: fallbackData, error: result.error };
    }
    
    return { data: result.data || fallbackData, error: null };
  } catch (error) {
    console.warn(`${context} threw error, using fallback:`, error);
    return { data: fallbackData, error };
  }
}

/**
 * Safe analytics query that never throws errors
 */
export async function safeAnalyticsQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  fallbackData: T,
  context: string = 'Analytics query'
): Promise<T> {
  try {
    const result = await queryFn();
    
    if (result.error) {
      console.log(`ℹ️ ${context} not available:`, result.error.message);
      return fallbackData;
    }
    
    return result.data || fallbackData;
  } catch (error) {
    console.log(`ℹ️ ${context} failed:`, error instanceof Error ? error.message : 'Unknown error');
    return fallbackData;
  }
}

/**
 * Check if a table exists and is accessible
 */
export async function checkTableAccess(
  supabase: any,
  tableName: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from(tableName)
      .select('count')
      .limit(1);
      
    return !error;
  } catch {
    return false;
  }
}