const { spawn } = require('child_process');
const path = require('path');

// Start backend server
const backend = spawn('npm', ['start'], {
  cwd: path.join(__dirname, 'server'),
  stdio: 'inherit',
  shell: true
});

// Start frontend server after a short delay
setTimeout(() => {
  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('Stopping servers...');
    backend.kill('SIGINT');
    frontend.kill('SIGINT');
    process.exit(0);
  });
}, 3000); // Wait 3 seconds for backend to start

console.log('🚀 Starting Maritime CBT Platform...');
console.log('📡 Backend: http://localhost:3001');
console.log('🌐 Frontend: http://localhost:8081');
