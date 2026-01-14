#!/usr/bin/env node
/**
 * MCP Server for Tamoxifen Tracker Logs
 * Allows Claude CLI to query operation logs
 * 
 * Install: claude mcp add --transport stdio tamoxifen-logs -- node src/mcp-logs-server.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const LOG_FILE = path.join(__dirname, '..', 'logs', 'devlog.jsonl');

// MCP Protocol implementation (simplified stdio)
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

function sendResponse(id, result) {
    const response = { jsonrpc: '2.0', id, result };
    process.stdout.write(JSON.stringify(response) + '\n');
}

function sendError(id, code, message) {
    const response = { jsonrpc: '2.0', id, error: { code, message } };
    process.stdout.write(JSON.stringify(response) + '\n');
}

// Read logs from file
function readLogs(options = {}) {
    if (!fs.existsSync(LOG_FILE)) {
        return [];
    }
    
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    let logs = content.trim().split('\n').filter(l => l).map(l => JSON.parse(l));
    
    if (options.level) {
        logs = logs.filter(l => l.level === options.level);
    }
    if (options.event) {
        logs = logs.filter(l => l.event === options.event);
    }
    if (options.last) {
        logs = logs.slice(-options.last);
    }
    
    return logs;
}

// Tool definitions
const tools = [
    {
        name: 'get_recent_logs',
        description: 'Get the most recent log entries from the tamoxifen tracker',
        inputSchema: {
            type: 'object',
            properties: {
                count: { type: 'number', description: 'Number of recent logs to return (default: 20)' },
                level: { type: 'string', description: 'Filter by level: INFO, WARN, ERROR' }
            }
        }
    },
    {
        name: 'get_errors',
        description: 'Get all error logs from the tamoxifen tracker',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'search_logs',
        description: 'Search logs by event name',
        inputSchema: {
            type: 'object',
            properties: {
                event: { type: 'string', description: 'Event name to search for' }
            },
            required: ['event']
        }
    }
];

// Handle MCP requests
rl.on('line', (line) => {
    try {
        const request = JSON.parse(line);
        const { id, method, params } = request;
        
        switch (method) {
            case 'initialize':
                sendResponse(id, {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'tamoxifen-logs', version: '1.0.0' }
                });
                break;
                
            case 'tools/list':
                sendResponse(id, { tools });
                break;
                
            case 'tools/call':
                const toolName = params.name;
                const args = params.arguments || {};
                
                let result;
                switch (toolName) {
                    case 'get_recent_logs':
                        result = readLogs({ last: args.count || 20, level: args.level });
                        break;
                    case 'get_errors':
                        result = readLogs({ level: 'ERROR' });
                        break;
                    case 'search_logs':
                        result = readLogs({ event: args.event });
                        break;
                    default:
                        sendError(id, -32601, `Unknown tool: ${toolName}`);
                        return;
                }
                
                sendResponse(id, {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                });
                break;
                
            case 'notifications/initialized':
                // Client acknowledged initialization, no response needed
                break;
                
            default:
                sendError(id, -32601, `Method not found: ${method}`);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
});
