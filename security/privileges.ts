import { Row } from '@/lib/lms/types';

export interface PrivilegeDefinition {
  key: string;
  label: string;
  description?: string;
  builtIn?: boolean;
}

export interface RolePrivilegesConfig {
  privileges: PrivilegeDefinition[];
  rolePermissions: Record<string, string[]>;
}

const actionPrivileges: PrivilegeDefinition[] = [
  ...['finance', 'exams', 'events', 'transport'].map((key) => ({
    key,
    label: 'Manage ' + key,
    builtIn: true,
  })),
  { key: 'task_assign', label: 'Assign teacher tasks', builtIn: true },
  { key: 'task_submit', label: 'Submit assigned tasks', builtIn: true },
  { key: 'view_teacherTasks', label: 'View teacher tasks', builtIn: true },
  {
    key: 'delegate_responsibilities',
    label: 'Assign departmental responsibilities',
    builtIn: true,
  },
  { key: 'timetable_department', label: 'Timetable: department scope', builtIn: true },
  { key: 'academic_department', label: 'Academic setup: department scope', builtIn: true },
  { key: 'results_department', label: 'Results: department scope', builtIn: true },
  { key: 'student_enrollment', label: 'Manage student enrollment', builtIn: true },
  {
    key: 'college_setup',
    label: 'Manage college departments, programs and sessions',
    builtIn: true,
  },
  { key: 'manage_access', label: 'Manage all roles and individual permissions', builtIn: true },
  { key: 'system_settings', label: 'Manage system settings', builtIn: true },
  { key: 'manage_backups', label: 'Create and restore database backups', builtIn: true },
  { key: 'reset_passwords', label: 'Reset user passwords', builtIn: true },
  {
    key: 'senior_accounts',
    label: 'Manage senior accounts including administrators',
    builtIn: true,
  },

  {
    key: 'users',
    label: 'Create / edit authorized users',
    description: 'Manage user accounts and credentials',
    builtIn: true,
  },
  {
    key: 'academic',
    label: 'Manage academic structure',
    description: 'Departments, programs, sessions, batches and subject catalogue',
    builtIn: true,
  },
  {
    key: 'timetable',
    label: 'Manage timetable',
    description: 'Lecture timings, room allocation and timetable files',
    builtIn: true,
  },
  {
    key: 'attendance',
    label: 'Record / correct attendance',
    description: 'Mark daily registers and submit correction reasons',
    builtIn: true,
  },
  { key: 'attendance_record', label: 'Record attendance', builtIn: true },
  { key: 'attendance_correct', label: 'Correct submitted attendance', builtIn: true },
  {
    key: 'assignments',
    label: 'Create / grade assignments',
    description: 'Publish coursework, evaluate submissions and give marks',
    builtIn: true,
  },
  {
    key: 'quizzes',
    label: 'Manage quizzes',
    description: 'Publish quiz preparation topics and study documents',
    builtIn: true,
  },
  {
    key: 'results',
    label: 'Enter / publish results',
    description: 'Enter assessment marks and publish class result sheets',
    builtIn: true,
  },
  {
    key: 'materials',
    label: 'Publish learning materials',
    description: 'Upload lecture notes, slides and syllabus files',
    builtIn: true,
  },
  {
    key: 'materials_delete',
    label: 'Delete own learning materials',
    description: 'Administrators can delete any resource; uploaders can delete their own.',
    builtIn: true,
  },
  {
    key: 'announcements',
    label: 'Publish announcements',
    description: 'Post messages to classes or college-wide notice board',
    builtIn: true,
  },
  {
    key: 'reports',
    label: 'View & export reports',
    description: 'Access attendance summaries, mark sheets and table exports',
    builtIn: true,
  },
];

const actionRolePermissions: Record<string, string[]> = {
  ADMIN: [
    'users',
    'academic',
    'timetable',
    'attendance',
    'attendance_record',
    'attendance_correct',
    'assignments',
    'quizzes',
    'results',
    'materials',
    'materials_delete',
    'announcements',
    'reports',
  ],
  PRINCIPAL: ['academic', 'announcements', 'reports', 'college_setup'],
  HOD: [
    'task_assign',
    'view_teacherTasks',
    'delegate_responsibilities',
    'student_enrollment',
    'users',
    'academic',
    'timetable',
    'attendance',
    'attendance_record',
    'attendance_correct',
    'assignments',
    'quizzes',
    'results',
    'materials',
    'materials_delete',
    'announcements',
    'reports',
  ],
  TEACHER: [
    'view_teacherTasks',
    'task_submit',
    'attendance',
    'attendance_record',
    'assignments',
    'quizzes',
    'results',
    'materials',
    'materials_delete',
    'announcements',
  ],
  TREASURER: ['finance', 'announcements'],
  EXAMINATION_CONTROLLER: ['exams', 'results', 'announcements'],
  REGISTRAR: ['events', 'transport', 'announcements'],
  STUDENT: [],
};

