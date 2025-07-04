import { type NextRequest, NextResponse } from "next/server"
import { createUser } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const { firstName, lastName, email, password, role, institutionName } = await request.json()

    if (!firstName || !lastName || !email || !password || !role) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    // Check if user already exists
    // In a real app, you'd check the database

    const newUser = await createUser({
      firstName,
      lastName,
      email,
      password,
      role,
      institutionName,
    })

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        role: newUser.role,
        institution_name: newUser.institution_name,
      },
      redirectUrl: `/dashboard/${newUser.role}`,
    })
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
