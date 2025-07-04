import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requireRole } from '@/lib/auth'

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole(['institution'])
    const targetUserId = params.id

    const supabase = createClient()

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', targetUserId)
      .eq('institution_id', user.institutionId) // Ensure institution can only delete their own users

    if (error) throw error

    return NextResponse.json({ message: `User ${targetUserId} deleted successfully` })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error deleting user:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
