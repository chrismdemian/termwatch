const os = require('os');
const path = require('path');

let pty;
try {
  pty = require('@lydell/node-pty');
} catch (e) {
  try {
    pty = require('node-pty');
  } catch (e2) {
    console.error('Failed to load node-pty:', e2.message);
    pty = null;
  }
}

const ptys = new Map();
let nextId = 1;

function getDefaultShell() {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || '/bin/zsh';
}

function createPty(cols = 80, rows = 24) {
  if (!pty) {
    console.error('node-pty not available');
    return null;
  }

  const id = nextId++;
  const shell = getDefaultShell();
  const homeDir = os.homedir();

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: homeDir,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  ptys.set(id, ptyProcess);
  return { id, pid: ptyProcess.pid };
}

function writePty(id, data) {
  const p = ptys.get(id);
  if (p) p.write(data);
}

function resizePty(id, cols, rows) {
  const p = ptys.get(id);
  if (p) {
    try {
      p.resize(cols, rows);
    } catch (e) {
      // Ignore resize errors on dead processes
    }
  }
}

function destroyPty(id) {
  const p = ptys.get(id);
  if (p) {
    try {
      p.kill();
    } catch (e) {
      // Already dead
    }
    ptys.delete(id);
  }
}

function getPty(id) {
  return ptys.get(id);
}

function destroyAll() {
  for (const [id, p] of ptys) {
    try {
      p.kill();
    } catch (e) {
      // Ignore
    }
  }
  ptys.clear();
}

module.exports = { createPty, writePty, resizePty, destroyPty, getPty, destroyAll };
