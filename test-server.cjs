const { spawn } = require('child_process');

const child = spawn('node', ['dist/server.cjs'], {
  stdio: 'pipe',
  env: process.env
});

child.stdout.on('data', data => console.log(`STDOUT: ${data}`));
child.stderr.on('data', data => console.error(`STDERR: ${data}`));

child.on('close', code => {
  console.log(`Server exited with code ${code}`);
});

setTimeout(() => {
  console.log('Sending kill signal...');
  child.kill();
}, 4000);
