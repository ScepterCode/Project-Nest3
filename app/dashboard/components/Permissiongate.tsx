import {
  BarChart,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  Landmark,
  Layers,
  LineChart,
  User,
} from 'lucide-react';

export const studentsRolegate = [
  {
    permission: 'assignments.read',
    text: 'Assignment',
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
    text: 'Peer Reviews',
    href: '/dashboard/student/peer-reviews',
    icon: <ClipboardCheck />,
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
    text: 'Peer Reviews',
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
    text: 'Rubrics',
    href: '/dashboard/teacher/rubrics',
    icon: <ClipboardList />,
  },
];
export const InstitutionRolegate = [
  {
    permission: 'users.manage',
    text: 'Users',
    href: '/dashboard/institution/users',
    icon: <User />,
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
];
export const DepartmentRolegate = [
  {
    permission: 'department_users.manage',
    text: 'Department Users',
    href: '/dashboard/department_admin/users',
    icon: <User />,
  },
  {
    permission: 'department_classes.manage',
    text: 'Classes',
    href: '/dashboard/department_admin/classes',
    icon: <GraduationCap />,
  },
  {
    permission: 'reports.read',
    text: 'Reports',
    href: '/dashboard/institution/reports',
    icon: <FileText />,
  },
];
export const SystemRolegate = [
  {
    permission: 'system.manage',
    text: 'Institutions',
    href: '/dashboard/admin/institutions',
    Icon: <Landmark />,
  },
  {
    permission: 'system.manage',
    text: 'All Users',
    href: '/dashboard/admin/users',
    icon: <User />,
  },
];
