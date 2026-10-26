import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const code = error.response.data?.code;
      if (code === 'TOKEN_EXPIRED' || code === 'INVALID_TOKEN') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ── Admin APIs ────────────────────────────────────────────
export const adminApi = {
  login: (data) => api.post('/admin/login', data),
  getApprovedEmails: () => api.get('/admin/approved-teacher-emails'),
  addApprovedEmail: (data) => api.post('/admin/approved-teacher-emails', data),
  deleteApprovedEmail: (id) => api.delete(`/admin/approved-teacher-emails/${id}`),
  uploadCSV: (formData) => api.post('/admin/approved-teacher-emails/csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getPendingTeachers: (status = 'PENDING') => api.get(`/admin/teachers/pending?status=${status}`),
  approveTeacher: (id, data) => api.post(`/admin/teachers/${id}/approve`, data),
  rejectTeacher: (id) => api.post(`/admin/teachers/${id}/reject`),
  approveFaculty: (id) => api.patch(`/admin/faculty/${id}/approve`),
  rejectFaculty: (id) => api.patch(`/admin/faculty/${id}/reject`),
  addAssignment: (teacherId, data) => api.post(`/admin/teachers/${teacherId}/assignments`, data),
  removeAssignment: (teacherId, assignmentId) => api.delete(`/admin/teachers/${teacherId}/assignments/${assignmentId}`),
  getAcademicYears: () => api.get('/admin/academic-years'),
  getClasses: (yearId) => api.get(`/admin/classes${yearId ? `?academic_year_id=${yearId}` : ''}`),
  getDivisions: (classId) => api.get(`/admin/divisions${classId ? `?class_id=${classId}` : ''}`),
  getSubjects: () => api.get('/admin/subjects'),
  getDepartments: () => api.get('/admin/departments'),
  updateFacultyDepartment: (id, data) => api.patch(`/admin/faculty/${id}/department`, data),
  updateFacultyStatus: (id, data) => api.patch(`/admin/faculty/${id}/status`, data),
};

// ── Auth APIs ─────────────────────────────────────────────
export const authApi = {
  checkEmail: (data) => api.post('/auth/teacher/check-email', data),
  sendOTP: (data) => api.post('/auth/send-otp', data),
  verifyOTP: (data) => api.post('/auth/verify-otp', data),
  registerTeacher: (data, config = {}) => api.post('/auth/register/teacher', data, config),
  loginWithCode: (data) => api.post('/auth/login/code', data),
  logout: () => api.post('/auth/logout'),
  recoverySendOTP: (data) => api.post('/auth/recovery/send-otp', data),
  recoveryVerifyOTP: (data) => api.post('/auth/recovery/verify-otp', data),
  resetLoginCode: (data) => api.post('/auth/recovery/reset-login-code', data),
};

// ── Teacher APIs ──────────────────────────────────────────
export const teacherApi = {
  getProfile: () => api.get('/teacher/profile'),
  updateProfile: (data) => api.put('/teacher/profile', data),
  getAssignments: () => api.get('/teacher/assignments'),
};

// ── Attendance APIs ───────────────────────────────────────
export const attendanceApi = {
  createSession: (data) => api.post('/attendance/sessions', data),
  getSessions: () => api.get('/attendance/sessions'),
  getSession: (id) => api.get(`/attendance/sessions/${id}`),
  getCurrentQR: (id) => api.get(`/attendance/sessions/${id}/current-qr`),
  closeSession: (id) => api.post(`/attendance/sessions/${id}/close`),
};
