#!/usr/bin/env node
'use strict';

const { createServer } = require('../src/server');

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const port = portArg !== -1 ? parseInt(args[portArg + 1], 10) : 3000;

console.log('\n  DecisionHub — decision database for your projects');
console.log('  Data stored at: ' + require('os').homedir() + '/.decisionhub/\n');

createServer(port).then(() => {
  const open = require('child_process').exec;
  // Auto-open browser
  open(`open http://localhost:${port}`);
}).catch(err => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
