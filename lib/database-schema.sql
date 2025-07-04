-- Users table
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    role ENUM('teacher', 'student', 'institution') NOT NULL,
    institution_id VARCHAR(255),
    institution_name VARCHAR(255),
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Institutions table
CREATE TABLE institutions (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    settings JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Classes table
CREATE TABLE classes (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL,
    description TEXT,
    teacher_id VARCHAR(255) NOT NULL,
    institution_id VARCHAR(255),
    settings JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- Class enrollments table
CREATE TABLE class_enrollments (
    id VARCHAR(255) PRIMARY KEY,
    class_id VARCHAR(255) NOT NULL,
    student_id VARCHAR(255) NOT NULL,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('active', 'inactive', 'pending') DEFAULT 'active',
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    UNIQUE KEY unique_enrollment (class_id, student_id)
);

-- Assignments table
CREATE TABLE assignments (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    class_id VARCHAR(255) NOT NULL,
    teacher_id VARCHAR(255) NOT NULL,
    due_date TIMESTAMP NOT NULL,
    max_points INT DEFAULT 100,
    allow_late_submission BOOLEAN DEFAULT FALSE,
    instructions TEXT,
    attachments JSON,
    status ENUM('draft', 'published', 'closed') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id)
);

-- Submissions table
CREATE TABLE submissions (
    id VARCHAR(255) PRIMARY KEY,
    assignment_id VARCHAR(255) NOT NULL,
    student_id VARCHAR(255) NOT NULL,
    content TEXT,
    attachments JSON,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('submitted', 'graded', 'returned') DEFAULT 'submitted',
    grade DECIMAL(5,2),
    feedback TEXT,
    graded_at TIMESTAMP NULL,
    graded_by VARCHAR(255),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id),
    FOREIGN KEY (student_id) REFERENCES users(id),
    FOREIGN KEY (graded_by) REFERENCES users(id),
    UNIQUE KEY unique_submission (assignment_id, student_id)
);

-- Notifications table
CREATE TABLE notifications (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('assignment', 'grade', 'class', 'system') NOT NULL,
    read_status BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Sessions table (for session management)
CREATE TABLE sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Departments table
CREATE TABLE departments (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    institution_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (institution_id) REFERENCES institutions(id)
);

-- Department members table (linking users to departments)
CREATE TABLE department_members (
    id VARCHAR(255) PRIMARY KEY,
    department_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    role ENUM('teacher', 'student') NOT NULL, -- Role within the department context
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY unique_department_member (department_id, user_id)
);

-- Add department_id to users table
ALTER TABLE users
ADD COLUMN department_id VARCHAR(255),
ADD CONSTRAINT fk_users_department
FOREIGN KEY (department_id) REFERENCES departments(id);

-- Indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_classes_teacher ON classes(teacher_id);
CREATE INDEX idx_classes_institution ON classes(institution_id);
CREATE INDEX idx_enrollments_class ON class_enrollments(class_id);
CREATE INDEX idx_enrollments_student ON class_enrollments(student_id);
CREATE INDEX idx_assignments_class ON assignments(class_id);
CREATE INDEX idx_assignments_teacher ON assignments(teacher_id);
CREATE INDEX idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX idx_submissions_student ON submissions(student_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_departments_institution ON departments(institution_id);
CREATE INDEX idx_department_members_department ON department_members(department_id);
CREATE INDEX idx_department_members_user ON department_members(user_id);
