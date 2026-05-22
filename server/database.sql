-- Maritime CBT Database Schema
-- Complete database structure for the marine examination system

-- Departments table
CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  department_name VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ranks table for different maritime positions
CREATE TABLE IF NOT EXISTS ranks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rank_name VARCHAR(50) UNIQUE NOT NULL,
  department_id INT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

-- Users table for seafarer accounts
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    rank_id INT NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    role ENUM('user', 'admin') DEFAULT 'user',
    FOREIGN KEY (rank_id) REFERENCES ranks(id) ON DELETE RESTRICT
);

-- Question sets organized by rank
CREATE TABLE IF NOT EXISTS question_sets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rank_id INT NOT NULL,
    set_name VARCHAR(100) NOT NULL,
    description TEXT,
    total_questions INT DEFAULT 30,
    duration_minutes INT DEFAULT 30,
    passing_percentage INT DEFAULT 75,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rank_id) REFERENCES ranks(id) ON DELETE CASCADE
);

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_set_id INT NOT NULL,
    question_text TEXT NOT NULL,
    question_type ENUM('single_choice', 'multiple_choice') DEFAULT 'single_choice',
    question_order INT NOT NULL,
    marks DECIMAL(3,1) DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_set_id) REFERENCES question_sets(id) ON DELETE CASCADE
);

-- Answer options for questions
CREATE TABLE IF NOT EXISTS answer_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    option_text TEXT NOT NULL,
    option_order INT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Exam sessions (scheduled exams)
CREATE TABLE IF NOT EXISTS exam_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    question_set_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    scheduled_date DATETIME NOT NULL,
    duration_minutes INT DEFAULT 30,
    status ENUM('scheduled', 'in_progress', 'completed', 'expired') DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_set_id) REFERENCES question_sets(id) ON DELETE CASCADE
);

-- Exam attempts (actual exam attempts)
CREATE TABLE IF NOT EXISTS exam_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_session_id INT NOT NULL,
    user_id INT NOT NULL,
    started_at TIMESTAMP NULL,
    submitted_at TIMESTAMP NULL,
    status ENUM('not_started', 'in_progress', 'submitted', 'expired') DEFAULT 'not_started',
    time_taken_minutes INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User answers
CREATE TABLE IF NOT EXISTS user_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_attempt_id INT NOT NULL,
    question_id INT NOT NULL,
    selected_option_ids TEXT, -- JSON array of selected option IDs for multiple choice
    is_correct BOOLEAN NULL, -- Computed after submission
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- Exam results
CREATE TABLE IF NOT EXISTS exam_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exam_attempt_id INT NOT NULL UNIQUE,
    total_questions INT NOT NULL,
    correct_answers INT NOT NULL,
    wrong_answers INT NOT NULL,
    percentage_score DECIMAL(5,2) NOT NULL,
    passed BOOLEAN NOT NULL,
    marks_obtained DECIMAL(5,2) NOT NULL,
    total_marks DECIMAL(5,2) NOT NULL,
    time_taken_minutes INT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_to_profile BOOLEAN DEFAULT FALSE,
    email_sent BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (exam_attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE
);

-- Insert departments
INSERT INTO departments (department_name) VALUES 
('Deck'),
('Engine'),
('Specialist'),
('Catering'),
('Other');

-- Insert ranks with departments
INSERT INTO ranks (rank_name, department_id, description) VALUES 
-- Deck Department
('MASTER', 1, 'Master of the vessel'),
('ADDITIONAL MASTER', 1, 'Additional Master'),
('CHIEF OFFICER', 1, 'Chief Deck Officer'),
('2ND OFFICER', 1, 'Second Officer'),
('3RD OFFICER', 1, 'Third Officer'),
('JUNIOR DECK OFFICER', 1, 'Junior Deck Officer'),
('RADIO OFFICER', 1, 'Radio Communications Officer'),
('SECURITY OFFICER', 1, 'Security Officer'),
('TRAINEE OFFICER', 1, 'Trainee Officer'),
('DECK WATCHKEEPER', 1, 'Deck Watchkeeper'),
('CADET DECK', 1, 'Deck Cadet'),
('PUMPMAN', 1, 'Pumpman'),
('BOSUN', 1, 'Boatswain'),
('DECK WELDER', 1, 'Deck Welder'),
('ABLE SEAMAN', 1, 'Able Seaman'),
('ORDINARY SEAMAN', 1, 'Ordinary Seaman'),
('DECK BOY', 1, 'Deck Boy'),
('TUG MATE', 1, 'Tug Mate'),
('TUG MASTER', 1, 'Tug Master'),
('CRANE OPERATOR', 1, 'Crane Operator'),

