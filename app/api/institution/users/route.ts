import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requireRole } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const user = await requireRole(['institution'])

    const supabase = createClient()

    const { data, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, role')
      .eq('institution_id', user.institutionId)

    if (error) throw error

    const users = data.map((u: any) => ({
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role,
      institutionId: u.institution_id,
      institutionName: u.institution_name,
    }))

    return NextResponse.json(users)
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error fetching users:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
