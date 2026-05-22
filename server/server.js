const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Database connection
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'maritime_cbt',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Security middleware
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' }
});

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(limiter);

// Input validation middleware
const validateInput = (req, res, next) => {
  // Sanitize input to prevent XSS
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    
    const sanitized = {};
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        sanitized[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .trim();
      } else if (typeof obj[key] === 'object') {
        sanitized[key] = sanitize(obj[key]);
      } else {
        sanitized[key] = obj[key];
      }
    }
    return sanitized;
  };
  
  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);
  
  next();
};

app.use(validateInput);

// Middleware
app.use(cors());
app.use(express.json());

// File uploads (question sets / answer sheets)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^\w.\-]/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

const extractTextFromFile = async (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: file.path });
    return result.value || '';
  }
  if (ext === '.pdf') {
    const data = await pdfParse(fs.readFileSync(file.path));
    return data.text || '';
  }
  throw new Error('Unsupported file type');
};

const parseAnswersFromText = (text) => {
  const answerMap = new Map();
  const regex = /(\d+)\s*[-:]\s*([A-D])/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    answerMap.set(parseInt(match[1], 10), match[2].toUpperCase());
  }
  return answerMap;
};

const parseQuestionsFromText = (text) => {
  const normalized = text.replace(/\r/g, '').replace(/\n+/g, '\n');
  const parts = normalized.split(/\n?\s*(\d+)\.\s*/).filter(Boolean);
  const questions = [];

  for (let i = 0; i < parts.length; i += 2) {
    const number = parseInt(parts[i], 10);
    const body = (parts[i + 1] || '').trim();
    if (!body) continue;

    const optionParts = body.split(/([A-D])\.\s*/).filter(Boolean);
    const questionText = (optionParts.shift() || '').trim();
    if (!questionText) continue;

    const options = [];
    for (let j = 0; j < optionParts.length; j += 2) {
      const letter = optionParts[j];
      const optionText = (optionParts[j + 1] || '').trim();
      if (!optionText) continue;
      options.push({
        letter: letter.toUpperCase(),
        option_text: optionText
      });
    }

    if (options.length < 2) continue;

    questions.push({
      number,
      question_text: questionText,
      options
    });
  }

  return questions;
};

const addQuestionsToStore = (setId, questionDataList) => {
  const questionsPath = path.join(__dirname, 'data', 'questions.json');
  let allQuestions = [];
  if (fs.existsSync(questionsPath)) {
    allQuestions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  }

  const maxQuestionId = allQuestions.length > 0 ? Math.max(...allQuestions.map(q => q.id)) : 0;
  const maxOptionId = allQuestions.length > 0 ? Math.max(...allQuestions.flatMap(q => q.options?.map(o => o.id) || [])) : 0;

  let currentQuestionId = maxQuestionId;
  let currentOptionId = maxOptionId;

  for (const questionData of questionDataList) {
    currentQuestionId++;
    const questionId = currentQuestionId;

    const options = questionData.options.map((option, index) => ({
      id: ++currentOptionId,
      option_text: option.option_text,
      option_order: index + 1,
      is_correct: option.is_correct
    }));

    allQuestions.push({
      id: questionId,
      question_set_id: setId,
      question_text: questionData.question_text,
      question_type: 'single_choice',
      question_order: questionData.question_order,
      marks: questionData.marks || 1.0,
      options,
      created_at: new Date().toISOString()
    });
  }

  fs.writeFileSync(questionsPath, JSON.stringify(allQuestions, null, 2));
  return questionDataList.length;
};

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../dist')));

// Enhanced JWT middleware with token blacklisting
const tokenBlacklist = new Set();

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  if (tokenBlacklist.has(token)) {
    return res.status(403).json({ error: 'Token has been revoked' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    req.token = token;
    next();
  });
};

