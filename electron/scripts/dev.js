#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

// Get electron binary path
const electronPath = require('electron');
process.env.ELECTRON_EXEC_PATH = electronPath;

const electronViteBin = path.join(__dirname, '../../node_modules/electron-vite/bin/electron-vite.js');
const args = ['dev', ...process.argv.slice(2)];

console.log('Starting electron-vite with ELECTRON_EXEC_PATH:', electronPath);

const child = spawn(process.execPath, [electronViteBin, ...args], {
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  process.exit(code);
});

child.on('error', (err) => {
  console.error('Failed to start electron-vite:', err);
  process.exit(1);
});