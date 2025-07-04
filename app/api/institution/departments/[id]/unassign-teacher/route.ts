import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requireRole } from '@/lib/auth'

export async function DELETE(request: Request, { params }: { params: { departmentId: string } }) {
  try {
    const user = await requireRole(['institution'])
    const departmentId = params.id

    const supabase = createClient()

    const { teacherId } = await request.json()

    if (!teacherId) {
      return new NextResponse('Missing teacher ID', { status: 400 })
    }

    const { data, error } = await supabase
      .from('users')
      .update({ department_id: null })
      .eq('id', teacherId)
      .eq('role', 'teacher')
      .eq('institution_id', user.institutionId) // Ensure institution can only unassign their own teachers

    if (error) throw error

    return NextResponse.json({ message: `Teacher ${teacherId} unassigned from department ${departmentId} successfully` })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error unassigning teacher from department:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
