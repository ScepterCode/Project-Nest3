import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requireRole } from '@/lib/auth'

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole(['institution'])
    const targetUserId = params.id

    const supabase = createClient()

    const { error } = await supabase
      .from('users')
      .update({ status: 'suspended' })
      .eq('id', targetUserId)
      .eq('institution_id', user.institutionId) // Ensure institution can only suspend their own users

    if (error) throw error

    return NextResponse.json({ message: `User ${targetUserId} suspended successfully` })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error suspending user:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