// Logout endpoint
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  tokenBlacklist.add(req.token);
  res.json({ message: 'Logged out successfully' });
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt:', { email, password: '***' });
    console.log('Comparing with admin credentials:', {
      emailMatch: email === 'admin@maritimecbt.com',
      passwordMatch: password === 'admin123'
    });
    
    // For demo purposes, use hardcoded admin credentials
    if (email === 'admin@maritimecbt.com' && password === 'admin123') {
      const user = {
        id: '1',
        email: 'admin@maritimecbt.com',
        full_name: 'Administrator',
        role: 'admin'
      };
      
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user });
    } else {
      // For demo, create a user account
      const user = {
        id: '2',
        email: email,
        full_name: 'Test User',
        role: 'user'
      };
      
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Exam sessions routes
app.get('/api/exam-sessions', authenticateToken, async (req, res) => {
  try {
    // Read scheduled exams from JSON file and filter by user (email).
    const examSessionsPath = path.join(__dirname, 'data', 'exam-sessions.json');

    if (!fs.existsSync(examSessionsPath)) {
      return res.json([]);
    }

    const allSessions = JSON.parse(fs.readFileSync(examSessionsPath, 'utf8'));

    let sessions = allSessions;
    if (req.user.role !== 'admin') {
      sessions = allSessions.filter((session) => session.email === req.user.email);
    }

    // Only show scheduled exams to users
    sessions = sessions.filter((session) => session.status === 'scheduled');

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching exam sessions:', error);
    res.status(500).json({ error: 'Failed to fetch exam sessions' });
  }
});

app.get('/api/exam-sessions/:id', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const examSessionsPath = path.join(__dirname, 'data', 'exam-sessions.json');

    if (!fs.existsSync(examSessionsPath)) {
      return res.status(404).json({ error: 'Exam session not found' });
    }

    const allSessions = JSON.parse(fs.readFileSync(examSessionsPath, 'utf8'));
    const session = allSessions.find((s) => s.id === sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Exam session not found' });
    }

    if (req.user.role !== 'admin' && session.email !== req.user.email) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(session);
  } catch (error) {
    console.error('Error fetching exam session:', error);
    res.status(500).json({ error: 'Failed to fetch exam session' });
  }
});

app.get('/api/exam-sessions/:id/questions', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const examSessionsPath = path.join(__dirname, 'data', 'exam-sessions.json');
    const questionsPath = path.join(__dirname, 'data', 'questions.json');

    if (!fs.existsSync(examSessionsPath)) {
      return res.json([]);
    }

    const sessions = JSON.parse(fs.readFileSync(examSessionsPath, 'utf8'));
    const session = sessions.find((s) => s.id === sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Exam session not found' });
    }

    if (req.user.role !== 'admin' && session.email !== req.user.email) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(questionsPath)) {
      return res.json([]);
    }

    const allQuestions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
    const questions = allQuestions
      .filter((q) => q.question_set_id === session.question_set_id)
      .map((q) => ({
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        question_order: q.question_order,
        marks: q.marks,
        options: (q.options || []).map((opt) => ({
          id: opt.id,
          option_text: opt.option_text,
          option_order: opt.option_order
        }))
      }));

    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

app.post('/api/exam-attempts', authenticateToken, async (req, res) => {
  try {
    const { examSessionId } = req.body;
    
    // Get exam session details
    const [sessions] = await pool.execute(
      'SELECT * FROM exam_sessions WHERE id = ? AND user_id = ?',
      [examSessionId, req.user.id]
    );
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Exam session not found' });
    }
    
    const session = sessions[0];
    
    // Check if already attempted
    const [existingAttempts] = await pool.execute(
      'SELECT id FROM exam_attempts WHERE exam_session_id = ? AND user_id = ?',
      [examSessionId, req.user.id]
    );
    
    if (existingAttempts.length > 0) {
      return res.status(400).json({ error: 'Exam already attempted' });
    }
    
    // Create attempt
    const [result] = await pool.execute(`
      INSERT INTO exam_attempts (exam_session_id, user_id, started_at, status)
      VALUES (?, ?, NOW(), 'in_progress')
    `, [examSessionId, req.user.id]);
    
    // Update session status
    await pool.execute(
      'UPDATE exam_sessions SET status = "in_progress" WHERE id = ?',
      [examSessionId]
    );
    
    res.json({
      id: result.insertId,
      exam_session_id: examSessionId,
      started_at: new Date().toISOString(),
      status: 'in_progress'
    });
  } catch (error) {
    console.error('Error creating exam attempt:', error);
    res.status(500).json({ error: 'Failed to create exam attempt' });
  }
});

