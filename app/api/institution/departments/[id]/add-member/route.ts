import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requireRole } from '@/lib/auth'
import { generateRandomId } from '@/lib/utils'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole(['institution'])
    const departmentId = params.id

    const supabase = createClient()

    const { userId, memberRole } = await request.json()

    if (!userId || !memberRole) {
      return new NextResponse('Missing user ID or member role', { status: 400 })
    }

    const newDepartmentMember = {
      id: generateRandomId('dept_member_'),
      department_id: departmentId,
      user_id: userId,
      role: memberRole,
      created_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('department_members')
      .insert([newDepartmentMember])
      .select()

    if (error) throw error

    return NextResponse.json({ message: 'Member added to department successfully', member: newDepartmentMember })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error adding member to department:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
