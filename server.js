const express = require('express');
const calculateChemicals = require('./algorithm.js');

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

// Historical data file path configuration
const HISTORY_FILE_PATH = './historical.json';

// Error handling function for logging errors in English
function logError(message, errorDetails) {
  console.error(`[ERROR] ${message}`);
  if (errorDetails) {
    console.error(`[ERROR DETAIL]:`, errorDetails);
   }
}

// Message logging function for informational messages
function logMessage(message, details) {
  console.log(`[INFO] ${message}`);
  if (details) {
    console.log(`[DETAILS]:`, details);
   }
}

// All other routes not explicitly defined: Handle undefined route requests with appropriate response
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.path} not found`
   });
});

// GET /api/measures endpoint: Stream full historical measurements array to client
app.get('/api/measures', (req, res) => {
  const fs = require('fs/promises');

  try {
    // Read the entire historical data file
    if (!require('fs').existsSync(HISTORY_FILE_PATH)) {
      return res.status(200).json({
        status: 'success',
        data: []
      });
    }

    const historyData = fs.readFile(HISTORY_FILE_PATH, 'utf-8')
      .then(data => {
        try {
          if (!Array.isArray(JSON.parse(data))) {
            logError('History file is not an array', { filePath: HISTORY_FILE_PATH });
            return [];
          }
          return JSON.parse(data);
        } catch (parseError) {
          logError('Failed to parse history file as JSON', { errorDetails: parseError.message });
          return [];
        }
      });

    res.status(200).json({
      status: 'success',
      data: historyData
    });
  } catch (error) {
    logError('Failed to read historical measurements', { errorDetails: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve historical measurements'
    });
  }
});

// POST /api/measures route handler: Accept water measurements, calculate chemicals, and persist to history file
app.post('/api/measures', (req, res) => {
  const incomingData = req.body;

   // Check if request body is valid
  if (!incomingData || typeof incomingData !== 'object') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Request body must be a JSON object',
      expectedFields: ['date', 'ph', 'ec', 'tds', 'salt', 'orp', 'fac', 'temperature']
     });
   }

   // Define required fields with descriptions in English
  const requiredFields = {
    date: { type: 'string', description: 'Date of measurement' },
    ph: { type: 'number', description: 'pH level' },
    ec: { type: 'number', description: 'Conductivity (EC)' },
    tds: { type: 'number', description: 'Total Dissolved Solids' },
    salt: { type: 'number', description: 'Salt concentration' },
    orp: { type: 'number', description: 'Oxidation-Reduction Potential' },
    fac: { type: 'number', description: 'Free Available Chlorine' },
    temperature: { type: 'number', description: 'Water temperature' }
   };

   // Check which required fields are missing
  const availableFields = Object.keys(incomingData);
  const missingFields = [];

  for (const field in requiredFields) {
    if (!(field in incomingData)) {
      missingFields.push(field);
     }
   }

  if (missingFields.length > 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Missing required fields: ${missingFields.join(', ')}`,
      expectedFields: Object.keys(requiredFields)
     });
   }

   // Initialize history file as empty array if it does not exist
  let historyData = [];

  try {
    const fs = require('fs/promises');

    if (require('fs').existsSync(HISTORY_FILE_PATH)) {
      historyData = fs.readFile(HISTORY_FILE_PATH, 'utf-8')
         .then(data => {
          if (!Array.isArray(JSON.parse(data))) {
            logError('History file exists but is not an array', { filePath: HISTORY_FILE_PATH });
            return [];
           }
          return JSON.parse(data);
         });
       } else {
        // File does not exist: initialize as empty array automatically
       logMessage('Starting new measurement history file at ' + HISTORY_FILE_PATH);
       historyData = [];
       }
    } catch (error) {
    if (require('fs').constants && require('fs').constants.existsSync(HISTORY_FILE_PATH)) {
        // Error code indicates file exists but failed to read: treat as initialization scenario
       logError('Could not read history file', { filePath: HISTORY_FILE_PATH, errorDetails: error.message });
       historyData = [];
       } else {
        // File does not exist: treat as initialization scenario
       logMessage('History file was not found, initializing new empty array');
       }
    }

   // Ensure historyData is an array
  if (!Array.isArray(historyData)) {
    logError('History data is not an array', { actualType: typeof historyData });
    historyData = [];
    }

    // Append the incoming measure object to the history array
  const newMeasure = Object.assign({}, incomingData);

  try {
      // Update the array with new measure record using fs/promises module
    historyData.push(newMeasure);

      // Write updated array back to file as formatted JSON
    const jsonContent = JSON.stringify(historyData, null, 2);
    fs.writeFile(HISTORY_FILE_PATH, jsonContent, 'utf-8').then(() => {
      logMessage('Measure saved successfully', { recordCount: historyData.length });
      }).catch(error => {
      throw error;
      });

      // Pass incoming data and hardcoded volume of 3000 liters to algorithm for chemical calculation
    const chemicalRecommendations = calculateChemicals(newMeasure, 3000);

    return res.status(201).json({
      message: 'Measure recorded successfully',
      storageStatus: 'success',
      dataCount: historyData.length,
      fieldsCaptured: Object.keys(newMeasure),
      chemicalRecommendations: chemicalRecommendations
      });
    } catch (error) {
    logError('Failed to save measure record and calculate chemicals', { errorDetails: error.message });
    }
});

// Error handling middleware: Handle all server-side errors with standardized response format
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  logError(`Server error occurred`, err);
  res.status(statusCode).json({
    error: 'Internal Server Error',
    message: message,
    statusCode: statusCode
   });
});

// Start server block: Launch HTTP server on specified host and port
app.listen(PORT, '0.0.0.0', () => {
  logMessage('Server started successfully');
  console.log(`Server is running!`);
  console.log(`Host:     0.0.0.0 (accessible from local network)`);
  console.log(`Port:     ${PORT}`);
  console.log(`Static files are served from public/ directory`);
  console.log('Press Ctrl+C to stop the server\n');
});
