const cp = require('child_process');
try {
  console.log(cp.execSync('git show HEAD:src/App.tsx').toString().substring(1900, 2500));
} catch(e) {
  console.log("Error", e.message);
}