-- Engine Department
('CHIEF ENGINEER', 2, 'Chief Engineering Officer'),
('CHIEF ELECTRICAL ENGINEER', 2, 'Chief Electrical Engineer'),
('2ND ENGINEER', 2, 'Second Engineer'),
('2ND ASST ENGINEER', 2, 'Second Assistant Engineer'),
('3RD ENGINEER', 2, 'Third Engineer'),
('3RD ASST ENGINEER', 2, 'Third Assistant Engineer'),
('4TH ENGINEER', 2, 'Fourth Engineer'),
('5TH ENGINEER', 2, 'Fifth Engineer'),
('CARGO GAS ENGINEER', 2, 'Cargo Gas Engineer'),
('ELECTRICAL ENGINEER', 2, 'Electrical Engineer'),
('ETO', 2, 'Electro-Technical Officer'),
('ELECTRONICS ENGINEER', 2, 'Electronics Engineer'),
('ELECTRICIAN', 2, 'Electrician'),
('ELECTRICIAN TRAINEE', 2, 'Electrician Trainee'),
('ASST ELECTRICIAN', 2, 'Assistant Electrician'),
('JUNIOR ENGINEER', 2, 'Junior Engineer'),
('TRAINEE ENGINEER', 2, 'Trainee Engineer'),
('CADET ENGINE', 2, 'Engine Cadet'),
('FITTER', 2, 'Marine Fitter'),
('MOTORMAN', 2, 'Motorman'),
('1ST OILER', 2, 'First Oiler'),
('OILER', 2, 'Oiler'),
('WIPER', 2, 'Wiper'),
('ENGINE BOY', 2, 'Engine Boy'),

-- Specialist Department
('MEDIC', 3, 'Ship Medic'),
('CARPENTER', 3, 'Ship Carpenter'),
('REPAIRMAN', 3, 'Repairman'),
('SECURITY GUARD', 3, 'Security Guard'),
('SHIP CLERK', 3, 'Ship Clerk'),
('STAFF CAPTAIN', 3, 'Staff Captain'),
('SUPERCARGO', 3, 'Superintendent Cargo'),
('FIREMAN', 3, 'Fireman'),
('REPAIR SUPERVISOR', 3, 'Repair Supervisor'),
('LEADING HAND', 3, 'Leading Hand'),
('DECK SUPER', 3, 'Deck Supervisor'),
('ENG SUPER', 3, 'Engine Supervisor'),
('SUPERNUMERARY', 3, 'Supernumerary'),
('PILOT', 3, 'Marine Pilot'),
('RELIEF MASTER', 3, 'Relief Master'),
('RIDING TEAM DECK', 3, 'Riding Team Deck'),
('RIDING TEAM ENG', 3, 'Riding Team Engine'),

-- Catering Department
('CHIEF COOK', 4, 'Chief Cook'),
('2ND COOK', 4, 'Second Cook'),
('3RD CHEF', 4, 'Third Chef'),
('4TH CHEF', 4, 'Fourth Chef'),
('ASSISTANT COOK', 4, 'Assistant Cook'),
('COOK/STEWARD', 4, 'Cook/Steward'),
('CATERING ASSISTANT', 4, 'Catering Assistant'),
('PURSER', 4, 'Purser'),
('CHIEF STEWARD', 4, 'Chief Steward'),
('STEWARD/(ESS)', 4, 'Steward/ESS'),
('CABIN STEWARDESS', 4, 'Cabin Stewardess'),
('MESSMAN', 4, 'Messman'),
('CHIEF HOUSEKEEPER', 4, 'Chief Housekeeper'),
('HOUSEKEEPER', 4, 'Housekeeper'),
('LAUNDRYMAN', 4, 'Laundryman'),

-- Other Department
('OTHER', 5, 'Other Positions');

-- Insert default admin user (password: admin123)
INSERT INTO users (username, email, password_hash, full_name, position_rank, role) VALUES 
('admin', 'admin@maritimecbt.com', '$2a$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ', 'System Administrator', 'Administrator', 'admin');

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_exam_sessions_user ON exam_sessions(user_id);
CREATE INDEX idx_exam_sessions_status ON exam_sessions(status);
CREATE INDEX idx_exam_attempts_session ON exam_attempts(exam_session_id);
CREATE INDEX idx_exam_attempts_user ON exam_attempts(user_id);
CREATE INDEX idx_user_answers_attempt ON user_answers(exam_attempt_id);
CREATE INDEX idx_questions_set ON questions(question_set_id);
CREATE INDEX idx_answer_options_question ON answer_options(question_id);
