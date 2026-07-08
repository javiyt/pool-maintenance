const express = require('express');

// Create Express application instance
const app = express();

// Define port number for the server to listen on
const PORT = 3000;

// Middleware configuration block: Handle incoming JSON payloads from REST API requests
app.use(express.json());

// Middleware configuration block: Serve static frontend files from public directory
app.use('/static', express.static('public'));

// Health check endpoint: Returns status information for health monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root route: Return application name and version information
app.get('/', (req, res) => {
  res.json({
    message: 'Pool Maintenance API Server is running',
    version: '1.0.0',
    documentation: 'https://docs.expressjs.com'
  });
});

// All other routes not explicitly defined: Handle undefined route requests with appropriate response
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', message: `Route ${req.path} not found` });
});

// Start server block: Launch HTTP server on specified host and port
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running!`);
  console.log(`Host:   0.0.0.0 (accessible from local network)`);
  console.log(`Port:   ${PORT}`);
  console.log(`Static files are served from public/ directory`);
  console.log('Press Ctrl+C to stop the server\n');
});
