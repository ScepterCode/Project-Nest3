import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requireRole } from '@/lib/auth'

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole(['institution'])
    const departmentId = params.id

    const supabase = createClient()

    const { name } = await request.json()

    if (!name) {
      return new NextResponse('Missing department name', { status: 400 })
    }

    // In a real application, you would update the department in your database
    // For this mock, we'll just log the action.
    console.log(`Institution ${user.id} updating department ${departmentId} with name ${name}`)

    // Example: Update department in Supabase
    // const { data, error } = await supabase
    //   .from('departments')
    //   .update({ name, updated_at: new Date().toISOString() })
    //   .eq('id', departmentId)
    //   .eq('institution_id', user.institutionId) // Ensure institution can only update their own departments

    // if (error) throw error

    return NextResponse.json({ message: `Department ${departmentId} updated successfully` })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error updating department:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole(['institution'])
    const departmentId = params.id

    const supabase = createClient()

    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', departmentId)
      .eq('institution_id', user.institutionId) // Ensure institution can only delete their own departments

    if (error) throw error

    return NextResponse.json({ message: `Department ${departmentId} deleted successfully` })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error deleting department:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
