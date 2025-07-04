import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createSession, createUser, requireRole } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const user = await requireRole(['institution'])

    const supabase = createClient()

    const { email, firstName, lastName, role, institutionName } = await request.json()

    if (!email || !firstName || !lastName || !role) {
      return new NextResponse('Missing required fields', { status: 400 })
    }

    const newUser = await createUser({
      email,
      firstName,
      lastName,
      role,
      institutionId: user.institutionId, // Assign to institution of the inviting user
      institutionName: institutionName || user.institutionName, // Assign to institution of the inviting user
      password,
    })

    return NextResponse.json({ message: 'User invited successfully', user: newUser })
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new NextResponse('Unauthorized', { status: 401 })
    }
    console.error('Error inviting user:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
