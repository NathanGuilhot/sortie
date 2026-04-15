const path = require('path');
const fs = require('fs');
const electronModulePath = path.dirname(require.resolve('electron'));
console.log('electronModulePath:', electronModulePath);
const pathFile = path.join(electronModulePath, 'path.txt');
console.log('pathFile:', pathFile);
console.log('exists?', fs.existsSync(pathFile));
if (fs.existsSync(pathFile)) {
  const executablePath = fs.readFileSync(pathFile, 'utf-8');
  console.log('executablePath:', executablePath);
  console.log('length:', executablePath.length);
  const electronExecPath = path.join(electronModulePath, 'dist', executablePath);
  console.log('electronExecPath:', electronExecPath);
  console.log('exists?', fs.existsSync(electronExecPath));
}