app.post('/api/exam-attempts/:id/submit', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const attemptId = req.params.id;
    const { answers } = req.body;
    
    await connection.beginTransaction();
    
    // Get exam attempt details
    const [attempts] = await connection.execute(
      'SELECT * FROM exam_attempts WHERE id = ? AND user_id = ?',
      [attemptId, req.user.id]
    );
    
    if (attempts.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Exam attempt not found' });
    }
    
    const attempt = attempts[0];
    
    if (attempt.status !== 'in_progress') {
      await connection.rollback();
      return res.status(400).json({ error: 'Exam already submitted' });
    }
    
    // Get exam session and question set details
    const [sessionData] = await connection.execute(`
      SELECT es.*, qs.total_questions, qs.passing_percentage
      FROM exam_sessions es
      JOIN question_sets qs ON es.question_set_id = qs.id
      WHERE es.id = ?
    `, [attempt.exam_session_id]);
    
    if (sessionData.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Exam session not found' });
    }
    
    const session = sessionData[0];
    let correctAnswers = 0;
    
    // Save user answers and calculate score
    for (const answer of answers) {
      const [questionData] = await connection.execute(
        'SELECT * FROM questions WHERE id = ?',
        [answer.questionId]
      );
      
      if (questionData.length === 0) continue;
      
      const question = questionData[0];
      let isCorrect = false;
      
      if (question.question_type === 'single_choice') {
        const [correctOption] = await connection.execute(
          'SELECT id FROM answer_options WHERE question_id = ? AND is_correct = TRUE',
          [answer.questionId]
        );
        
        isCorrect = correctOption.length > 0 && 
                   correctOption[0].id.toString() === answer.selectedOptionIds[0];
      } else {
        // Multiple choice
        const [correctOptions] = await connection.execute(
          'SELECT id FROM answer_options WHERE question_id = ? AND is_correct = TRUE',
          [answer.questionId]
        );
        
        const correctIds = correctOptions.map(opt => opt.id.toString()).sort();
        const selectedIds = answer.selectedOptionIds.sort();
        isCorrect = JSON.stringify(correctIds) === JSON.stringify(selectedIds);
      }
      
      if (isCorrect) correctAnswers++;
      
      // Save user answer
      await connection.execute(`
        INSERT INTO user_answers (exam_attempt_id, question_id, selected_option_ids, is_correct)
        VALUES (?, ?, ?, ?)
      `, [attemptId, answer.questionId, JSON.stringify(answer.selectedOptionIds), isCorrect]);
    }
    
    // Calculate final results
    const totalQuestions = session.total_questions;
    const wrongAnswers = totalQuestions - correctAnswers;
    const percentageScore = Math.round((correctAnswers / totalQuestions) * 100);
    const passed = percentageScore >= session.passing_percentage;
    const marksObtained = correctAnswers * 1; // Assuming 1 mark per question
    const totalMarks = totalQuestions * 1;
    
    const timeTaken = Math.round((new Date() - new Date(attempt.started_at)) / (1000 * 60));
    
    // Update attempt status
    await connection.execute(`
      UPDATE exam_attempts 
      SET submitted_at = NOW(), status = 'submitted', time_taken_minutes = ?
      WHERE id = ?
    `, [timeTaken, attemptId]);
    
    // Save exam results
    await connection.execute(`
      INSERT INTO exam_results (
        exam_attempt_id, total_questions, correct_answers, wrong_answers,
        percentage_score, passed, marks_obtained, total_marks, time_taken_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      attemptId, totalQuestions, correctAnswers, wrongAnswers,
      percentageScore, passed, marksObtained, totalMarks, timeTaken
    ]);
    
    // Update session status
    await connection.execute(
      'UPDATE exam_sessions SET status = "completed" WHERE id = ?',
      [attempt.exam_session_id]
    );
    
    await connection.commit();
    
    res.json({
      score: percentageScore,
      correctAnswers,
      wrongAnswers,
      totalQuestions,
      passed,
      timeTakenMinutes: timeTaken,
      marksObtained,
      totalMarks
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('Error submitting exam:', error);
    res.status(500).json({ error: 'Failed to submit exam' });
  } finally {
    connection.release();
  }
});

// Admin routes

// User Management
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Load users from JSON file
    const fs = require('fs');
    const path = require('path');
    const usersPath = path.join(__dirname, 'data', 'users.json');
    
    if (fs.existsSync(usersPath)) {
      const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      res.json(users);
    } else {
      // Fallback to basic mock data if file doesn't exist
      const users = [
        {
          id: 1,
          username: 'admin',
          email: 'admin@maritimecbt.com',
          full_name: 'System Administrator',
          rank_id: 1,
          rank_name: 'MASTER',
          department_name: 'Deck',
          phone: '+1234567890',
          created_at: new Date().toISOString(),
          is_active: true,
          role: 'admin'
        }
      ];
      res.json(users);
    }
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { username, email, password, full_name, rank_id, phone } = req.body;
    
    // Validate required fields
    if (!username || !email || !password || !full_name || !rank_id) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }
    
    // Load existing users from JSON file
    const fs = require('fs');
    const path = require('path');
    const usersPath = path.join(__dirname, 'data', 'users.json');
    
    let users = [];
    if (fs.existsSync(usersPath)) {
      users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    }
    
    // Check if user already exists
    const existingUser = users.find(user => user.username === username || user.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    // Get rank information
    const ranksPath = path.join(__dirname, 'data', 'ranks.json');
    let ranks = [];
    if (fs.existsSync(ranksPath)) {
      ranks = JSON.parse(fs.readFileSync(ranksPath, 'utf8'));
    }
    const userRank = ranks.find(rank => rank.id === rank_id);
    
    // Create new user
    const newUser = {
      id: Math.max(...users.map(u => u.id), 0) + 1,
      username,
      email,
      full_name,
      rank_id,
      rank_name: userRank ? userRank.rank_name : 'Unknown',
      department_name: userRank ? userRank.department_name : 'Unknown',
      phone: phone || '',
      password_hash: password ? bcrypt.hashSync(password, 10) : undefined,
      created_at: new Date().toISOString(),
      is_active: true,
      role: 'user'
    };
    
    // Add to users array and save
    users.push(newUser);
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    
    res.json({ 
      ...newUser,
      message: 'User created successfully' 
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/admin/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const userId = parseInt(req.params.id);
    const { username, email, full_name, rank_id, phone, is_active, password } = req.body;
    
    // Load users from JSON file
    const fs = require('fs');
    const path = require('path');
    const usersPath = path.join(__dirname, 'data', 'users.json');
    
    if (!fs.existsSync(usersPath)) {
      return res.status(404).json({ error: 'Users data not found' });
    }
    
    let users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    const userIndex = users.findIndex(user => user.id === userId);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get rank information if rank_id changed
    let rank_name = users[userIndex].rank_name;
    let department_name = users[userIndex].department_name;
    
    if (rank_id !== users[userIndex].rank_id) {
      const ranksPath = path.join(__dirname, 'data', 'ranks.json');
      if (fs.existsSync(ranksPath)) {
        const ranks = JSON.parse(fs.readFileSync(ranksPath, 'utf8'));
        const userRank = ranks.find(rank => rank.id === rank_id);
        if (userRank) {
          rank_name = userRank.rank_name;
          department_name = userRank.department_name;
        }
      }
    }
    
    // Update user
    users[userIndex] = {
      ...users[userIndex],
      username: username || users[userIndex].username,
      email: email || users[userIndex].email,
      full_name: full_name || users[userIndex].full_name,
      rank_id: rank_id || users[userIndex].rank_id,
      rank_name,
      department_name,
      phone: phone !== undefined ? phone : users[userIndex].phone,
      is_active: is_active !== undefined ? is_active : users[userIndex].is_active,
      ...(password ? { password_hash: bcrypt.hashSync(password, 10) } : {})
    };
    
    // Save updated users
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const userId = parseInt(req.params.id);
    
    // Delete from database first (exam_sessions and related data will cascade delete)
    try {
      await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    } catch (dbError) {
      console.log('Database delete error (expected if no database):', dbError.message);
    }
    
    // Delete from JSON file
    const fs = require('fs');
    const path = require('path');
    const usersPath = path.join(__dirname, 'data', 'users.json');
    
    if (fs.existsSync(usersPath)) {
      let users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      users = users.filter(user => user.id !== userId);
      fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    }
    
    // Delete user's exam sessions from JSON (if applicable)
    const examSessionsPath = path.join(__dirname, 'data', 'exam-sessions.json');
    if (fs.existsSync(examSessionsPath)) {
      let sessions = JSON.parse(fs.readFileSync(examSessionsPath, 'utf8'));
      sessions = sessions.filter(session => session.user_id !== userId);
      fs.writeFileSync(examSessionsPath, JSON.stringify(sessions, null, 2));
    }
    
    res.json({ message: 'User and all associated exam sessions deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Ranks Management
app.get('/api/admin/departments', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const departmentsPath = path.join(__dirname, 'data', 'departments.json');
    
    if (!fs.existsSync(departmentsPath)) {
      return res.json([]);
    }
    
    const departments = JSON.parse(fs.readFileSync(departmentsPath, 'utf8'));
    res.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

app.get('/api/admin/ranks', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Load ranks from JSON file
    const fs = require('fs');
    const path = require('path');
    const ranksPath = path.join(__dirname, 'data', 'ranks.json');
    
    if (fs.existsSync(ranksPath)) {
      const ranks = JSON.parse(fs.readFileSync(ranksPath, 'utf8'));
      res.json(ranks);
    } else {
      // Fallback to mock data if file doesn't exist
      const ranks = [
        // Deck Department
        { id: 1, rank_name: 'MASTER', department_id: 1, department_name: 'Deck', description: 'Master of the vessel', created_at: new Date().toISOString() },
        { id: 2, rank_name: 'ADDITIONAL MASTER', department_id: 1, department_name: 'Deck', description: 'Additional Master', created_at: new Date().toISOString() },
        { id: 3, rank_name: 'CHIEF OFFICER', department_id: 1, department_name: 'Deck', description: 'Chief Deck Officer', created_at: new Date().toISOString() },
        { id: 4, rank_name: '2ND OFFICER', department_id: 1, department_name: 'Deck', description: 'Second Officer', created_at: new Date().toISOString() },
        { id: 5, rank_name: '3RD OFFICER', department_id: 1, department_name: 'Deck', description: 'Third Officer', created_at: new Date().toISOString() },
        
        // Engine Department
        { id: 6, rank_name: 'CHIEF ENGINEER', department_id: 2, department_name: 'Engine', description: 'Chief Engineering Officer', created_at: new Date().toISOString() },
        { id: 7, rank_name: 'CHIEF ELECTRICAL ENGINEER', department_id: 2, department_name: 'Engine', description: 'Chief Electrical Engineer', created_at: new Date().toISOString() },
        { id: 8, rank_name: '2ND ENGINEER', department_id: 2, department_name: 'Engine', description: 'Second Engineer', created_at: new Date().toISOString() },
        { id: 9, rank_name: '3RD ENGINEER', department_id: 2, department_name: 'Engine', description: 'Third Engineer', created_at: new Date().toISOString() },
        { id: 10, rank_name: 'ETO', department_id: 2, department_name: 'Engine', description: 'Electro-Technical Officer', created_at: new Date().toISOString() },
        
        // Specialist Department
        { id: 11, rank_name: 'MEDIC', department_id: 3, department_name: 'Specialist', description: 'Ship Medic', created_at: new Date().toISOString() },
        { id: 12, rank_name: 'PILOT', department_id: 3, department_name: 'Specialist', description: 'Marine Pilot', created_at: new Date().toISOString() },
        { id: 13, rank_name: 'SECURITY GUARD', department_id: 3, department_name: 'Specialist', description: 'Security Guard', created_at: new Date().toISOString() },
        
        // Catering Department
        { id: 14, rank_name: 'CHIEF COOK', department_id: 4, department_name: 'Catering', description: 'Chief Cook', created_at: new Date().toISOString() },
        { id: 15, rank_name: 'PURSER', department_id: 4, department_name: 'Catering', description: 'Purser', created_at: new Date().toISOString() },
        { id: 16, rank_name: 'CHIEF STEWARD', department_id: 4, department_name: 'Catering', description: 'Chief Steward', created_at: new Date().toISOString() },
        
        // Other Department
        { id: 17, rank_name: 'OTHER', department_id: 5, department_name: 'Other', description: 'Other Positions', created_at: new Date().toISOString() }
      ];
      
      res.json(ranks);
    }
  } catch (error) {
    console.error('Error fetching ranks:', error);
    res.status(500).json({ error: 'Failed to fetch ranks' });
  }
});

app.get('/api/admin/ranks/:departmentId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const departmentId = parseInt(req.params.departmentId);
    
    // Load ranks from JSON file and filter by department
    const fs = require('fs');
    const path = require('path');
    const ranksPath = path.join(__dirname, 'data', 'ranks.json');
    
    if (fs.existsSync(ranksPath)) {
      const allRanks = JSON.parse(fs.readFileSync(ranksPath, 'utf8'));
      const filteredRanks = allRanks.filter(rank => rank.department_id === departmentId);
      res.json(filteredRanks);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching ranks by department:', error);
    res.status(500).json({ error: 'Failed to fetch ranks' });
  }
});

// Question Sets Management
app.get('/api/admin/question-sets', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const questionSetsPath = path.join(__dirname, 'data', 'question-sets.json');
    const ranksPath = path.join(__dirname, 'data', 'ranks.json');
    const departmentsPath = path.join(__dirname, 'data', 'departments.json');
    
    if (!fs.existsSync(questionSetsPath)) {
      return res.json([]);
    }
    
    const questionSets = JSON.parse(fs.readFileSync(questionSetsPath, 'utf8'));
    const ranks = JSON.parse(fs.readFileSync(ranksPath, 'utf8'));
    const departments = JSON.parse(fs.readFileSync(departmentsPath, 'utf8'));
    
    // Join with ranks and departments
    const enrichedQuestionSets = questionSets.map(set => {
      const rank = ranks.find(r => r.id === set.rank_id);
      const department = rank ? departments.find(d => d.id === rank.department_id) : null;
      
      return {
        ...set,
        rank_name: rank ? rank.name : 'Unknown',
        department_name: department ? department.department_name : 'Unknown'
      };
    });
    
    res.json(enrichedQuestionSets);
  } catch (error) {
    console.error('Error fetching question sets:', error);
    res.status(500).json({ error: 'Failed to fetch question sets' });
  }
});

app.post('/api/admin/question-sets', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { rank_id, set_name, description, total_questions, duration_minutes, passing_percentage } = req.body;
    
    const questionSetsPath = path.join(__dirname, 'data', 'question-sets.json');
    const ranksPath = path.join(__dirname, 'data', 'ranks.json');
    const departmentsPath = path.join(__dirname, 'data', 'departments.json');
    
    let questionSets = [];
    if (fs.existsSync(questionSetsPath)) {
      questionSets = JSON.parse(fs.readFileSync(questionSetsPath, 'utf8'));
    }
    
    // Generate new ID
    const newId = questionSets.length > 0 ? Math.max(...questionSets.map(q => q.id)) + 1 : 1;
    
    // Get rank and department info
    const ranks = JSON.parse(fs.readFileSync(ranksPath, 'utf8'));
    const departments = JSON.parse(fs.readFileSync(departmentsPath, 'utf8'));
    const rank = ranks.find(r => r.id === parseInt(rank_id));
    const department = rank ? departments.find(d => d.id === rank.department_id) : null;
    
    const newQuestionSet = {
      id: newId,
      rank_id: parseInt(rank_id),
      set_name,
      description,
      total_questions: parseInt(total_questions),
      duration_minutes: parseInt(duration_minutes),
      passing_percentage: parseInt(passing_percentage),
      is_active: true,
      created_at: new Date().toISOString(),
      rank_name: rank ? rank.rank_name : 'Unknown',
      department_name: department ? department.department_name : 'Unknown'
    };
    
    questionSets.push(newQuestionSet);
    
    fs.writeFileSync(questionSetsPath, JSON.stringify(questionSets, null, 2));
    
    res.json({ id: newId, message: 'Question set created successfully' });
  } catch (error) {
    console.error('Error creating question set:', error);
    res.status(500).json({ error: 'Failed to create question set' });
  }
});

// Questions Management
app.get('/api/admin/question-sets/:setId/questions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const setId = parseInt(req.params.setId);
    const questionsPath = path.join(__dirname, 'data', 'questions.json');
    
    if (!fs.existsSync(questionsPath)) {
      return res.json([]);
    }
    
    const allQuestions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
    const questions = allQuestions.filter(q => q.question_set_id === setId);
    
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

app.post('/api/admin/question-sets/:setId/questions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const setId = parseInt(req.params.setId);
    const { questions } = req.body;
    
    const questionsPath = path.join(__dirname, 'data', 'questions.json');
    
    let allQuestions = [];
    if (fs.existsSync(questionsPath)) {
      allQuestions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
    }
    
    // Generate new IDs
    const maxQuestionId = allQuestions.length > 0 ? Math.max(...allQuestions.map(q => q.id)) : 0;
    const maxOptionId = allQuestions.length > 0 ? Math.max(...allQuestions.flatMap(q => q.options?.map(o => o.id) || [])) : 0;
    
    let currentQuestionId = maxQuestionId;
    let currentOptionId = maxOptionId;
    
    for (const questionData of questions) {
      currentQuestionId++;
      const questionId = currentQuestionId;
      
      const options = questionData.options.map(option => ({
        id: ++currentOptionId,
        option_text: option.option_text,
        option_order: option.option_order,
        is_correct: option.is_correct
      }));
      
      const newQuestion = {
        id: questionId,
        question_set_id: setId,
        question_text: questionData.question_text,
        question_type: questionData.question_type || 'single_choice',
        question_order: questionData.question_order,
        marks: questionData.marks || 1.0,
        options: options,
        created_at: new Date().toISOString()
      };
      
      allQuestions.push(newQuestion);
    }
    
    fs.writeFileSync(questionsPath, JSON.stringify(allQuestions, null, 2));
    
    res.json({ message: 'Questions uploaded successfully' });
  } catch (error) {
    console.error('Error uploading questions:', error);
    res.status(500).json({ error: 'Failed to upload questions' });
  }
});

// Question Set File Uploads
app.post('/api/admin/question-sets/:setId/upload-file', authenticateToken, upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'answerSheet', maxCount: 1 }
]), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const questionFile = req.files?.file?.[0];
    const answerSheetFile = req.files?.answerSheet?.[0];

    if (!questionFile) {
      return res.status(400).json({ error: 'File is required' });
    }

    if (!answerSheetFile) {
      return res.status(400).json({ error: 'Answer sheet file is required' });
    }

    const questionsText = await extractTextFromFile(questionFile);
    const answersText = await extractTextFromFile(answerSheetFile);
    const answersMap = parseAnswersFromText(answersText);
    const parsedQuestions = parseQuestionsFromText(questionsText);

    if (parsedQuestions.length === 0) {
      return res.status(400).json({ error: 'No questions could be parsed from the uploaded file' });
    }

    const formattedQuestions = parsedQuestions.map((q, index) => {
      const answerLetter = answersMap.get(q.number);
      return {
        question_text: q.question_text,
        question_order: q.number || index + 1,
        marks: 1.0,
        options: q.options.map((opt, optIndex) => ({
          option_text: opt.option_text,
          option_order: optIndex + 1,
          is_correct: answerLetter ? opt.letter === answerLetter : false
        }))
      };
    });

    const setId = parseInt(req.params.setId, 10);
    const savedCount = addQuestionsToStore(setId, formattedQuestions);

    res.json({
      message: 'File uploaded and questions parsed successfully',
      file_name: questionFile.filename,
      answer_sheet_name: answerSheetFile.filename,
      questions_parsed: savedCount
    });
  } catch (error) {
    console.error('Error uploading question file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

app.post('/api/admin/question-sets/:setId/answer-sheet', authenticateToken, upload.single('answerSheet'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Answer sheet file is required' });
    }

    res.json({
      message: 'Answer sheet uploaded successfully',
      file_name: req.file.filename
    });
  } catch (error) {
    console.error('Error uploading answer sheet:', error);
    res.status(500).json({ error: 'Failed to upload answer sheet' });
  }
});

// Update Question Set
app.put('/api/admin/question-sets/:setId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const setId = parseInt(req.params.setId);
    const { set_name, description, total_questions, duration_minutes, passing_percentage } = req.body;
    
    const questionSetsPath = path.join(__dirname, 'data', 'question-sets.json');
    
    if (!fs.existsSync(questionSetsPath)) {
      return res.status(404).json({ error: 'Question set not found' });
    }
    
    let questionSets = JSON.parse(fs.readFileSync(questionSetsPath, 'utf8'));
    const setIndex = questionSets.findIndex(set => set.id === setId);
    
    if (setIndex === -1) {
      return res.status(404).json({ error: 'Question set not found' });
    }
    
    questionSets[setIndex] = {
      ...questionSets[setIndex],
      set_name,
      description,
      total_questions: parseInt(total_questions),
      duration_minutes: parseInt(duration_minutes),
      passing_percentage: parseInt(passing_percentage)
    };
    
    fs.writeFileSync(questionSetsPath, JSON.stringify(questionSets, null, 2));
    
    res.json({ message: 'Question set updated successfully' });
  } catch (error) {
    console.error('Error updating question set:', error);
    res.status(500).json({ error: 'Failed to update question set' });
  }
});

// Delete Question Set
app.delete('/api/admin/question-sets/:setId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const setId = parseInt(req.params.setId);
    
    const questionSetsPath = path.join(__dirname, 'data', 'question-sets.json');
    
    if (!fs.existsSync(questionSetsPath)) {
      return res.status(404).json({ error: 'Question set not found' });
    }
    
    let questionSets = JSON.parse(fs.readFileSync(questionSetsPath, 'utf8'));
    const setIndex = questionSets.findIndex(set => set.id === setId);
    
    if (setIndex === -1) {
      return res.status(404).json({ error: 'Question set not found' });
    }
    
    questionSets.splice(setIndex, 1);
    
    fs.writeFileSync(questionSetsPath, JSON.stringify(questionSets, null, 2));
    
    res.json({ message: 'Question set deleted successfully' });
  } catch (error) {
    console.error('Error deleting question set:', error);
    res.status(500).json({ error: 'Failed to delete question set' });
  }
});

// Exam Sessions Management
app.get('/api/admin/exam-sessions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const [sessions] = await pool.execute(`
      SELECT es.*, u.full_name, u.email, qs.set_name, r.rank_name
      FROM exam_sessions es
      JOIN users u ON es.user_id = u.id
      JOIN question_sets qs ON es.question_set_id = qs.id
      JOIN ranks r ON qs.rank_id = r.id
      ORDER BY es.created_at DESC
    `);
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching exam sessions:', error);
    res.status(500).json({ error: 'Failed to fetch exam sessions' });
  }
});

app.post('/api/admin/exam-sessions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { user_id, question_set_id, title, description, scheduled_date, duration_minutes } = req.body;
    
    // Validate required fields
    if (!user_id || !question_set_id || !title || !scheduled_date || duration_minutes === undefined) {
      return res.status(400).json({ error: 'Missing required fields: user_id, question_set_id, title, scheduled_date, duration_minutes' });
    }
    
    // Validate data types
    if (typeof user_id !== 'number' && isNaN(parseInt(user_id))) {
      return res.status(400).json({ error: 'user_id must be a valid number' });
    }
    if (typeof question_set_id !== 'number' && isNaN(parseInt(question_set_id))) {
      return res.status(400).json({ error: 'question_set_id must be a valid number' });
    }
    if (isNaN(parseInt(duration_minutes)) || parseInt(duration_minutes) <= 0) {
      return res.status(400).json({ error: 'duration_minutes must be a positive number' });
    }
    
    const [result] = await pool.execute(`
      INSERT INTO exam_sessions (user_id, question_set_id, title, description, scheduled_date, duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [parseInt(user_id), parseInt(question_set_id), title, description || '', scheduled_date, parseInt(duration_minutes)]);
    
    res.json({ id: result.insertId, message: 'Exam scheduled successfully' });
  } catch (error) {
    console.error('Error creating exam session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create exam session';
    res.status(500).json({ error: errorMessage });
  }
});