// Module visibility is independent of write access. Existing installations keep their views.
const modules = [
  'courseOutlines',
  'subjects',
  'academic',
  'users',
  'attendance',
  'assignments',
  'quizzes',
  'results',
  'materials',
  'timetable',
  'announcements',
];
const views: Record<string, string[]> = {
  TREASURER: ['announcements', 'courseOutlines'],
  EXAMINATION_CONTROLLER: ['announcements', 'courseOutlines', 'results', 'subjects'],
  REGISTRAR: ['announcements', 'courseOutlines'],
  ADMIN: modules,
  PRINCIPAL: ['courseOutlines', 'academic', 'attendance', 'results', 'timetable', 'announcements'],
  STUDENT: [
    'courseOutlines',
    'subjects',
    'attendance',
    'assignments',
    'quizzes',
    'results',
    'materials',
    'timetable',
    'announcements',
  ],
  HOD: modules,
  TEACHER: [
    'courseOutlines',
    'subjects',
    'attendance',
    'assignments',
    'quizzes',
    'results',
    'materials',
    'timetable',
    'announcements',
  ],
};
export const defaultPrivileges: PrivilegeDefinition[] = [
  ...actionPrivileges,
  ...modules.map((key) => ({
    key: 'view_' + key,
    label: key === 'courseOutlines' ? 'View course outlines' : 'View ' + key,
    description: 'Read records within the user’s existing department, class or personal scope.',
    builtIn: true,
  })),
  {
    key: 'submit_assignments',
    label: 'Submit assignments',
    description: 'Students can submit their own coursework before the deadline.',
    builtIn: true,
  },
  {
    key: 'learning_progress',
    label: 'Update learning progress',
    description: 'Students can mark their own learning materials complete.',
    builtIn: true,
  },
];
export const defaultRolePermissions: Record<string, string[]> = Object.fromEntries(
  Object.entries(actionRolePermissions).map(([role, keys]) => [
    role,
    [
      ...keys,
      ...views[role].map((k) => 'view_' + k),
      ...(role === 'STUDENT' ? ['submit_assignments', 'learning_progress'] : []),
    ],
  ]),
);
export function normalizeRolePrivileges(config: RolePrivilegesConfig): RolePrivilegesConfig {
  // Old role configurations contained dormant actions blocked by fixed role checks.
  // Do not activate those actions silently when upgrading to capability-based checks.
  const legacy = !config.privileges.some((p) => p.key === 'task_assign');
  if (legacy) {
    config = {
      ...config,
      rolePermissions: {
        ...config.rolePermissions,
        TEACHER: (config.rolePermissions.TEACHER || []).filter((k) => k !== 'timetable'),
        PRINCIPAL: (config.rolePermissions.PRINCIPAL || []).filter(
          (k) => !['attendance', 'results', 'timetable'].includes(k),
        ),
      },
    };
  }
  config = {
    ...config,
    privileges: config.privileges.filter((p) => !['tasks', 'view_tasks'].includes(p.key)),
  };
  const known = new Set(config.privileges.map((p) => p.key));
  const missing = defaultPrivileges.filter((p) => !known.has(p.key));
  return {
    privileges: [
      ...defaultPrivileges,
      ...config.privileges.filter((p) => !defaultPrivileges.some((d) => d.key === p.key)),
    ],
    rolePermissions: Object.fromEntries(
      Object.keys(defaultRolePermissions).map((role) => [
        role,
        [
          ...(config.rolePermissions[role] || defaultRolePermissions[role] || []).filter(
            (k) => !['tasks', 'view_tasks'].includes(k),
          ),
          ...missing.filter((p) => defaultRolePermissions[role].includes(p.key)).map((p) => p.key),
        ],
      ]),
    ),
  };
}
// These are existing role boundaries, not permissions that grant cross-department access.
export function supportsPrivilege(role: string, key: string): boolean {
  return (
    [
      'ADMIN',
      'PRINCIPAL',
      'HOD',
      'TEACHER',
      'STUDENT',
      'TREASURER',
      'EXAMINATION_CONTROLLER',
      'REGISTRAR',
    ].includes(role) && !['tasks', 'view_tasks'].includes(key)
  );
}
export function pageAllowed(u: Row, page: string, config?: RolePrivilegesConfig): boolean {
  if (page === 'myDepartment') return u.role === 'HOD';
  if (page === 'myCollege') return u.role === 'PRINCIPAL';
  if (page === 'myClass') return u.role === 'STUDENT';
  if (['dashboard', 'profile', 'password', 'personal'].includes(page)) return true;
  if (page === 'management')
    return ['finance', 'exams', 'events', 'transport'].some((k) => permitted(u, k, config));
  if (page === 'settings')
    return permitted(u, 'system_settings', config) || permitted(u, 'manage_backups', config);
  if (page === 'rolePrivileges') return permitted(u, 'manage_access', config);
  if (page === 'responsibilities') return permitted(u, 'delegate_responsibilities', config);
  if (page === 'tasks') return false;
  if (page === 'reports') return permitted(u, 'reports', config);
  const module =
    ({ deptSubjects: 'subjects', teachers: 'users' } as Record<string, string>)[page] || page;
  return permitted(u, 'view_' + module, config);
}
export function getDefaultRolePrivileges(): RolePrivilegesConfig {
  return {
    privileges: defaultPrivileges.slice(),
    rolePermissions: JSON.parse(JSON.stringify(defaultRolePermissions)),
  };
}

