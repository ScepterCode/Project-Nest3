import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requireRole } from '@/lib/auth'

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole(['institution'])
    const departmentId = params.id

    const supabase = createClient()

    const { userId } = await request.json()

    if (!userId) {
      return new NextResponse('Missing user ID', { status: 400 })
    }

    const { error } = await supabase
      .from('department_members')
      .delete()
      .eq('department_id', departmentId)
      .eq('user_id', userId)

    if (error) throw error

    return NextResponse.json({ message: `User ${userId} removed from department ${departmentId} successfully` })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error removing member from department:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
