const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const log = require('./logger');
const treeKill = require('tree-kill');

let pty;
try {
  pty = require('@lydell/node-pty');
} catch (e) {
  try {
    pty = require('node-pty');
  } catch (e2) {
    log.error('Failed to load node-pty:', e2.message);
    pty = null;
  }
}

const ptys = new Map();
let nextId = 1;
let cachedShells = null;

/**
 * Return the default shell command for the current platform.
 * @returns {string} Shell executable path or name
 */
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

/**
 * Discover available shells on the current platform.
 * Results are cached after the first call.
 * @returns {Array<{id: string, name: string, command: string, args: string[], default: boolean}>} List of available shells
 */
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

/**
 * Spawn a new pseudo-terminal process.
 * @param {number} [cols=80] - Terminal column count
 * @param {number} [rows=24] - Terminal row count
 * @param {string} [shell] - Shell executable to spawn (defaults to platform default)
 * @param {string[]} [args] - Arguments to pass to the shell
 * @returns {{id: number, pid: number}|null} PTY identifier and process ID, or null on failure
 */
function createPty(cols = 80, rows = 24, shell, args) {
  if (!pty) {
    log.error('node-pty not available');
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
  log.info(`PTY created: id=${id}, pid=${ptyProcess.pid}, shell=${shellCmd}`);

  ptyProcess.onExit(({ exitCode, signal }) => {
    log.info(`PTY exited: id=${id}, pid=${ptyProcess.pid}, exitCode=${exitCode}, signal=${signal}`);
  });

  return { id, pid: ptyProcess.pid };
}

/**
 * Write data to a PTY's stdin.
 * @param {number} id - PTY identifier
 * @param {string} data - Data to write
 */
function writePty(id, data) {
  const p = ptys.get(id);
  if (p) p.write(data);
}

/**
 * Resize a PTY to new dimensions.
 * @param {number} id - PTY identifier
 * @param {number} cols - New column count
 * @param {number} rows - New row count
 */
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

/**
 * Destroy a PTY process and clean up its resources.
 * On Windows, uses tree-kill to terminate the entire process tree.
 * @param {number} id - PTY identifier
 * @returns {Promise<void>} Resolves when the process has been terminated
 */
function destroyPty(id) {
  const p = ptys.get(id);
  if (!p) return Promise.resolve();

  const pid = p.pid;
  ptys.delete(id);
  log.info(`PTY destroying: id=${id}, pid=${pid}`);

  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      treeKill(pid, 'SIGTERM', (err) => {
        if (err) {
          log.warn(`PTY tree-kill SIGTERM failed for pid=${pid}, retrying with SIGKILL:`, err.message);
          setTimeout(() => {
            treeKill(pid, 'SIGKILL', (err2) => {
              if (err2) {
                log.warn(`PTY tree-kill SIGKILL failed for pid=${pid}:`, err2.message);
              }
              resolve();
            });
          }, 2000);
        } else {
          resolve();
        }
      });
    } else {
      try {
        p.kill();
      } catch (e) {
        // Already dead
      }
      resolve();
    }
  });
}

/**
 * Get the raw node-pty process for a given PTY ID.
 * @param {number} id - PTY identifier
 * @returns {object|undefined} The node-pty process, or undefined if not found
 */
function getPty(id) {
  return ptys.get(id);
}

/**
 * Gracefully destroy all active PTY processes.
 * @returns {Promise<void>} Resolves when all processes have been terminated
 */
async function destroyAll() {
  const promises = [];
  for (const [id] of ptys) {
    promises.push(destroyPty(id));
  }
  await Promise.allSettled(promises);
}

/**
 * Synchronously force-kill all PTY processes. Used as a last-resort
 * cleanup during process exit when async operations are not possible.
 */
function forceKillAll() {
  for (const [id, p] of ptys) {
    try {
      p.kill();
    } catch (e) {
      // Ignore — last resort cleanup
    }
  }
  ptys.clear();
}

module.exports = { createPty, writePty, resizePty, destroyPty, getPty, destroyAll, getAvailableShells, forceKillAll };