export const privilegeLabels: Record<string, string> = Object.fromEntries(
  defaultPrivileges.map((p) => [p.key, p.label]),
);

export function privileges(u: Row): Record<string, boolean> {
  try {
    const value = JSON.parse(u.permissions || '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (Object.fromEntries(
          Object.entries(value).filter(([, v]) => typeof v === 'boolean'),
        ) as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

export function isValidPrivilege(key: string, roleConfig?: RolePrivilegesConfig): boolean {
  if (key in privilegeLabels) return true;
  return !!roleConfig?.privileges?.some((p) => p.key === key);
}

export function permitted(u: Row, key: string, roleConfig?: RolePrivilegesConfig): boolean {
  if (u.role === 'ADMIN') return true;
  roleConfig = roleConfig || u.accessConfig;
  if (!supportsPrivilege(u.role, key)) return false;
  const parent =
    key === 'submit_assignments'
      ? 'assignments'
      : key === 'learning_progress' || key === 'materials_delete'
        ? 'materials'
        : key === 'attendance_record' || key === 'attendance_correct'
          ? 'attendance'
          : key;
  if (
    !key.startsWith('view_') &&
    modules.includes(parent) &&
    !permitted(u, 'view_' + parent, roleConfig)
  )
    return false;
  const userOverrides = privileges(u);
  if (userOverrides[key] === false) return false;
  if (userOverrides[key] === true) return true;
  if (responsibilityPermissions(u).includes(key)) return true;
  const permissions = roleConfig?.rolePermissions || defaultRolePermissions;
  const roleList = permissions[u.role];
  if (Array.isArray(roleList)) return roleList.includes(key);
  return defaultRolePermissions[u.role]?.includes(key) ?? false;
}

export const entityPrivilege = (t: string) =>
  [
    'departments',
    'programs',
    'sessions',
    'batches',
    'subjects',
    'offerings',
    'enrollments',
    'hodScopes',
  ].includes(t)
    ? 'academic'
    : ['resultFiles', 'assessmentPolicies'].includes(t)
      ? 'results'
      : t === 'timetableFiles'
        ? 'timetable'
        : t;

export const responsibilityTemplates: Record<string, { label: string; permissions: string[] }> = {
  timetable_incharge: {
    label: 'Timetable Incharge',
    permissions: ['view_timetable', 'timetable', 'timetable_department', 'view_subjects'],
  },
  program_coordinator: {
    label: 'Program Coordinator',
    permissions: [
      'view_academic',
      'academic',
      'academic_department',
      'student_enrollment',
      'view_users',
      'view_subjects',
    ],
  },
  examination_controller: {
    label: 'Dept. Examination Controller',
    permissions: ['view_results', 'results', 'results_department', 'reports', 'view_subjects'],
  },
};
export function responsibilityKeys(u: Row): string[] {
  try {
    const v = JSON.parse(u.responsibilities || '[]');
    return Array.isArray(v)
      ? v.filter((k) => typeof k === 'string' && k in responsibilityTemplates)
      : [];
  } catch {
    return [];
  }
}
export function responsibilityPermissions(u: Row): string[] {
  return u.role === 'TEACHER'
    ? responsibilityKeys(u).flatMap((k) => responsibilityTemplates[k].permissions)
    : [];
}
export const departmentAccess = (u: Row) =>
  u.role === 'HOD' ||
  [
    'timetable_department',
    'academic_department',
    'results_department',
    'task_assign',
    'delegate_responsibilities',
    'users',
  ].some((k) => permitted(u, k));
