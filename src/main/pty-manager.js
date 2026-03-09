const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');
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
let cachedShells = null;

function getDefaultShell() {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || '/bin/zsh';
}

function _existsOnPath(cmd) {
  try {
    execFileSync('where', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getAvailableShells() {
  if (cachedShells) return cachedShells;

  const shells = [];
  const platform = process.platform;

  if (platform === 'win32') {
    // PowerShell 7 (pwsh.exe)
    if (_existsOnPath('pwsh.exe')) {
      shells.push({ id: 'pwsh', name: 'PowerShell 7', command: 'pwsh.exe', args: [] });
    }

    // Windows PowerShell (always present)
    shells.push({ id: 'powershell', name: 'Windows PowerShell', command: 'powershell.exe', args: [] });

    // Command Prompt
    shells.push({ id: 'cmd', name: 'Command Prompt', command: 'cmd.exe', args: [] });

    // Git Bash
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ];
    for (const p of gitBashPaths) {
      if (fs.existsSync(p)) {
        shells.push({ id: 'gitbash', name: 'Git Bash', command: p, args: ['--login', '-i'] });
        break;
      }
    }

    // WSL
    if (_existsOnPath('wsl.exe')) {
      shells.push({ id: 'wsl', name: 'WSL', command: 'wsl.exe', args: [] });
    }
  } else if (platform === 'darwin') {
    if (fs.existsSync('/bin/zsh')) {
      shells.push({ id: 'zsh', name: 'zsh', command: '/bin/zsh', args: [] });
    }
    if (fs.existsSync('/bin/bash')) {
      shells.push({ id: 'bash', name: 'bash', command: '/bin/bash', args: [] });
    }
    // Fish — Homebrew Intel or Apple Silicon
    const fishPaths = ['/opt/homebrew/bin/fish', '/usr/local/bin/fish'];
    for (const p of fishPaths) {
      if (fs.existsSync(p)) {
        shells.push({ id: 'fish', name: 'fish', command: p, args: [] });
        break;
      }
    }
    if (fs.existsSync('/bin/sh')) {
      shells.push({ id: 'sh', name: 'sh', command: '/bin/sh', args: [] });
    }
  } else {
    // Linux
    const bashPaths = ['/bin/bash', '/usr/bin/bash'];
    for (const p of bashPaths) {
      if (fs.existsSync(p)) {
        shells.push({ id: 'bash', name: 'bash', command: p, args: [] });
        break;
      }
    }
    const zshPaths = ['/bin/zsh', '/usr/bin/zsh'];
    for (const p of zshPaths) {
      if (fs.existsSync(p)) {
        shells.push({ id: 'zsh', name: 'zsh', command: p, args: [] });
        break;
      }
    }
    if (fs.existsSync('/usr/bin/fish')) {
      shells.push({ id: 'fish', name: 'fish', command: '/usr/bin/fish', args: [] });
    }
    if (fs.existsSync('/bin/sh')) {
      shells.push({ id: 'sh', name: 'sh', command: '/bin/sh', args: [] });
    }
  }

  // Mark the default shell
  const defaultCmd = getDefaultShell();
  for (const s of shells) {
    s.default = (s.command === defaultCmd || s.command.endsWith('\\' + defaultCmd) || s.command.endsWith('/' + defaultCmd));
  }
  // If nothing got marked as default, mark the first one
  if (shells.length > 0 && !shells.some(s => s.default)) {
    shells[0].default = true;
  }

  cachedShells = shells;
  return shells;
}

function createPty(cols = 80, rows = 24, shell, args) {
  if (!pty) {
    console.error('node-pty not available');
    return null;
  }

  const id = nextId++;
  const shellCmd = shell || getDefaultShell();
  const shellArgs = args || [];
  const homeDir = os.homedir();

  const ptyProcess = pty.spawn(shellCmd, shellArgs, {
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

module.exports = { createPty, writePty, resizePty, destroyPty, getPty, destroyAll, getAvailableShells };
