import axios from 'axios';

const API_BASE_URL = process.env.VITE_API_URL || '/api';

console.log('API_BASE_URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  console.log('API Request:', config.method?.toUpperCase(), config.url, 'Token exists:', !!token);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log('Token added to request headers');
  } else {
    console.warn('No auth token found in localStorage');
    console.log('Available localStorage keys:', Object.keys(localStorage));
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.status, error.response?.data);
    if (error.response?.status === 401) {
      console.error('Authentication failed - removing token and redirecting');
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Types
interface Answer {
  questionId: string;
  selectedOptionIds: string[];
}

interface UserData {
  username: string;
  email: string;
  password: string;
  full_name: string;
  rank_id: number;
  phone?: string;
}

interface ExamSessionData {
  user_id: number;
  question_set_id: number;
  title: string;
  description: string;
  scheduled_date: string;
  duration_minutes: number;
}

interface QuestionData {
  question_text: string;
  question_type?: 'single_choice' | 'multiple_choice';
  question_order?: number;
  marks?: number;
  options: {
    option_text: string;
    option_order?: number;
    is_correct: boolean;
  }[];
  explanation?: string;
}

export const authAPI = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    const { token, user } = response.data;
    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify(user));
    return { token, user };
  },
  
  logout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },
  
  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },
  
  getToken: () => {
    return localStorage.getItem('authToken');
  }
};

export const examAPI = {
  getSessions: async () => {
    const response = await api.get('/exam-sessions');
    return response.data;
  },
  
  getSession: async (id: string) => {
    const response = await api.get(`/exam-sessions/${id}`);
    return response.data;
  },
  
  getQuestions: async (sessionId: string) => {
    const response = await api.get(`/exam-sessions/${sessionId}/questions`);
    return response.data;
  },
  
  createAttempt: async (examSessionId: string, photoData?: string) => {
    const payload: any = { examSessionId };
    if (photoData) {
      payload.photo_data = photoData;
    }
    const response = await api.post('/exam-attempts', payload);
    return response.data;
  },
  
  submitAttempt: async (attemptId: string, answers: Answer[]) => {
    const response = await api.post(`/exam-attempts/${attemptId}/submit`, { answers });
    return response.data;
  },

  getUserExamResults: async () => {
    const response = await api.get('/user/exam-results');
    return response.data;
  }
};

export const adminAPI = {
  // Department Management
  getDepartments: async () => {
    console.log('Making request to:', api.defaults.baseURL + '/admin/departments');
    try {
      const response = await api.get('/admin/departments');
      console.log('Departments response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Departments API error:', error);
      throw error;
    }
  },
  
  // User Management
  getUsers: async () => {
    const response = await api.get('/admin/users');
    return response.data;
  },
  
  createUser: async (userData: UserData) => {
    const response = await api.post('/admin/users', userData);
    return response.data;
  },
  
  updateUser: async (userId: number, userData: Partial<UserData>) => {
    const response = await api.put(`/admin/users/${userId}`, userData);
    return response.data;
  },
  
  deleteUser: async (userId: number) => {
    const response = await api.delete(`/admin/users/${userId}`);
    return response.data;
  },
  
  // Ranks Management
  getRanks: async () => {
    const response = await api.get('/admin/ranks');
    return response.data;
  },
  
  getRanksByDepartment: async (departmentId: number) => {
    const response = await api.get(`/admin/ranks/${departmentId}`);
    return response.data;
  },
  
  // Question Sets Management
  getQuestionSets: async () => {
    const response = await api.get('/admin/question-sets');
    return response.data;
  },

  getQuestions: async (setId: number) => {
    const response = await api.get(`/admin/question-sets/${setId}/questions`);
    return response.data;
  },
  
  createQuestionSet: async (data: { rank_id: number; set_name: string; description?: string; total_questions?: number; duration_minutes?: number; passing_percentage?: number }) => {
    const response = await api.post('/admin/question-sets', data);
    return response.data;
  },
  
  updateQuestionSet: async (setId: number, data: Partial<{ rank_id: number; set_name: string; description?: string; total_questions?: number; duration_minutes?: number; passing_percentage?: number; is_active: boolean }>) => {
    const response = await api.put(`/admin/question-sets/${setId}`, data);
    return response.data;
  },
  
  uploadQuestions: async (setId: number, questions: QuestionData[]) => {
    const response = await api.post(`/admin/question-sets/${setId}/questions`, { questions });
    return response.data;
  },

  uploadQuestionsFile: async (setId: number, file: File, answerSheet?: File, setNumber?: number) => {
    const formData = new FormData();
    formData.append('file', file);
    if (answerSheet) {
      formData.append('answerSheet', answerSheet);
    }

    const query = setNumber ? `?setNumber=${setNumber}` : '';
    const response = await api.post(`/admin/question-sets/${setId}/upload-file${query}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  uploadAnswerSheet: async (setId: number, answerSheet: File) => {
    const formData = new FormData();
    formData.append('answerSheet', answerSheet);
    
    const response = await api.post(`/admin/question-sets/${setId}/answers`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Multiple Question Sets Management
  getMultipleQuestionSets: async (setId: number) => {
    const response = await api.get(`/admin/question-sets/${setId}/multiple-sets`);
    return response.data;
  },

  uploadQuestionSet: async (setId: number, setNumber: number, questions: QuestionData[]) => {
    const response = await api.post(`/admin/question-sets/${setId}/upload-set/${setNumber}`, { questions });
    return response.data;
  },

  
  deleteQuestionSet: async (setId: number) => {
    const response = await api.delete(`/admin/question-sets/${setId}`);
    return response.data;
  },
  
  // Exam Sessions Management
  getExamSessions: async () => {
    const response = await api.get('/admin/exam-sessions');
    return response.data;
  },
  
  createExamSession: async (sessionData: ExamSessionData) => {
    const response = await api.post('/admin/exam-sessions', sessionData);
    return response.data;
  },

  updateExamSession: async (sessionId: number, sessionData: Partial<ExamSessionData>) => {
    const response = await api.put(`/admin/exam-sessions/${sessionId}`, sessionData);
    return response.data;
  },

  deleteExamSession: async (sessionId: number) => {
    const response = await api.delete(`/admin/exam-sessions/${sessionId}`);
    return response.data;
  },
  
  // Exam Results Management
  getExamResults: async () => {
    const response = await api.get('/admin/exam-results');
    return response.data;
  },
  
  getExamResultDetails: async (resultId: number) => {
    const response = await api.get(`/admin/exam-results/${resultId}/details`);
    return response.data;
  },
  
  publishResults: async (resultId: number, sendEmail: boolean = false) => {
    const response = await api.post(`/admin/exam-results/${resultId}/publish`, { send_email: sendEmail });
    return response.data;
  }
};

export default api;
