const log = require('electron-log/main');

// Initialize IPC forwarding so renderer processes can use electron-log/renderer
log.initialize();

// File transport: 5MB rotation
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}';

// Console transport
log.transports.console.format = '{h}:{i}:{s}.{ms} [{level}] {text}';

module.exports = log;