// Exam Results and Review
app.get('/api/admin/exam-results', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const [results] = await pool.execute(`
      SELECT er.*, es.title, u.full_name, u.email, qs.set_name, r.rank_name
      FROM exam_results er
      JOIN exam_attempts ea ON er.exam_attempt_id = ea.id
      JOIN exam_sessions es ON ea.exam_session_id = es.id
      JOIN users u ON ea.user_id = u.id
      JOIN question_sets qs ON es.question_set_id = qs.id
      JOIN ranks r ON qs.rank_id = r.id
      ORDER BY er.submitted_at DESC
    `);
    res.json(results);
  } catch (error) {
    console.error('Error fetching exam results:', error);
    res.status(500).json({ error: 'Failed to fetch exam results' });
  }
});

app.get('/api/admin/exam-results/:resultId/details', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const resultId = req.params.resultId;
    
    const [userAnswers] = await pool.execute(`
      SELECT ua.id, ua.exam_attempt_id, ua.question_id, 
             CAST(ua.selected_option_ids AS JSON) as selected_option_ids,
             ua.is_correct, q.question_text, q.question_type, q.question_order,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', ao.id,
                 'option_text', ao.option_text,
                 'is_correct', ao.is_correct
               )
             ) as options
      FROM user_answers ua
      JOIN questions q ON ua.question_id = q.id
      LEFT JOIN answer_options ao ON q.id = ao.question_id
      WHERE ua.exam_attempt_id = ?
      GROUP BY ua.id, ua.exam_attempt_id, ua.question_id, ua.selected_option_ids, ua.is_correct, q.question_text, q.question_type, q.question_order
      ORDER BY q.question_order
    `, [resultId]);
    
    // Parse the selected_option_ids from JSON strings to arrays
    const parsedAnswers = userAnswers.map((answer) => ({
      ...answer,
      selected_option_ids: answer.selected_option_ids ? JSON.parse(answer.selected_option_ids) : []
    }));
    
    res.json(parsedAnswers);
  } catch (error) {
    console.error('Error fetching exam details:', error);
    res.status(500).json({ error: 'Failed to fetch exam details' });
  }
});

app.post('/api/admin/exam-results/:resultId/publish', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const resultId = req.params.resultId;
    const { send_email } = req.body;
    
    const [result] = await pool.execute(`
      UPDATE exam_results 
      SET published_to_profile = TRUE, email_sent = ?
      WHERE id = ?
    `, [send_email || false, resultId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Result not found' });
    }
    
    res.json({ message: 'Results published successfully' });
  } catch (error) {
    console.error('Error publishing results:', error);
    res.status(500).json({ error: 'Failed to publish results' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Catch all handler: send back React's index.html file for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
