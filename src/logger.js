/**
 * Simple logging system for Hypervelocity
 * Logs are queryable by the LLM to understand what happened
 * 
 * Format: JSON Lines (one JSON object per line)
 * Location: logs/devlog.jsonl
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'devlog.jsonl');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function writeLog(level, event, data) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        event,
        ...data
    };
    
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(LOG_FILE, line);
    
    // Also output to stderr for visibility (won't interfere with CLI output)
    if (process.env.DEBUG) {
        console.error(`[${level}] ${event}:`, JSON.stringify(data));
    }
}

module.exports = {
    info: (event, data) => writeLog('INFO', event, data),
    warn: (event, data) => writeLog('WARN', event, data),
    error: (event, data) => writeLog('ERROR', event, data),
    debug: (event, data) => writeLog('DEBUG', event, data),
    
    // Query logs - useful for LLM to understand history
    query: (options = {}) => {
        if (!fs.existsSync(LOG_FILE)) return [];
        
        const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n');
        let logs = lines.filter(l => l).map(l => JSON.parse(l));
        
        if (options.level) {
            logs = logs.filter(l => l.level === options.level);
        }
        if (options.event) {
            logs = logs.filter(l => l.event === options.event);
        }
        if (options.since) {
            const since = new Date(options.since);
            logs = logs.filter(l => new Date(l.timestamp) >= since);
        }
        if (options.last) {
            logs = logs.slice(-options.last);
        }
        
        return logs;
    },
    
    // Get recent logs (for LLM context)
    recent: (n = 20) => {
        return module.exports.query({ last: n });
    },
    
    // Clear logs
    clear: () => {
        if (fs.existsSync(LOG_FILE)) {
            fs.unlinkSync(LOG_FILE);
        }
    }
};
