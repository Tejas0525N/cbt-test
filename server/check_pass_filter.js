const fs = require('fs');
const path = require('path');
const base = path.join(__dirname, 'data');
const sessions = JSON.parse(fs.readFileSync(path.join(base, 'exam-sessions.json'), 'utf-8'));
const attempts = JSON.parse(fs.readFileSync(path.join(base, 'exam-attempts.json'), 'utf-8'));
const results = JSON.parse(fs.readFileSync(path.join(base, 'exam-results.json'), 'utf-8'));
const qsets = JSON.parse(fs.readFileSync(path.join(base, 'question-sets.json'), 'utf-8'));
const user = 6;
const userAttempts = attempts.filter(a => a.user_id === user);
const resultsBySession = {};
for (const attempt of userAttempts) {
  const session = sessions.find(s => s.id === attempt.exam_session_id);
  const matchingResults = results.filter(r => r.exam_attempt_id === attempt.id);
  const result = matchingResults.sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at)).pop();
  if (!resultsBySession[attempt.exam_session_id]) {
    let question_set_name = '';
    if (session) {
      const qobj = qsets.find(q => q.id === session.question_set_id);
      question_set_name = qobj ? qobj.set_name : '';
    }
    resultsBySession[attempt.exam_session_id] = {
      session_id: attempt.exam_session_id,
      question_set_id: session ? session.question_set_id : null,
      session_status: session ? session.status : 'scheduled',
      title: session ? session.title : '',
      set_name: question_set_name,
      attempts: []
    };
  }
  const attemptStatus = result ? 'submitted' : attempt.status;
  const attemptPassed = result ? result.passed : attempt.passed;
  resultsBySession[attempt.exam_session_id].attempts.push({
    attempt_number: attempt.attempt_number,
    status: attemptStatus,
    submitted_at: result ? result.submitted_at : attempt.submitted_at,
    passed: attemptPassed,
    percentage_score: result ? result.percentage_score : attempt.percentage_score,
    correct_answers: result ? result.correct_answers : (attempt.correct_answers || 0),
    total_questions: result ? result.total_questions : (attempt.total_questions || 0),
    next_attempt_available: attempt.next_attempt_available
  });
}
console.log('userResults:', JSON.stringify(Object.values(resultsBySession), null, 2));
const passedSets = new Set();
for (const result of Object.values(resultsBySession)) {
  if (result.attempts.some(a => a.passed)) {
    if (result.question_set_id != null) passedSets.add(result.question_set_id);
  }
}
console.log('passedSets:', Array.from(passedSets));
for (const session of sessions.filter(s => s.user_id === user)) {
  console.log('session', session.id, session.title, 'question_set_id', session.question_set_id, 'status', session.status, passedSets.has(session.question_set_id) ? 'hide' : 'keep');
}
