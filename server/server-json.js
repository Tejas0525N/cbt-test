const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors());
app.use(express.json());

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Helper function to read JSON files
const readJsonFile = async (filename) => {
  try {
    const filePath = path.join(__dirname, 'data', filename);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return [];
  }
};

// Helper function to write JSON files
const writeJsonFile = async (filename, data) => {
  try {
    const filePath = path.join(__dirname, 'data', filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
    return false;
  }
};

const uploadsDir = path.join(__dirname, 'data', 'uploads');
if (!fsSync.existsSync(uploadsDir)) {
  fsSync.mkdirSync(uploadsDir, { recursive: true });
}

const saveBase64Image = async (base64Data, filenamePrefix) => {
  try {
    const matches = base64Data.match(/^data:(image\/jpeg|image\/png);base64,(.+)$/);
    if (!matches) {
      return null;
    }

    const ext = matches[1] === 'image/png' ? 'png' : 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');
    const fileName = `${filenamePrefix}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    await fs.writeFile(filePath, buffer);
    return path.relative(path.join(__dirname, 'data'), filePath).replace(/\\/g, '/');
  } catch (error) {
    console.error('Error saving image:', error);
    return null;
  }
};

const shuffleArray = (array) => {
  const result = Array.isArray(array) ? [...array] : [];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const chooseQuestionSetKey = (questionSetData, previousUsed = []) => {
  if (!questionSetData || !questionSetData.question_sets) {
    return null;
  }

  const availableSets = Object.entries(questionSetData.question_sets)
    .filter(([, questions]) => Array.isArray(questions) && questions.length > 0)
    .map(([key]) => key);

  if (availableSets.length === 0) {
    return null;
  }

  const unusedSets = availableSets.filter(setKey => !previousUsed.includes(setKey));
  const candidates = unusedSets.length > 0 ? unusedSets : availableSets;
  return candidates[Math.floor(Math.random() * candidates.length)];
};

// Delete a question set
app.delete('/api/admin/question-sets/:setId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const setId = parseInt(req.params.setId);
    let questionSets = await readJsonFile('question-sets.json');
    const setIndex = questionSets.findIndex(qs => qs.id === setId);
    if (setIndex === -1) {
      return res.status(404).json({ error: 'Question set not found' });
    }
    questionSets.splice(setIndex, 1);
    await writeJsonFile('question-sets.json', questionSets);
    // Also remove questions belonging to this set
    let questions = await readJsonFile('questions.json');
    questions = questions.filter(q => q.question_set_id !== setId);
    await writeJsonFile('questions.json', questions);
    res.json({ message: 'Question set deleted successfully' });
  } catch (error) {
    console.error('Error deleting question set:', error);
    res.status(500).json({ error: 'Failed to delete question set' });
  }
});

// Upload questions (JSON array)
app.post('/api/admin/question-sets/:setId/questions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const setId = parseInt(req.params.setId);
    const { questions } = req.body;
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Questions must be an array' });
    }
    let allQuestions = await readJsonFile('questions.json');
    // Remove old questions for this set
    allQuestions = allQuestions.filter(q => q.question_set_id !== setId);
    // Assign new IDs and add setId
    const maxId = allQuestions.length > 0 ? Math.max(...allQuestions.map(q => q.id)) : 0;
    const newQuestions = questions.map((q, idx) => ({
      ...q,
      id: maxId + idx + 1,
      question_set_id: setId
    }));
    allQuestions = allQuestions.concat(newQuestions);
    await writeJsonFile('questions.json', allQuestions);
    res.json({ message: 'Questions uploaded successfully', count: newQuestions.length });
  } catch (error) {
    console.error('Error uploading questions:', error);
    res.status(500).json({ error: 'Failed to upload questions' });
  }
});

// Upload questions file (CSV/Excel/JSON via multipart/form-data)
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const extractTextFromFile = async (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const buffer = await fs.readFile(file.path);

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (ext === '.pdf') {
    const data = await pdfParse(buffer);
    return data.text || '';
  }

  return buffer.toString('utf8');
};

const parseAnswersFromText = (text) => {
  const answerMap = new Map();
  const regex = /(\d+)\s*[-:\.]?\s*([A-D])/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    answerMap.set(parseInt(match[1], 10), match[2].toUpperCase());
  }
  return answerMap;
};

const parseQuestionsFromText = (text) => {
  const normalized = text.replace(/\r/g, '').replace(/\n+/g, '\n');
  const parts = normalized.split(/\n?\s*(\d+)\.[ \t]*/).filter(Boolean);
  const questions = [];

  for (let i = 0; i < parts.length; i += 2) {
    const number = parseInt(parts[i], 10);
    const body = (parts[i + 1] || '').trim();
    if (!body) continue;

    const optionParts = body.split(/([A-D])\.[ \t]*/).filter(Boolean);
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

const persistQuestionsToMultipleSet = async (setId, setNumber, questions) => {
  const multipleSets = await readJsonFile('question-sets-multiple.json');
  let questionSetData = multipleSets.find(qs => qs.question_set_id === setId);

  if (!questionSetData) {
    questionSetData = {
      question_set_id: setId,
      set_name: `Question Set ${setId}`,
      question_sets: {
        set_1: [],
        set_2: [],
        set_3: []
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    multipleSets.push(questionSetData);
  }

  const existingQuestionIds = Object.values(questionSetData.question_sets).flat().map(q => q.id || 0);
  const existingOptionIds = Object.values(questionSetData.question_sets)
    .flat()
    .flatMap(q => q.options?.map(o => o.id) || []);

  let nextQuestionId = existingQuestionIds.length > 0 ? Math.max(...existingQuestionIds) + 1 : 1;
  let nextOptionId = existingOptionIds.length > 0 ? Math.max(...existingOptionIds) + 1 : 1;

  const newQuestions = questions.map((question) => {
    const options = question.options.map((option, index) => ({
      id: nextOptionId++,
      option_text: option.option_text,
      option_order: option.option_order || index + 1,
      is_correct: option.is_correct || false
    }));

    return {
      id: nextQuestionId++,
      question_text: question.question_text,
      question_type: question.question_type || 'single_choice',
      question_order: question.question_order || question.number || 0,
      marks: question.marks || 1,
      options
    };
  });

  questionSetData.question_sets[`set_${setNumber}`] = newQuestions;
  questionSetData.updated_at = new Date().toISOString();
  await writeJsonFile('question-sets-multiple.json', multipleSets);
  return newQuestions.length;
};

app.post('/api/admin/question-sets/:setId/upload-file', authenticateToken, upload.fields([{ name: 'file' }, { name: 'answerSheet' }]), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const setId = parseInt(req.params.setId);
    const setNumber = parseInt(req.query.setNumber, 10);
    if (![1, 2, 3].includes(setNumber)) {
      return res.status(400).json({ error: 'Invalid setNumber query parameter. Must be 1, 2, or 3.' });
    }

    const questionFile = req.files?.file?.[0];
    const answerSheetFile = req.files?.answerSheet?.[0];

    if (!questionFile) {
      return res.status(400).json({ error: 'Question file is required' });
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

    const formattedQuestions = parsedQuestions.map((q) => {
      const answerLetter = answersMap.get(q.number);
      return {
        question_text: q.question_text,
        question_order: q.number,
        marks: 1,
        options: q.options.map((opt) => ({
          option_text: opt.option_text,
          option_order: 0,
          is_correct: answerLetter ? opt.letter === answerLetter : false
        }))
      };
    });

    const savedCount = await persistQuestionsToMultipleSet(setId, setNumber, formattedQuestions);

    res.json({
      message: 'File uploaded and questions parsed successfully',
      file_name: questionFile.originalname,
      answer_sheet_name: answerSheetFile.originalname,
      questions_parsed: savedCount,
      set_number: setNumber
    });
  } catch (error) {
    console.error('Error uploading questions file:', error);
    res.status(500).json({ error: 'Failed to upload questions file' });
  }
});

// Upload answer sheet (file)
app.post('/api/admin/question-sets/:setId/answers', authenticateToken, upload.single('answerSheet'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Answer sheet file is required' });
    }
    res.json({ message: 'Answer sheet uploaded successfully (parsing not implemented in mock server)' });
  } catch (error) {
    console.error('Error uploading answer sheet:', error);
    res.status(500).json({ error: 'Failed to upload answer sheet' });
  }
});

// NEW: Multiple Question Sets Management

// Get multiple question sets for a question set ID
app.get('/api/admin/question-sets/:setId/multiple-sets', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const setId = parseInt(req.params.setId);
    const multipleSets = await readJsonFile('question-sets-multiple.json');
    const questionSetData = multipleSets.find(qs => qs.question_set_id === setId);
    
    if (!questionSetData) {
      // Create empty structure if not exists
      const newStructure = {
        question_set_id: setId,
        set_name: `Question Set ${setId}`,
        question_sets: {
          set_1: [],
          set_2: [],
          set_3: []
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      multipleSets.push(newStructure);
      await writeJsonFile('question-sets-multiple.json', multipleSets);
      return res.json(newStructure);
    }
    
    res.json(questionSetData);
  } catch (error) {
    console.error('Error fetching multiple question sets:', error);
    res.status(500).json({ error: 'Failed to fetch multiple question sets' });
  }
});

// Upload questions to specific question set (set_1, set_2, or set_3)
app.post('/api/admin/question-sets/:setId/upload-set/:setNumber', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const setId = parseInt(req.params.setId);
    const setNumber = `set_${req.params.setNumber}`;
    const { questions } = req.body;
    
    console.log('Upload request:', { setId, setNumber, questionsCount: questions?.length });
    console.log('Questions received:', questions);
    
    if (!['set_1', 'set_2', 'set_3'].includes(setNumber)) {
      return res.status(400).json({ error: 'Invalid set number. Must be 1, 2, or 3' });
    }
    
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Questions must be an array' });
    }
    
    let multipleSets = await readJsonFile('question-sets-multiple.json');
    let questionSetData = multipleSets.find(qs => qs.question_set_id === setId);
    
    if (!questionSetData) {
      // Create new structure
      questionSetData = {
        question_set_id: setId,
        set_name: `Question Set ${setId}`,
        question_sets: {
          set_1: [],
          set_2: [],
          set_3: []
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      multipleSets.push(questionSetData);
    }
    
    // Assign new IDs and add questions to the specified set
    const maxId = Math.max(
      ...questionSetData.question_sets.set_1.map(q => q.id || 0),
      ...questionSetData.question_sets.set_2.map(q => q.id || 0),
      ...questionSetData.question_sets.set_3.map(q => q.id || 0),
      0
    );
    
    const newQuestions = questions.map((q, idx) => ({
      ...q,
      id: maxId + idx + 1
    }));
    
    // Overwrite the specific set
    questionSetData.question_sets[setNumber] = newQuestions;
    questionSetData.updated_at = new Date().toISOString();
    
    console.log('Before saving - questionSetData:', JSON.stringify(questionSetData, null, 2));
    
    const saved = await writeJsonFile('question-sets-multiple.json', multipleSets);
    console.log('File saved successfully:', saved);
    
    res.json({ 
      message: `Questions uploaded successfully to ${setNumber}`,
      count: newQuestions.length,
      set_number: setNumber
    });
  } catch (error) {
    console.error('Error uploading questions to set:', error);
    res.status(500).json({ error: 'Failed to upload questions to set' });
  }
});

// Delete an exam session
app.delete('/api/admin/exam-sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const sessionId = parseInt(req.params.sessionId);
    let examSessions = await readJsonFile('exam-sessions.json');
    const sessionIndex = examSessions.findIndex(s => s.id === sessionId);
    if (sessionIndex === -1) {
      return res.status(404).json({ error: 'Exam session not found' });
    }
    examSessions.splice(sessionIndex, 1);
    await writeJsonFile('exam-sessions.json', examSessions);
    res.json({ message: 'Exam session deleted successfully' });
  } catch (error) {
    console.error('Error deleting exam session:', error);
    res.status(500).json({ error: 'Failed to delete exam session' });
  }
});

// Auth routes
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  console.log('=== Login Attempt ===');
  console.log('Email:', email);
  console.log('Password:', password);
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  // Mock admin login
  if (email.trim().toLowerCase() === 'admin@maritimecbt.com' && password === 'admin123') {
    console.log('✅ Admin login successful!');
    const token = jwt.sign(
      { id: '1', email: 'admin@maritimecbt.com', role: 'admin' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    return res.json({
      token,
      user: {
        id: '1',
        email: 'admin@maritimecbt.com',
        full_name: 'System Administrator',
        role: 'admin'
      }
    });
  }
  
  try {
    const users = await readJsonFile('users.json');
    console.log('Loaded users from file:', users.length);
    const normalizedLogin = email.toLowerCase();
    const existingUser = users.find(
      (user) => user.email.toLowerCase() === normalizedLogin || user.username.toLowerCase() === normalizedLogin
    );
    
    if (existingUser) {
      console.log('✅ Existing user login successful!');
      const token = jwt.sign(
        { id: existingUser.id.toString(), email: existingUser.email, role: 'user' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      return res.json({
        token,
        user: {
          id: existingUser.id.toString(),
          email: existingUser.email,
          full_name: existingUser.full_name || existingUser.username,
          role: 'user'
        }
      });
    }
    
    // Create a demo user on-the-fly for any valid credentials
    console.log('🔄 Creating new demo user...');
    const newUser = {
      id: Math.max(...users.map((u) => u.id), 0) + 1,
      username: normalizedLogin.includes('@') ? normalizedLogin.split('@')[0] : normalizedLogin,
      email: normalizedLogin,
      full_name: normalizedLogin.includes('@') ? normalizedLogin.split('@')[0].replace(/\./g, ' ') : normalizedLogin,
      rank_id: 0,
      rank_name: 'User',
      department_name: 'Deck',
      phone: '',
      created_at: new Date().toISOString(),
      is_active: true,
      role: 'user'
    };
    
    users.push(newUser);
    await writeJsonFile('users.json', users);
    
    const token = jwt.sign(
      { id: newUser.id.toString(), email: newUser.email, role: 'user' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('✅ New user created and logged in!');
    return res.json({
      token,
      user: {
        id: newUser.id.toString(),
        email: newUser.email,
        full_name: newUser.full_name,
        role: 'user'
      }
    });
  } catch (error) {
    console.error('❌ Error during login:', error);
    return res.status(500).json({ error: 'Failed to authenticate user' });
  }
});

// Department routes
app.get('/api/admin/departments', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const departments = await readJsonFile('departments.json');
    console.log('Departments fetched:', departments.length);
    res.json(departments);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// Rank routes
app.get('/api/admin/ranks', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const ranks = await readJsonFile('ranks.json');
    res.json(ranks);
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
    const ranks = await readJsonFile('ranks.json');
    const filteredRanks = ranks.filter(rank => rank.department_id === departmentId);
    res.json(filteredRanks);
  } catch (error) {
    console.error('Error fetching ranks by department:', error);
    res.status(500).json({ error: 'Failed to fetch ranks' });
  }
});

// User routes
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const users = await readJsonFile('users.json');
    res.json(users);
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
    
    // Read existing users
    const users = await readJsonFile('users.json');
    
    // Check if user already exists
    const existingUser = users.find(u => u.username === username || u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    // Read ranks to get rank and department info
    const ranks = await readJsonFile('ranks.json');
    const rank = ranks.find(r => r.id === rank_id);
    
    // Create new user
    const newUser = {
      id: Math.max(...users.map(u => u.id)) + 1,
      username,
      email,
      full_name,
      rank_id,
      rank_name: rank ? rank.rank_name : '',
      department_name: rank ? rank.department_name : '',
      phone: phone || '',
      password_hash: password ? bcrypt.hashSync(password, 10) : undefined,
      created_at: new Date().toISOString(),
      is_active: true,
      role: 'user'
    };
    
    users.push(newUser);
    
    // Save to file
    const saved = await writeJsonFile('users.json', users);
    if (!saved) {
      return res.status(500).json({ error: 'Failed to save user' });
    }
    
    res.json({ 
      id: newUser.id, 
      username, 
      email, 
      full_name, 
      rank_id,
      rank_name: newUser.rank_name,
      department_name: newUser.department_name,
      phone: newUser.phone,
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
    
    // Read existing users
    const users = await readJsonFile('users.json');
    
    // Find user
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Read ranks to get rank and department info
    const ranks = await readJsonFile('ranks.json');
    const rank = ranks.find(r => r.id === rank_id);
    
    // Update user
    users[userIndex] = {
      ...users[userIndex],
      username,
      email,
      full_name,
      rank_id,
      rank_name: rank ? rank.rank_name : users[userIndex].rank_name,
      department_name: rank ? rank.department_name : users[userIndex].department_name,
      phone: phone || users[userIndex].phone,
      is_active: is_active !== undefined ? is_active : users[userIndex].is_active,
      ...(password ? { password_hash: bcrypt.hashSync(password, 10) } : {})
    };
    
    // Save to file
    const saved = await writeJsonFile('users.json', users);
    if (!saved) {
      return res.status(500).json({ error: 'Failed to update user' });
    }
    
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const userId = parseInt(req.params.id);
    
    // Delete from users JSON file
    let users = await readJsonFile('users.json');
    users = users.filter(user => user.id !== userId);
    await writeJsonFile('users.json', users);
    
    // Delete user's exam sessions from JSON
    let examSessions = await readJsonFile('exam-sessions.json');
    examSessions = examSessions.filter(session => session.user_id !== userId);
    await writeJsonFile('exam-sessions.json', examSessions);
    
    // First read exam attempts to get the IDs we need to remove from results
    let allExamAttempts = await readJsonFile('exam-attempts.json');
    const userAttemptIds = allExamAttempts.filter(attempt => attempt.user_id === userId).map(attempt => attempt.id);
    
    // Delete user's exam attempts from JSON
    let examAttempts = allExamAttempts.filter(attempt => attempt.user_id !== userId);
    await writeJsonFile('exam-attempts.json', examAttempts);
    
    // Delete user's exam results from JSON
    let examResults = await readJsonFile('exam-results.json');
    examResults = examResults.filter(result => !userAttemptIds.includes(result.exam_attempt_id));
    await writeJsonFile('exam-results.json', examResults);
    
    res.json({ message: 'User and all associated exams deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Question sets routes
app.get('/api/admin/question-sets', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const questionSets = await readJsonFile('question-sets.json');
    res.json(questionSets);
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
    
    // Validate required fields
    if (!rank_id || !set_name) {
      return res.status(400).json({ error: 'Rank and set name are required' });
    }
    
    // Read existing question sets
    const questionSets = await readJsonFile('question-sets.json');
    
    // Read ranks to get rank and department info
    const ranks = await readJsonFile('ranks.json');
    const rank = ranks.find(r => r.id === rank_id);
    
    // Create new question set
    const newQuestionSet = {
      id: Math.max(...questionSets.map(qs => qs.id)) + 1,
      rank_id,
      set_name,
      description: description || '',
      total_questions: total_questions || 30,
      duration_minutes: duration_minutes || 30,
      passing_percentage: passing_percentage || 75,
      is_active: true,
      created_at: new Date().toISOString(),
      rank_name: rank ? rank.rank_name : '',
      department_name: rank ? rank.department_name : ''
    };
    
    questionSets.push(newQuestionSet);
    
    // Save to file
    const saved = await writeJsonFile('question-sets.json', questionSets);
    if (!saved) {
      return res.status(500).json({ error: 'Failed to save question set' });
    }
    
    res.json({ 
      id: newQuestionSet.id, 
      ...newQuestionSet,
      message: 'Question set created successfully' 
    });
  } catch (error) {
    console.error('Error creating question set:', error);
    res.status(500).json({ error: 'Failed to create question set' });
  }
});

// Exam sessions routes
app.get('/api/exam-sessions', authenticateToken, async (req, res) => {
  try {
    const examSessions = await readJsonFile('exam-sessions.json');
    const examAttempts = await readJsonFile('exam-attempts.json');
    let sessions = examSessions;

    if (req.user.role !== 'admin') {
      sessions = examSessions.filter((session) => session.email === req.user.email);
    }

    sessions = sessions.filter((session) => ['scheduled', 'in_progress', 'completed'].includes(session.status));

    const enrichedSessions = sessions.map((session) => {
      const userId = session.user_id || parseInt(req.user.id);
      const sessionAttempts = examAttempts.filter(
        attempt => attempt.exam_session_id === session.id && attempt.user_id === userId
      );
      const currentAttempt = sessionAttempts.find(attempt => attempt.status === 'in_progress');
      return {
        ...session,
        attempts_taken: sessionAttempts.length,
        last_attempt_status: sessionAttempts.length ? sessionAttempts[sessionAttempts.length - 1].status : null,
        current_attempt_id: currentAttempt?.id || null,
        passed: sessionAttempts.some(attempt => attempt.passed === true)
      };
    });

    res.json(enrichedSessions);
  } catch (error) {
    console.error('Error fetching exam sessions:', error);
    res.status(500).json({ error: 'Failed to fetch exam sessions' });
  }
});

app.get('/api/exam-sessions/:id/questions', authenticateToken, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const sessions = await readJsonFile('exam-sessions.json');
    const session = sessions.find((s) => s.id === sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Exam session not found' });
    }

    if (req.user.role !== 'admin' && session.email !== req.user.email) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const questions = await readJsonFile('questions.json');
    const filtered = questions
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

    res.json(filtered);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

app.get('/api/admin/exam-sessions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const examSessions = await readJsonFile('exam-sessions.json');
    res.json(examSessions);
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
    
    const { user_id, question_set_id, title, description, scheduled_date, start_date, end_date, duration_minutes } = req.body;
    
    // Validate required fields
    if (!user_id || !question_set_id || !title || !start_date || !end_date) {
      return res.status(400).json({ error: 'All required fields must be provided (user_id, question_set_id, title, start_date, end_date)' });
    }
    
    // Validate that end_date is after start_date
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    if (endDate <= startDate) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }
    
    // Read existing exam sessions
    const examSessions = await readJsonFile('exam-sessions.json');
    
    // Read users and question sets to get additional info
    const users = await readJsonFile('users.json');
    const questionSets = await readJsonFile('question-sets.json');
    
    const user = users.find(u => u.id === user_id);
    const questionSet = questionSets.find(qs => qs.id === question_set_id);
    
    // Create new exam session
    const newExamSession = {
      id: Math.max(...examSessions.map(es => es.id)) + 1,
      user_id,
      question_set_id,
      title,
      description: description || '',
      scheduled_date: scheduled_date || start_date,
      start_date,
      end_date,
      duration_minutes: duration_minutes || 30,
      status: 'scheduled',
      created_at: new Date().toISOString(),
      full_name: user ? user.full_name : '',
      email: user ? user.email : '',
      set_name: questionSet ? questionSet.set_name : '',
      rank_name: user ? user.rank_name : '',
      department_name: user ? user.department_name : ''
    };
    
    examSessions.push(newExamSession);
    
    // Save to file
    const saved = await writeJsonFile('exam-sessions.json', examSessions);
    if (!saved) {
      return res.status(500).json({ error: 'Failed to save exam session' });
    }
    
    res.json({ 
      id: newExamSession.id, 
      ...newExamSession,
      message: 'Exam session created successfully' 
    });
  } catch (error) {
    console.error('Error creating exam session:', error);
    res.status(500).json({ error: 'Failed to create exam session' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

app.get('/api/exam-sessions/:id', authenticateToken, async (req, res) => {
  try {
    const examSessions = await readJsonFile('exam-sessions.json');
    const session = examSessions.find(s => s.id === parseInt(req.params.id));
    if (!session) {
      return res.status(404).json({ error: 'Exam session not found' });
    }
    res.json(session);
  } catch (error) {
    console.error('Error fetching exam session:', error);
    res.status(500).json({ error: 'Failed to fetch exam session' });
  }
});

// Get user exam results and attempts
app.get('/api/user/exam-results', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const examResults = await readJsonFile('exam-results.json');
    const examAttempts = await readJsonFile('exam-attempts.json');
    const examSessions = await readJsonFile('exam-sessions.json');
    const questionSets = await readJsonFile('question-sets.json');
    
    // Get all attempts for this user, sorted by attempt number
    const userAttempts = examAttempts
      .filter(a => a.user_id === userId)
      .sort((a, b) => a.attempt_number - b.attempt_number);
    
    // Group by session and get results
    const resultsBySession = {};
    for (const attempt of userAttempts) {
      const session = examSessions.find(s => s.id === attempt.exam_session_id);
      const matchingResults = examResults.filter(r => r.exam_attempt_id === attempt.id);
      const result = matchingResults
        .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
        .pop() || null;
      const questionSet = session ? questionSets.find(qs => qs.id === session.question_set_id) : null;
      const attemptStatus = result ? 'submitted' : attempt.status;
      const attemptPassed = result ? result.passed : attempt.passed;
      const submittedAt = result?.submitted_at || attempt.submitted_at;
      const percentageScore = result?.percentage_score ?? attempt.percentage_score ?? null;
      const correctAnswers = result?.correct_answers ?? attempt.correct_answers ?? 0;
      const totalQuestions = result?.total_questions ?? attempt.total_questions ?? 0;
      
      if (!resultsBySession[attempt.exam_session_id]) {
        resultsBySession[attempt.exam_session_id] = {
          session_id: attempt.exam_session_id,
          question_set_id: session?.question_set_id || null,
          session_status: session?.status || 'scheduled',
          title: session?.title || '',
          set_name: questionSet?.set_name || '',
          attempts: []
        };
      }
      
      resultsBySession[attempt.exam_session_id].attempts.push({
        attempt_number: attempt.attempt_number,
        status: attemptStatus,
        submitted_at: submittedAt,
        passed: attemptPassed,
        percentage_score: percentageScore,
        correct_answers: correctAnswers,
        total_questions: totalQuestions,
        next_attempt_available: attempt.next_attempt_available
      });
    }
    
    res.json(Object.values(resultsBySession));
  } catch (error) {
    console.error('Error fetching user exam results:', error);
    res.status(500).json({ error: 'Failed to fetch user exam results' });
  }
});

app.get('/api/exam-sessions/:sessionId/questions', authenticateToken, async (req, res) => {
  try {
    const examSessions = await readJsonFile('exam-sessions.json');
    const examAttempts = await readJsonFile('exam-attempts.json');
    const multipleSets = await readJsonFile('question-sets-multiple.json');
    
    // Find the session
    const session = examSessions.find(s => s.id === parseInt(req.params.sessionId));
    if (!session) {
      return res.status(404).json({ error: 'Exam session not found' });
    }
    
    // Find the user's current attempt for this session
    const userId = parseInt(req.user.id);
    const userAttempt = examAttempts.find(
      (attempt) => attempt.exam_session_id === session.id && attempt.user_id === userId && attempt.status === 'in_progress'
    );
    
    if (!userAttempt) {
      return res.status(404).json({ error: 'No active attempt found for this session' });
    }
    
    // Get the appropriate question set based on attempt
    console.log('Fetching questions for exam:', {
      sessionId: req.params.sessionId,
      userId: userId,
      sessionQuestionSetId: session.question_set_id,
      userAttemptQuestionSetUsed: userAttempt.question_set_used
    });
    
    const questionSetData = multipleSets.find(qs => qs.question_set_id === session.question_set_id);
    if (!questionSetData) {
      console.error('Question set data not found for ID:', session.question_set_id);
      return res.status(404).json({ error: 'Question set data not found' });
    }
    
    let questionSetToUse = userAttempt.question_set_used || 'set_1';
    let setQuestions = questionSetData.question_sets[questionSetToUse] || [];

    if (setQuestions.length === 0) {
      const fallbackSet = chooseQuestionSetKey(questionSetData, []);
      if (!fallbackSet) {
        return res.status(404).json({ error: 'No questions available for this exam attempt' });
      }
      questionSetToUse = fallbackSet;
      setQuestions = questionSetData.question_sets[questionSetToUse] || [];
    }
    
    console.log('Questions to serve:', {
      questionSetToUse,
      questionsCount: setQuestions.length,
      questionIds: setQuestions.map(q => q.id)
    });
    
    // Format and shuffle questions with options
    const questionsWithOptions = shuffleArray(setQuestions).map((q, index) => ({
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      question_order: index + 1,
      marks: q.marks,
      options: shuffleArray(q.options || []).map(opt => ({
        id: opt.id,
        option_text: opt.option_text,
        option_order: opt.option_order
      }))
    }));
    
    res.json(questionsWithOptions);
  } catch (error) {
    console.error('Error fetching questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

app.post('/api/exam-attempts', authenticateToken, async (req, res) => {
  try {
    const { examSessionId, photo_data } = req.body;
    const userId = parseInt(req.user.id);
    
    if (!examSessionId) {
      return res.status(400).json({ error: 'examSessionId is required' });
    }
    
    if (!userId || isNaN(userId)) {
      return res.status(401).json({ error: 'Invalid user ID in token' });
    }
    
    const examSessions = await readJsonFile('exam-sessions.json');
    const session = examSessions.find(s => s.id === parseInt(examSessionId));
    
    if (!session) {
      return res.status(404).json({ error: 'Exam session not found' });
    }
    
    // Check if exam session is already completed
    if (session.status === 'completed') {
      return res.status(400).json({ error: 'You have already completed this exam. Please ask admin to schedule a new test.' });
    }
    
    // Check exam timing - validate start and end dates
    const now = new Date();
    const startDate = new Date(session.start_date);
    const endDate = new Date(session.end_date);
    
    if (now < startDate) {
      return res.status(400).json({ 
        error: 'Exam has not started yet',
        message: `This exam will be available from ${startDate.toLocaleString()} to ${endDate.toLocaleString()}`
      });
    }
    
    if (now > endDate) {
      return res.status(400).json({ 
        error: 'Exam has expired',
        message: `This exam was only available until ${endDate.toLocaleString()}`
      });
    }
    
    // Check for existing attempts and implement multi-attempt logic
    const examAttempts = await readJsonFile('exam-attempts.json');
    const userAttempts = examAttempts.filter(
      (attempt) => attempt.exam_session_id === parseInt(examSessionId) && attempt.user_id === userId
    );
    
    // Sort attempts by attempt number
    userAttempts.sort((a, b) => a.attempt_number - b.attempt_number);
    
    // Check if user has already passed
    const passedAttempt = userAttempts.find(attempt => attempt.passed === true);
    if (passedAttempt) {
      return res.status(400).json({ error: 'You have already passed this exam.' });
    }

    // Block creating a new attempt if the user has passed any attempt for the same question set
    const userPassedAnySameSet = userAttempts.some((attempt) => {
      const attemptSession = examSessions.find((s) => s.id === attempt.exam_session_id);
      return attemptSession?.question_set_id === session.question_set_id && attempt.passed === true;
    });
    if (userPassedAnySameSet) {
      return res.status(400).json({ error: 'You have already passed this exam. No further attempts are allowed.' });
    }
    
    // Check if user has reached maximum attempts (3)
    if (userAttempts.length >= 3) {
      return res.status(400).json({ error: 'You have reached the maximum number of attempts (3) for this exam.' });
    }
    
    // Check for in-progress attempt
    const inProgressAttempt = userAttempts.find(attempt => attempt.status === 'in_progress');
    if (inProgressAttempt) {
      return res.json(inProgressAttempt);
    }
    
    // Check 48-hour cooldown for failed attempts
    if (userAttempts.length > 0) {
      const lastAttempt = userAttempts[userAttempts.length - 1];
      if (lastAttempt.status === 'submitted' && lastAttempt.passed === false) {
        const nextAttemptAvailable = new Date(lastAttempt.next_attempt_available);
        if (now < nextAttemptAvailable) {
          return res.status(400).json({ 
            error: 'You must wait 48 hours before attempting this exam again',
            message: `Next attempt available: ${nextAttemptAvailable.toLocaleString()}`,
            next_attempt_available: lastAttempt.next_attempt_available
          });
        }
      }
    }

    const multipleSets = await readJsonFile('question-sets-multiple.json');
    const questionSetData = multipleSets.find(qs => qs.question_set_id === session.question_set_id);
    const usedQuestionSets = userAttempts
      .map(attempt => attempt.question_set_used)
      .filter(Boolean);
    let questionSetToUse = 'set_1';

    if (questionSetData) {
      const chosenSet = chooseQuestionSetKey(questionSetData, usedQuestionSets);
      if (!chosenSet) {
        return res.status(400).json({ error: 'No uploaded question sets available for this exam. Please upload at least one set.' });
      }
      questionSetToUse = chosenSet;
    }

    // Determine attempt number and question set
    const attemptNumber = userAttempts.length + 1;
    
    // Create new attempt
    const newAttempt = {
      id: parseInt(examSessionId) * 100 + attemptNumber, // Unique ID for each attempt
      exam_session_id: parseInt(examSessionId),
      user_id: userId,
      attempt_number: attemptNumber,
      question_set_used: questionSetToUse,
      started_at: new Date().toISOString(),
      submitted_at: null,
      status: 'in_progress',
      time_taken_minutes: null,
      passed: false,
      percentage_score: null,
      next_attempt_available: null
    };
    
    examAttempts.push(newAttempt);
    await writeJsonFile('exam-attempts.json', examAttempts);
    
    // Update session status to in_progress
    const updatedSessions = examSessions.map((s) => {
      if (s.id === parseInt(examSessionId)) {
        return { ...s, status: 'in_progress' };
      }
      return s;
    });
    await writeJsonFile('exam-sessions.json', updatedSessions);
    
    res.json(newAttempt);
  } catch (error) {
    console.error('Error creating exam attempt:', error);
    res.status(500).json({ error: 'Failed to create exam attempt' });
  }
});

app.post('/api/exam-attempts/:id/submit', authenticateToken, async (req, res) => {
  try {
    const attemptId = req.params.id;
    const { answers } = req.body;
    
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers must be an array' });
    }
    
    const examSessions = await readJsonFile('exam-sessions.json');
    const examAttempts = await readJsonFile('exam-attempts.json');
    const multipleSets = await readJsonFile('question-sets-multiple.json');
    
    // attemptId param is the exam attempt ID (not the session ID)
    const attempt = examAttempts.find(
      (attempt) => attempt.id === parseInt(attemptId) && attempt.user_id === parseInt(req.user.id)
    );

    if (!attempt) {
      return res.status(404).json({ error: 'Exam attempt not found' });
    }

    const session = examSessions.find(s => s.id === attempt.exam_session_id);
    if (!session) {
      return res.status(404).json({ error: 'Exam session not found for this attempt' });
    }
    
    if (!attempt) {
      return res.status(404).json({ error: 'Exam attempt not found' });
    }
    
    if (attempt.status === 'submitted') {
      return res.status(400).json({ error: 'This exam has already been submitted.' });
    }
    
    // Check if this attempt violates 48-hour cooldown
    const allAttempts = examAttempts.filter(a => a.exam_session_id === attempt.exam_session_id && a.user_id === attempt.user_id);
    const prevSubmittedAttempts = allAttempts.filter(a => a.status === 'submitted' && a.attempt_number < attempt.attempt_number);
    
    for (const prevAttempt of prevSubmittedAttempts) {
      if (prevAttempt.passed === false && prevAttempt.next_attempt_available) {
        const nextAvailable = new Date(prevAttempt.next_attempt_available);
        if (new Date() < nextAvailable) {
          return res.status(400).json({ 
            error: 'You must wait 48 hours before attempting this exam again',
            next_attempt_available: prevAttempt.next_attempt_available
          });
        }
      }
    }
    
    // Get questions from the appropriate question set based on attempt
    console.log('Exam submission - Finding questions for:', {
      sessionQuestionSetId: session.question_set_id,
      attemptQuestionSetUsed: attempt.question_set_used
    });
    
    const questionSetData = multipleSets.find(qs => qs.question_set_id === session.question_set_id);
    if (!questionSetData) {
      console.error('Question set data not found for ID:', session.question_set_id);
      return res.status(404).json({ error: 'Question set data not found' });
    }
    
    const questionSetToUse = attempt.question_set_used || 'set_1';
    const questions = questionSetData.question_sets[questionSetToUse] || [];
    
    console.log('Questions found:', {
      questionSetToUse,
      questionsCount: questions.length,
      availableSets: Object.keys(questionSetData.question_sets)
    });
    
    if (questions.length === 0) {
      console.error('No questions found in set:', questionSetToUse);
      return res.status(400).json({ 
        error: 'No questions found for this exam attempt',
        details: {
          questionSetId: session.question_set_id,
          questionSetToUse,
          availableSets: Object.keys(questionSetData.question_sets)
        }
      });
    }
    
    // Calculate score
    let correctAnswers = 0;
    const userAnswers = [];
    
    console.log('Processing answers:', {
      answersCount: answers.length,
      availableQuestionIds: questions.map(q => q.id),
      answerQuestionIds: answers.map(a => parseInt(a.questionId))
    });
    
    for (const answer of answers) {
      const question = questions.find(q => q.id === parseInt(answer.questionId));
      if (!question) {
        console.warn('Question not found for answer:', {
          answerQuestionId: parseInt(answer.questionId),
          availableIds: questions.map(q => q.id)
        });
        continue;
      }
      
      const correctOptions = (question.options || []).filter(opt => opt.is_correct);
      
      let isCorrect = false;
      const selectedIds = (answer.selectedOptionIds || []).map(id => parseInt(id));
      const correctIds = correctOptions.map(opt => opt.id).sort((a, b) => a - b);
      
      selectedIds.sort((a, b) => a - b);
      
      if (JSON.stringify(selectedIds) === JSON.stringify(correctIds)) {
        isCorrect = true;
        correctAnswers++;
      }
      
      userAnswers.push({
        question_id: question.id,
        selected_option_ids: selectedIds,
        is_correct: isCorrect
      });
    }
    
    const totalQuestions = questions.length;
    const wrongAnswers = totalQuestions - correctAnswers;
    
    // Validate that we have questions to calculate score
    if (totalQuestions === 0) {
      return res.status(400).json({ error: 'No questions found for this exam attempt' });
    }
    
    const percentageScore = Math.round((correctAnswers / totalQuestions) * 100);
    const marksObtained = correctAnswers;
    const totalMarks = totalQuestions;
    
    const passed = percentageScore >= 75;
    const timeTaken = 30;
    
    // Calculate next attempt availability (48 hours from now if failed)
    const nextAttemptAvailable = passed ? null : new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    
    // Update attempt status
    const updatedAttempts = examAttempts.map((a) => {
      if (a.id === attempt.id && a.user_id === parseInt(req.user.id)) {
        return {
          ...a,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          time_taken_minutes: timeTaken,
          passed: passed,
          percentage_score: percentageScore,
          next_attempt_available: nextAttemptAvailable
        };
      }
      return a;
    });
    await writeJsonFile('exam-attempts.json', updatedAttempts);
    
    // Update session status - only mark as completed if passed or exhausted attempts
    const userAllAttempts = examAttempts.filter(
      (a) => a.exam_session_id === attempt.exam_session_id && a.user_id === parseInt(req.user.id)
    );
    
    const shouldMarkCompleted = passed || userAllAttempts.length >= 3;
    
    const updatedSessions = examSessions.map((s) => {
      if (s.id === attempt.exam_session_id) {
        return { ...s, status: shouldMarkCompleted ? 'completed' : s.status };
      }
      return s;
    });
    await writeJsonFile('exam-sessions.json', updatedSessions);
    
    // Store results
    const examResults = await readJsonFile('exam-results.json');
    const newResult = {
      id: Math.max(...examResults.map(r => r.id), 0) + 1,
      exam_attempt_id: parseInt(attemptId),
      total_questions: totalQuestions,
      correct_answers: correctAnswers,
      wrong_answers: wrongAnswers,
      percentage_score: percentageScore,
      passed,
      marks_obtained: marksObtained,
      total_marks: totalMarks,
      time_taken_minutes: timeTaken,
      submitted_at: new Date().toISOString(),
      published_to_profile: false,
      email_sent: false,
      user_answers: userAnswers
    };
    
    examResults.push(newResult);
    await writeJsonFile('exam-results.json', examResults);
    
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
    console.error('Error submitting exam:', error);
    res.status(500).json({ error: 'Failed to submit exam' });
  }
});

// Admin exam results routes
app.get('/api/admin/exam-results', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const examResults = await readJsonFile('exam-results.json');
    const examAttempts = await readJsonFile('exam-attempts.json');
    const examSessions = await readJsonFile('exam-sessions.json');
    const users = await readJsonFile('users.json');
    const questionSets = await readJsonFile('question-sets.json');
    const ranks = await readJsonFile('ranks.json');
    
    // Enrich results with additional data
    const enrichedResults = examResults.map(result => {
      const attempt = examAttempts.find(a => a.id === result.exam_attempt_id);
      const session = attempt ? examSessions.find(s => s.id === attempt.exam_session_id) : null;
      const user = attempt ? users.find(u => u.id === attempt.user_id) : null;
      const questionSet = session ? questionSets.find(qs => qs.id === session.question_set_id) : null;
      const rank = user ? ranks.find(r => r.id === user.rank_id) : null;
      
      return {
        ...result,
        title: session?.title || '',
        full_name: user?.full_name || '',
        email: user?.email || '',
        set_name: questionSet?.set_name || '',
        rank_name: rank?.rank_name || '',
        exam_attempt_id: result.exam_attempt_id
      };
    });
    
    res.json(enrichedResults);
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
    
    const examResults = await readJsonFile('exam-results.json');
    const result = examResults.find(r => r.id === parseInt(req.params.resultId));
    
    if (!result) {
      return res.status(404).json({ error: 'Result not found' });
    }
    
    const questions = await readJsonFile('questions.json');
    
    const details = result.user_answers.map(answer => {
      const question = questions.find(q => q.id === answer.question_id);
      const options = question?.options || [];
      
      return {
        id: answer.question_id,
        exam_attempt_id: result.exam_attempt_id,
        question_id: answer.question_id,
        question_text: question?.question_text || '',
        question_type: question?.question_type || 'single_choice',
        selected_option_ids: answer.selected_option_ids,
        is_correct: answer.is_correct,
        options: options.map(opt => ({
          id: opt.id,
          option_text: opt.option_text,
          is_correct: opt.is_correct
        }))
      };
    });
    
    res.json(details);
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
    
    const examResults = await readJsonFile('exam-results.json');
    const resultIndex = examResults.findIndex(r => r.id === parseInt(req.params.resultId));
    
    if (resultIndex === -1) {
      return res.status(404).json({ error: 'Result not found' });
    }
    
    examResults[resultIndex].published_to_profile = true;
    
    // Send email if requested
    const sendEmail = req.body.send_email || false;
    let emailSent = false;
    
    if (sendEmail) {
      try {
        // Get user and exam details
        const examAttempts = await readJsonFile('exam-attempts.json');
        const examSessions = await readJsonFile('exam-sessions.json');
        const questionSets = await readJsonFile('question-sets.json');
        const users = await readJsonFile('users.json');
        
        const attempt = examAttempts.find(a => a.id === examResults[resultIndex].exam_attempt_id);
        const session = examSessions.find(s => s.id === attempt?.exam_session_id);
        const questionSet = questionSets.find(qs => qs.id === session?.question_set_id);
        const user = users.find(u => u.id === attempt?.user_id);
        
        if (user && user.email) {
          // Configure email transporter
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          });
          
          // Email content
          const mailOptions = {
            from: 'no-reply@maritimecbt.com',
            replyTo: 'no-reply@maritimecbt.com',
            to: user.email,
            subject: `Your Exam Results - ${session?.title || 'Maritime CBT'}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0f172a;">Exam Results</h2>
                <p>Dear ${user.full_name || user.username},</p>
                <p>Your exam results are now available:</p>
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p><strong>Exam:</strong> ${session?.title || 'Exam'}</p>
                  <p><strong>Score:</strong> ${examResults[resultIndex].percentage_score}%</p>
                  <p><strong>Correct Answers:</strong> ${examResults[resultIndex].correct_answers}/${examResults[resultIndex].total_questions}</p>
                  <p><strong>Status:</strong> <span style="color: ${examResults[resultIndex].passed ? '#10b981' : '#ef4444'}; font-weight: bold;">${examResults[resultIndex].passed ? 'PASSED' : 'FAILED'}</span></p>
                </div>
                <p>You can view your complete results by logging into your account.</p>
                <p style="font-size: 12px; color: #64748b; margin-top: 30px;">
                  This is an automated email. Please do not reply to this message.
                </p>
                <p>Best regards,<br>Maritime CBT Team</p>
              </div>
            `,
          };
          
          // Send email
          await transporter.sendMail(mailOptions);
          emailSent = true;
          console.log(`📧 Email sent to ${user.email}`);
        }
      } catch (emailError) {
        console.error('❌ Error sending email:', emailError);
        // Don't fail the whole request if email fails
      }
    }
    
    examResults[resultIndex].email_sent = emailSent;
    
    await writeJsonFile('exam-results.json', examResults);
    
    res.json({ 
      message: 'Results published successfully',
      email_sent: emailSent
    });
  } catch (error) {
    console.error('Error publishing results:', error);
    res.status(500).json({ error: 'Failed to publish results' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Serve frontend static files
const distPath = path.join(__dirname, '..', 'dist');
if (fsSync.existsSync(distPath)) {
  app.use(express.static(distPath));
  
  // For SPA routing - send index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`JSON-based server is running on port ${PORT}`);
  console.log(`Login: admin@maritimecbt.com / admin123`);
  console.log(`Data files located in: ${path.join(__dirname, 'data')}`);
});
