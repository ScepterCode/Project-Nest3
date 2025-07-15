import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-3xl font-bold">Welcome to the Institution Portal</h1>
      <div className="flex gap-4">
        <Link
          href="/auth/sign-up"
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Sign Up
        </Link>
        <Link
          href="/auth/login"
          className="px-4 py-2 bg-gray-600 text-white rounded"
        >
          Login
        </Link>
      </div>
    </main>
  );
}
