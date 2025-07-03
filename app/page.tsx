import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BookOpen, Users, Target, Calendar } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <BookOpen className="h-8 w-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Project Nest</h1>
          </div>
          <div className="space-x-4">
            <Link href="/auth/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/auth/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
          Collaborative Task Management for <span className="text-blue-600">Modern Classrooms</span>
        </h2>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
          A digital command center that streamlines assignment management, boosts student engagement, and prepares
          learners for real-world teamwork.
        </p>
        <div className="space-x-4">
          <Link href="/auth/register">
            <Button size="lg" className="px-8 py-3">
              Start Free Trial
            </Button>
          </Link>
          <Link href="#features">
            <Button variant="outline" size="lg" className="px-8 py-3 bg-transparent">
              Learn More
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-16">
        <h3 className="text-3xl font-bold text-center mb-12 text-gray-900 dark:text-white">Core Features</h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <Target className="h-8 w-8 text-blue-600 mb-2" />
              <CardTitle>Task Creation & Submission</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Teachers create assignments with instructions, attachments, and due dates. Students submit work in a
                centralized platform.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Calendar className="h-8 w-8 text-green-600 mb-2" />
              <CardTitle>Smart Deadline Tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Automated reminders, calendar sync, and real-time notifications keep everyone on track.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Users className="h-8 w-8 text-purple-600 mb-2" />
              <CardTitle>Peer Collaboration</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Students form teams, assign roles, and manage deliverables in shared workspaces.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <BookOpen className="h-8 w-8 text-orange-600 mb-2" />
              <CardTitle>Feedback Management</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Teachers provide inline feedback, grades, and track student progress with comprehensive dashboards.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="container mx-auto px-4 py-16">
        <h3 className="text-3xl font-bold text-center mb-12 text-gray-900 dark:text-white">Choose Your Plan</h3>
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Free</CardTitle>
              <CardDescription>Perfect for trying out Project Nest</CardDescription>
              <div className="text-3xl font-bold">$0</div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>• 2GB storage</li>
                <li>• 1 class</li>
                <li>• 3 group projects</li>
                <li>• Basic support</li>
              </ul>
              <Button className="w-full mt-4 bg-transparent" variant="outline">
                Get Started
              </Button>
            </CardContent>
          </Card>

          <Card className="border-blue-500 relative">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
              <span className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm">Most Popular</span>
            </div>
            <CardHeader>
              <CardTitle>Premium</CardTitle>
              <CardDescription>For individual teachers</CardDescription>
              <div className="text-3xl font-bold">
                $5<span className="text-sm font-normal">/month</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>• Unlimited storage</li>
                <li>• Unlimited classes</li>
                <li>• Advanced tools</li>
                <li>• LMS integration</li>
                <li>• Priority support</li>
              </ul>
              <Button className="w-full mt-4">Start Free Trial</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Institution</CardTitle>
              <CardDescription>For schools and organizations</CardDescription>
              <div className="text-3xl font-bold">Custom</div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>• Bulk pricing</li>
                <li>• Admin controls</li>
                <li>• White-labeling</li>
                <li>• Analytics</li>
                <li>• Dedicated support</li>
              </ul>
              <Button className="w-full mt-4 bg-transparent" variant="outline">
                Contact Sales
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <BookOpen className="h-6 w-6" />
            <span className="text-xl font-bold">Project Nest</span>
          </div>
          <p className="text-gray-400">Empowering modern classrooms with collaborative task management</p>
        </div>
      </footer>
    </div>
  )
}
