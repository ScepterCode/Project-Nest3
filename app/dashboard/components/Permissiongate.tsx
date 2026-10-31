import {
  BarChart,
  ClipboardCheck,
  ClipboardList,
  Clapperboard,
  FileText,
  GraduationCap,
  House,
  Layers,
  LineChart,
  Upload,
  User,
  UserCog,
} from 'lucide-react';

export const studentsRolegate = [
  {
    permission: 'classes.read',
    text: 'Home',
    href: '/dashboard/student',
    icon: <House />,
    exact: true,
  },
  {
    permission: 'classes.read',
    text: 'Classes',
    href: '/dashboard/student/classes',
    icon: <GraduationCap />,
  },
  {
    permission: 'assignments.read',
    text: 'Work',
    href: '/dashboard/student/assignments',
    icon: <FileText />,
  },
  {
    permission: 'grades.read',
    text: 'Grades',
    href: '/dashboard/student/grades',
    icon: <BarChart />,
  },
  {
    permission: 'peer_reviews.read',
    text: 'Peer reviews',
    href: '/dashboard/student/peer-reviews',
    icon: <ClipboardCheck />,
  },
  {
    permission: 'grades.read',
    text: 'Portfolio',
    href: '/dashboard/portfolio',
    icon: <Layers />,
  },
  {
    permission: 'assignments.read',
    text: 'Projects',
    href: '/dashboard/projects',
    icon: <Clapperboard />,
  },
];
export const teachersRolegate = [
  {
    permission: 'classes.manage',
    text: 'Classes',
    href: '/dashboard/teacher/classes',
    icon: <GraduationCap />,
  },
  {
    permission: 'assignments.manage',
    text: 'Assignments',
    href: '/dashboard/teacher/assignments',
    icon: <FileText />,
  },
  {
    permission: 'peer_reviews.manage',
    text: 'Peer reviews',
    href: '/dashboard/teacher/peer-reviews',
    icon: <ClipboardCheck />,
  },
  {
    permission: 'analytics.read',
    text: 'Analytics',
    href: '/dashboard/teacher/analytics',
    icon: <LineChart />,
  },
  {
    permission: 'rubrics.manage',
    text: 'Marking guides',
    href: '/dashboard/teacher/rubrics',
    icon: <ClipboardList />,
  },
  {
    permission: 'classes.manage',
    text: 'Projects',
    href: '/dashboard/projects',
    icon: <Clapperboard />,
  },
];
export const InstitutionRolegate = [
  {
    permission: 'users.manage',
    text: 'People',
    href: '/dashboard/institution/users',
    icon: <User />,
  },
  {
    permission: 'users.manage',
    text: 'Role requests',
    href: '/dashboard/institution/role-requests',
    icon: <ClipboardCheck />,
  },
  {
    permission: 'users.manage',
    text: 'Bulk import',
    href: '/dashboard/institution/bulk-import',
    icon: <Upload />,
  },
  {
    permission: 'users.manage',
    text: 'Bulk roles',
    href: '/dashboard/institution/bulk-role-assignment',
    icon: <UserCog />,
  },
  {
    permission: 'departments.manage',
    text: 'Departments',
    href: '/dashboard/institution/departments',
    icon: <Layers />,
  },
  {
    permission: 'reports.read',
    text: 'Reports',
    href: '/dashboard/institution/reports',
    icon: <FileText />,
  },
  {
    permission: 'reports.read',
    text: 'Programmes',
    href: '/dashboard/programmes',
    icon: <Clapperboard />,
  },
];
