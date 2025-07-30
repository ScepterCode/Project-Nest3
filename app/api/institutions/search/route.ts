import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { InstitutionSearchResult } from '@/lib/types/onboarding';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'Query must be at least 2 characters long' 
      }, { status: 400 });
    }

    const supabase = createClient();
    
    // Get the current user to ensure they're authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Get user profile to check permissions
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError || !userProfile) {
      return NextResponse.json({ 
        success: false, 
        error: 'User profile not found' 
      }, { status: 404 });
    }

    // Search institutions with fuzzy matching
    const { data: institutions, error } = await supabase
      .from('institutions')
      .select(`
        id,
        name,
        domain,
        type,
        status,
        departments:departments(count),
        users:users(count)
      `)
      .ilike('name', `%${query.trim()}%`)
      .eq('status', 'active')
      .limit(10);

    if (error) {
      console.error('Institution search error:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to search institutions' 
      }, { status: 500 });
    }

    // Transform the data to match our interface
    const results: InstitutionSearchResult[] = institutions.map(institution => ({
      id: institution.id,
      name: institution.name,
      domain: institution.domain,
      type: institution.type,
      departmentCount: institution.departments?.[0]?.count || 0,
      userCount: institution.users?.[0]?.count || 0
    }));

    return NextResponse.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Institution search API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}