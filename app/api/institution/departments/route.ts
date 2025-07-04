import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { requireRole } from '@/lib/auth'
import { generateRandomId } from '@/lib/utils'

export async function POST(request: Request) {
  try {
    const user = await requireRole(['institution'])

    const supabase = createClient()

    const { name } = await request.json()

    if (!name) {
      return new NextResponse('Missing department name', { status: 400 })
    }

    const newDepartment = {
      id: generateRandomId('dept_'),
      name,
      institution_id: user.institutionId, // Link to the institution of the creator
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Example: Insert into Supabase
    // const { data, error } = await supabase
    //   .from('departments')
    //   .insert([newDepartment])
    //   .select()

    // if (error) throw error

    return NextResponse.json({ message: 'Department created successfully', department: newDepartment })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error creating department:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireRole(['institution'])

    const supabase = createClient()

    const { data, error } = await supabase
      .from('departments')
      .select('id, name')
      .eq('institution_id', user.institutionId)

    if (error) throw error

    const departments = data

    return NextResponse.json(departments)
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error fetching departments:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
