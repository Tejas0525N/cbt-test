import json
import os
base = os.path.join('server', 'data')
with open(os.path.join(base, 'exam-sessions.json'), 'r', encoding='utf-8') as f:
    sessions = json.load(f)
with open(os.path.join(base, 'exam-attempts.json'), 'r', encoding='utf-8') as f:
    attempts = json.load(f)
with open(os.path.join(base, 'exam-results.json'), 'r', encoding='utf-8') as f:
    results = json.load(f)
with open(os.path.join(base, 'question-sets.json'), 'r', encoding='utf-8') as f:
    qsets = json.load(f)
user = 6
userAttempts = [a for a in attempts if a['user_id'] == user]
resultsBySession = {}
for attempt in userAttempts:
    session = next((s for s in sessions if s['id'] == attempt['exam_session_id']), None)
    result = next((r for r in results if r['exam_attempt_id'] == attempt['id']), None)
    if attempt['exam_session_id'] not in resultsBySession:
        question_set_name = ''
        if session:
            qobj = next((q for q in qsets if q['id'] == session['question_set_id']), None)
            question_set_name = qobj['set_name'] if qobj else ''
        resultsBySession[attempt['exam_session_id']] = {
            'session_id': attempt['exam_session_id'],
            'question_set_id': session.get('question_set_id') if session else None,
            'session_status': session.get('status') if session else 'scheduled',
            'title': session.get('title', '') if session else '',
            'set_name': question_set_name,
            'attempts': []
        }
    attemptStatus = 'submitted' if result else attempt['status']
    attemptPassed = result['passed'] if result else attempt['passed']
    resultsBySession[attempt['exam_session_id']]['attempts'].append({
        'attempt_number': attempt['attempt_number'],
        'status': attemptStatus,
        'submitted_at': result.get('submitted_at') if result else attempt.get('submitted_at'),
        'passed': attemptPassed,
        'percentage_score': result.get('percentage_score') if result else attempt.get('percentage_score'),
        'correct_answers': result.get('correct_answers', 0) if result else attempt.get('correct_answers', 0),
        'total_questions': result.get('total_questions', 0) if result else attempt.get('total_questions', 0),
        'next_attempt_available': attempt.get('next_attempt_available')
    })
print('userResults:', json.dumps(list(resultsBySession.values()), indent=2))
passedSets = set()
for result in resultsBySession.values():
    if any(a['passed'] for a in result['attempts']):
        if result['question_set_id'] is not None:
            passedSets.add(result['question_set_id'])
print('passedSets:', passedSets)
for session in [s for s in sessions if s['user_id'] == user]:
    print('session', session['id'], session['title'], 'question_set_id', session['question_set_id'], 'status', session['status'], 'hide' if session['question_set_id'] in passedSets else 'keep')
