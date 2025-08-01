"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, User, GraduationCap, BookOpen, Shield, Settings } from 'lucide-react';

interface UserRole {
  role: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  description: string;
}

export function RoleSwitcher() {
  const { user } = useAuth();
  const router = useRouter();
  const [currentRole, setCurrentRole] = useState<string>('student');
  const [availableRoles, setAvailableRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  const roleDefinitions: Record<string, UserRole> = {
    student: {
      role: 'student',
      label: 'Student',
      icon: <GraduationCap className="h-4 w-4" />,
      path: '/dashboard/student',
      description: 'Access classes, assignments, and grades'
    },
    teacher: {
      role: 'teacher',
      label: 'Teacher',
      icon: <BookOpen className="h-4 w-4" />,
      path: '/dashboard/teacher',
      description: 'Manage classes, create assignments'
    },
    department_admin: {
      role: 'department_admin',
      label: 'Department Admin',
      icon: <Shield className="h-4 w-4" />,
      path: '/dashboard/department_admin',
      description: 'Manage department users and classes'
    },
    institution_admin: {
      role: 'institution_admin',
      label: 'Institution Admin',
      icon: <Settings className="h-4 w-4" />,
      path: '/dashboard/institution',
      description: 'Manage institution settings'
    },
    system_admin: {
      role: 'system_admin',
      label: 'System Admin',
      icon: <Shield className="h-4 w-4" />,
      path: '/dashboard/admin',
      description: 'System-wide administration'
    }
  };

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) return;

      try {
        const supabase = createClient();
        const { data: userData, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        if (error) {
          console.log('Database not available, using default role');
          // Fallback to user metadata or default
          const fallbackRole = user.user_metadata?.role || 'student';
          setCurrentRole(fallbackRole);
          setAvailableRoles([roleDefinitions[fallbackRole]]);
        } else {
          const userRole = userData.role || 'student';
          setCurrentRole(userRole);
          
          // For now, show only the user's assigned role
          // In a more complex system, users might have multiple roles
          setAvailableRoles([roleDefinitions[userRole]]);
        }
      } catch (error) {
        console.log('Error fetching user role, using fallback');
        const fallbackRole = user.user_metadata?.role || 'student';
        setCurrentRole(fallbackRole);
        setAvailableRoles([roleDefinitions[fallbackRole]]);
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();
  }, [user]);

  const handleRoleSwitch = (role: string) => {
    const roleInfo = roleDefinitions[role];
    if (roleInfo) {
      setCurrentRole(role);
      router.push(roleInfo.path);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
      </div>
    );
  }

  const currentRoleInfo = roleDefinitions[currentRole];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          {currentRoleInfo?.icon}
          <span className="hidden sm:inline">{currentRoleInfo?.label}</span>
          <Badge variant="secondary" className="hidden md:inline">
            {currentRole}
          </Badge>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Current Role
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {availableRoles.map((role) => (
          <DropdownMenuItem
            key={role.role}
            onClick={() => handleRoleSwitch(role.role)}
            className="flex flex-col items-start gap-1 p-3"
          >
            <div className="flex items-center gap-2 w-full">
              {role.icon}
              <span className="font-medium">{role.label}</span>
              {role.role === currentRole && (
                <Badge variant="default" className="ml-auto text-xs">
                  Active
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {role.description}
            </span>
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => router.push('/dashboard')}
          className="text-sm text-muted-foreground"
        >
          <Settings className="h-4 w-4 mr-2" />
          Dashboard Home
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}