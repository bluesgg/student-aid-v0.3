import { AppHeader } from '@/components/app-header'
import { CourseList } from '@/features/courses/components/course-list'

export default function CoursesPage() {
  return (
    <div className="min-h-screen bg-secondary-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CourseList />
      </main>
    </div>
  )
}

export const metadata = {
  title: 'My Courses - StudentAid',
  description: 'Manage your courses and study materials',
}
