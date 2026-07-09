/**
 * Pool Maintenance Water Chemistry Controller
 * Handles water quality measurements and chemical recommendations
 * All logic is in English for maximum clarity and maintainability
 */

(function() {
  'use strict';

  // ============================================
  // DOM Element References
  // ============================================

  const formElement = document.getElementById('waterForm');
  const resultsContent = document.getElementById('resultsContent');
  const resultsTitle = resultsContent.querySelector('.results-title h4');

  // Input field references by their data-input attributes and IDs
  const inputs = {
    ph: document.getElementById('ph'),
    ec: document.getElementById('ec'),
    tds: document.getElementById('tds'),
    salt: document.getElementById('salt'),
    orp: document.getElementById('orp'),
    fac: document.getElementById('fac'),
    temperature: document.getElementById('temperature')
  };

  // ============================================
  // Utility Functions
  // ============================================

  /**
   * Extract numerical values from all input fields
   * Returns an object containing parsed numeric inputs
   */
  function extractMeasurements() {
    const measurements = {};

    Object.keys(inputs).forEach(function(key) {
      const field = inputs[key];
      if (field && field.value !== '') {
        // Attempt to parse as number, return as stored string type
        try {
          measurements[key] = parseFloat(field.value);
        } catch(e) {
          // Handle parsing errors gracefully by preserving original value
          measurements[key] = field.value;
        }
      } else if (field) {
        measurements[key] = field.validity ? 'valid' : '';
      }
    });

    return measurements;
  }

  /**
   * Generate a fresh ISO timestamp string for logging
   * Returns a string like "2026-07-09T14:30:00.000Z"
   */
  function generateTimestamp() {
    const now = new Date();
    return now.toISOString();
  }

  /**
   * Dynamically inject text content into the results area
   * Parameters:
   *   - htmlString: The content to display
   *   - container: Optional alternate container element
   */
  function injectResults(htmlString, container) {
    if (container) {
      container.innerHTML = htmlString;
    } else {
      resultsContent.innerHTML = htmlString;
    }
  }

  /**
   * Update the results title with provided dosage information
   * Parameters:
   *   - dosage: Primary dosage recommendation text
   *   - guidelines: Textual chemical usage guidelines
   */
  function updateDosageInfo(dosage, guidelines) {
    if (dosage) {
      resultsTitle.textContent = 'Chemical Recommendations | Dosage: ' + dosage;
    } else {
      resultsTitle.textContent = 'Chemical Recommendations';
    }

    if (guidelines) {
      injectResults(guidelines);
    }
  }

  /**
   * Create a critical warning alert for emergencies
   * Returns a bootstrap alert element with red styling for visibility
   */
  function createEmergencyAlert(message) {
    // Red alert class for critical warnings (emergency response level)
    return '<div class="alert alert-danger border-0 shadow-sm" style="font-weight: 700;">' +
             message + '</div>';
  }

  /**
   * Create a success notification for good water quality
   */
  function createSuccessAlert(message) {
    return '<div class="alert alert-success border-0 shadow-sm">' + message + '</div>';
  }

  /**
   * Create a standard recommendation display section
   * Parameters:
   *   - title: Section heading
   *   - content: Recommendation details
   */
  function createRecommendationSection(title, content) {
    return '<div class="mb-3 border-bottom pb-2">' +
      '<h6 class="fw-bold mb-1" style="color: #212529;">' + title + '</h6>' +
      '<div class="text-muted">' + content + '</div>' +
    '</div>';
  }

  // ============================================
  // Event Handlers
  // ============================================

  /**
   * Handle form submission event
   * Intercepts the submit action and processes measurements
   */
  function handleFormSubmit(event) {
    // Prevent default form submission behavior to intercept the operation
    event.preventDefault();
    event.stopPropagation();

    // Validate that all required fields are filled
    if (!formElement.checkValidity()) {
      formElement.reportValidity();
      return;
    }

    // Extract numerical values from input fields
    const extractedData = extractMeasurements();

    // Inject current ISO timestamp for this measurement record
    const timestamp = generateTimestamp();

    // Build the complete data payload to send
    const requestBody = {
      type: 'water_measurements',
      measurements: extractedData,
      timestamp: timestamp,
      version: '1.0'
    };

    /**
     * Send POST request to server for chemical analysis
     * Parameters:
     *   - data: Measurement payload object
     *   - onSuccess: Callback function with recommendations response
     */
    function sendAnalysisRequest(data) {
      fetch('/api/measures', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
      })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Server returned error status code: ' + response.status);
        }

        return response.json(); // Parse the recommendations payload
      })
      .then(function(recommendations) {
        // Handle server-side recommendations based on their type
        processRecommendations(recommendations, timestamp);
      })
      .catch(function(error) {
        console.error('Analysis request failed:', error);
        displayError(error.message + ' - Please check your connection and try again.');
      });
    }

    // Launch the fetch() POST request to /api/measures endpoint
    sendAnalysisRequest(requestBody);
  }

  /**
   * Process received recommendations from server response
   * Parameters:
   *   - recommendations: JSON object returned from server
   *   - timestamp: The measurement timestamp used for context
   */
  function processRecommendations(recommendations, timestamp) {
    // Extract and categorize the data by type

    let dosageInfo = '';
    let textGuidelines = '';
    const hasWarning = false; // Placeholder flag from server response

    /**
     * Check for critical pH warning condition or sanitary emergency
     * Applies bold red styling if either is present
     */
    function checkCriticalCondition(conditionType, message) {
      hasWarning = true;

      // Conditional logic to handle different emergency scenarios:
      // - "sanitary": Indicates health risk requiring immediate action
      // - "critical_ph": Indicates pH outside safe range 6.5-7.5
      return createEmergencyAlert(message);
    }

    /**
     * Handle the case where server returns empty or undefined data
     */
    function handleEmptyResponse() {
      textGuidelines = 'No recommendations available yet. Please enter measurements and recalculate.';
      return;
    }

    // ============================================
    // Server Response Processing Blocks
    // ============================================

    /**
     * Check for critical pH warning first (highest priority)
     * Critical pH ranges outside safe swimming thresholds: 6.5 to 7.5
     */
    if (recommendations && recommendations.critical_warning) {
      const warningMessage = 'CRITICAL ALERT: Pool water quality poses immediate risk! ' +
                            recommendations.message || 'pH levels outside safe range. Take maintenance action immediately.';
      
      // Create emergency alert for safety concerns
      textGuidelines = checkCriticalCondition('critical_ph', warningMessage);

      // Add secondary diagnostic section after warning
      if (recommendations.ph_values) {
        textGuidelines += '<hr class="my-3"><p style="font-size: 0.9rem;">' +
                          recommendations.ph_details || 'pH values recorded during this measurement session.';
      }
    }

    /**
     * Check for sanitary emergency conditions
     * Returns red alert styling for severe health warnings
     */
    if (recommendations && recommendations.emergency) {
      const warningMessage = 'SANITARY EMERGENCY: Immediate action required! ' +
                           recommendations.message || 'Water contains hazardous contaminants.';

      textGuidelines = checkCriticalCondition('sanitary', warningMessage);
    }

    /**
     * Process standard recommendations from server
     */
    if (recommendations && recommendations.chemical_dosages) {
      // Extract dosage figures - numerical chemical requirements for users

      const dosages = recommendations.chemical_dosages;
      let mainDosageText = '';

      // Loop through each chemical type and format dosage values:
      Object.keys(dosages).forEach(function(chemicalName) {
        const unitValue = dosages[chemicalName][0];
        const usageNote = dosages[chemicalName][1] || 'Adjust as needed.';

        if (unitValue !== null && unitValue > 0) {
          // Append dosage with appropriate units for clarity:
          mainDosageText += chemicalName + ' | ' + unitValue + ' ' + formatUnit(unitValue) + ' - Note: ' + usageNote + '\n';
        } else {
          mainDosageText += chemicalName + ' | Not required - Water quality acceptable' + '\n';
        }

        // Format the unit letter based on numeric value thresholds:
        function formatUnit(value) {
          const units = ['', 'mg/L', 'ppt', 'ppm', 'pH Units'];
          
          if (value < 10) return units[2];
          else if (value < 100) return units[1];
          else return units[0];
        }
      });

      // Convert to clean display string:
      dosageInfo = mainDosageText.trim().replace(/\n/g, ' | ');
    }

    /**
     * Process textual guidelines and recommendations
     */
    if (recommendations && recommendations.guidelines) {
      textGuidelines += '<div class="mt-2 pt-3">' + recommendations.guidelines;
    } else {
      textGuidelines += 'General recommendations based on measurements recorded at: <strong>' + timestamp + '</strong>';
    }

    /**
     * Update the display content with all processed values
     */
    function updateDisplay() {
      // Inject formatted dosage figures into results title
      updateDosageInfo(dosageInfo, textGuidelines);

      // If an emergency warning exists, add it separately
      if (hasWarning) {
        const finalMessage = recommendEmergencyAlerts();
        injectResults(finalMessage);
      }
    }

    /**
     * Generate comprehensive alert message from server warnings
     */
    function recommendEmergencyAlerts() {
      let alertsMessages = '';

      // Loop over each warning type flagged by server:
      if (hasWarning) {
        // Handle emergency-level warning messages:
        const primaryMessage = recommendations.critical_warning && recommendations.critical_warning.message ? 
                               recommendations.critical_warning.message : 'Immediate action required - critical pH or sanitary condition detected.';

        alertsMessages += createEmergencyAlert(primaryMessage);
      } else if (recommendations.warning) {
        // Handle standard warning-level alert:
        const message = recommendations.warning.message || 'Take recommended maintenance action to maintain water quality.';
        alertsMessages += createSuccessAlert(message);
      } else {
        // Default success alert for normal operation:
        const message = 'Water quality acceptable. Continue regular maintenance schedule.';
        alertsMessages += createSuccessAlert(message);
      }

      return alertsMessages;
    }

    /**
     * Final update display with all processed content
     */
    function finishUpdate() {
      // Apply any critical warning styling if emergency detected
      const warningDisplay = hasWarning ? createEmergencyAlert('CRITICAL: ' + (recommendations.critical_warning && recommendations.critical_warning.message || '')) : '';

      if (warningDisplay) {
        injectResults(warningDisplay);
        injectResults(textGuidelines);
      } else {
        injectResults(createSuccessAlert(recommendations.warning && recommendations.warning.message ? recommendations.warning.message : 'Water quality in good range. Continue regular maintenance.'));

        // Inject standard guidelines with proper formatting:
        if (textGuidelines) {
          textGuidelines = textGuidelines.replace(/\n/g, '<br>');
          injectResults(textGuidelines);
        }
      }
    }

    /**
     * Finalize and apply the display updates
     */
    finishUpdate();
  }

  /**
   * Show inline error message to user
   */
  function displayError(message) {
    injectResults('<div class="alert alert-danger border-0 shadow-sm">' + message + '</div>');
  }

  // ============================================
  // Global Event Listener Registration
  // ============================================

  /**
   * Wire up the submit event listener to handle form submissions
   * This intercepts the form submit action from Prompt 5
   */
  if (formElement) {
    formElement.addEventListener('submit', handleFormSubmit, false);
  }

})();