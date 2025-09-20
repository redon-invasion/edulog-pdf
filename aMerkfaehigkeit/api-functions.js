/**
 * aMerkfaehigkeit-specific API functions
 * Handles data fetching and processing for aMerkfaehigkeit folder
 */

class AMerkfaehigkeitApi {
  constructor(apiService) {
    this.apiService = apiService;
  }

  /**
   * Fetch data specifically for aMerkfaehigkeit
   */
  async fetchData() {
    const params = this.apiService.getUrlParams();
    
    if (!this.apiService.hasApiParams()) {
      console.warn('API parameters missing, using fallback data');
      return this.getFallbackData();
    }

    const cacheKey = `amerkfaehigkeit_${params.p_id}_${params.token}`;
    if (this.apiService.cache.has(cacheKey)) {
      return this.apiService.cache.get(cacheKey);
    }

    try {
      // First authenticate to get basic data
      const authData = await this.apiService.authenticate();
      
      // Fetch basic data from view-all-data endpoint
      let apiUrl = `${this.apiService.baseUrl}/view-all-data?p_id=${encodeURIComponent(params.p_id)}`;
      
      // Ensure we have either einrichtung_id or privat_kunde_id
      if (authData.einrichtung && authData.einrichtung.id) {
        apiUrl += `&Einrichtung_id=${authData.einrichtung.id}`;
      } else if (authData.privat_kunde && authData.privat_kunde.id) {
        apiUrl += `&privat_kunde_id=${authData.privat_kunde.id}`;
      } else {
        throw new Error('Neither einrichtung_id nor privat_kunde_id available from authentication data');
      }
      
      const response = await fetch(apiUrl, {
        headers: {
          'TOKEN': params.token,
          'API-KEY': this.apiService.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      
      // Fetch test results from view-data endpoint
      const testResultsUrl = `${this.apiService.baseUrl}/view-data/${encodeURIComponent(params.p_id)}`;
      const testResponse = await fetch(testResultsUrl, {
        headers: {
          'TOKEN': params.token,
          'API-KEY': this.apiService.apiKey,
          'Content-Type': 'application/json'
        }
      });

      let testResults = null;
      if (testResponse.ok) {
        const testData = await testResponse.json();
        testResults = testData.spseq_TotalResult || null;
      } else {
        console.warn(`Test results API request failed with status ${testResponse.status}`);
      }

      const processedData = this.processData(data[0] || data, authData, testResults);

      this.apiService.cache.set(cacheKey, processedData);
      
      return processedData;
    } catch (error) {
      console.error('Error fetching aMerkfaehigkeit data from API:', error);
      return this.getFallbackData();
    }
  }

  /**
   * Process API data for aMerkfaehigkeit specifically
   */
  processData(apiData, authData = null, testResults = null) {
    // Determine company name based on auth data
    let companyName = '';
    if (authData) {
      if (authData.einrichtung && authData.einrichtung.name) {
        companyName = authData.einrichtung.name;
      } else if (authData.privat_kunde && authData.privat_kunde.name) {
        companyName = authData.privat_kunde.name;
      }
    }
    
    // Extract min and max from edulog_thresholds
    let min = 0;
    let max = 13;
    let colors = [];
    let ranges = [];
    let assessment = "";
    let cellColors = [];
    
    if (authData && authData.parameters) {
      // Extract colors from parameters.colors
      if (authData.parameters.colors) {
        if (Array.isArray(authData.parameters.colors)) {
          // If it's an array of objects, extract the 'color' property
          colors = authData.parameters.colors.map(colorObj => 
            typeof colorObj === 'object' && colorObj.color ? colorObj.color : colorObj
          );
        } else if (typeof authData.parameters.colors === 'string') {
          // If it's a string, split it
          colors = authData.parameters.colors.split(',').map(c => c.trim());
        }
      }
      
      // Extract min, max, ranges, and assessment from edulog_thresholds
      if (authData.parameters.edulog_thresholds) {
        const thresholds = authData.parameters.edulog_thresholds;
        const auditiveThresholds = thresholds.filter(threshold => 
          threshold.category === "Auditive Merkfähigkeit"
        );
        
        if (auditiveThresholds.length >= 6) {
          // Sort by level to ensure we have levels 1-6
          const sortedThresholds = auditiveThresholds.sort((a, b) => a.level - b.level);
          
          // Get min from level 1 and max from level 6
          const level1 = sortedThresholds.find(t => t.level === 1);
          const level6 = sortedThresholds.find(t => t.level === 6);
          
          if (level1 && level1.min !== undefined) {
            min = Number(level1.min);
          }
          if (level6 && level6.max !== undefined) {
            max = Number(level6.max);
          }
          
          // Build ranges from all 6 levels
          ranges = sortedThresholds.map(threshold => ({
            start: Number(threshold.min) || 0,
            end: Number(threshold.max) || 0
          }));
          
          // Find assessment based on score
          const score = testResults && testResults.spseq_score ? Number(testResults.spseq_score) : 0;
          const matchingThreshold = sortedThresholds.find(threshold => {
            const thresholdMin = Number(threshold.min) || 0;
            const thresholdMax = Number(threshold.max) || 0;
            return score >= thresholdMin && score <= thresholdMax;
          });
          
          if (matchingThreshold && matchingThreshold.description2) {
            assessment = matchingThreshold.description2;
          }
        }
      }
    }
    
    // Extract cell colors from testResults
    if (testResults && testResults.items && testResults.items.length > 0) {
      const greenColor = '#d5f5d5'; // The green color used in the grid
      const redColor = '#ffcccc';   // Light red color for false values
      const firstItem = testResults.items[0];
      
      // Map testResults fields to cell colors (c1 to c12)
      const cellMappings = [
        firstItem.identifikationOK,    // c1
        firstItem.items2ok,            // c2
        firstItem.items2_v1,           // c3
        firstItem.items2_v2,           // c4
        firstItem.vor,                 // c5
        firstItem.items3ok,            // c6
        firstItem.items3_v1,           // c7
        firstItem.items3_v2,           // c8
        null,                          // c9 (empty)
        firstItem.items4ok,            // c10
        firstItem.items4_v1,           // c11
        firstItem.items4_v2            // c12
      ];
      
      cellColors = cellMappings.map(value => {
        if (value === true) return greenColor;
        if (value === false) return redColor;
        return ''; // No color for null/undefined/empty
      });
    }

    
    return {
      // Basic user data - mapped from API
      name: `${apiData.Vorname || ''} ${apiData.Nachname || ''}`.trim() || '',
      lang: apiData.Familiensprache || '',
      birthdate: apiData.GeburtsDatum || '',
      age: this.apiService.calculateAge(apiData.GeburtsDatum) || '',
      since: apiData.InDEseit,
      date: new Date().toLocaleDateString('de-DE'),
      teacher: apiData.authuser_name || '',
      company: companyName,
      
      // Test results data from spseq_TotalResult
      testResults: testResults,
      
      // Performance data from thresholds
      min: min,
      max: max,
      score: testResults && testResults.spseq_score ? testResults.spseq_score : 0,
      
      // Colors and ranges from parameters
      colors: colors,
      ranges: ranges,
      
      // Assessment data from matching threshold
      assessment: assessment,
      
      // Labels - will be provided later
      label1: 'UNKNOWN',
      label2: 'UNKNOWN',
      label3: 'UNKNOWN',
      label4: 'UNKNOWN',
      
      // Sub-bar configuration - will be provided later
      subgray: 'UNKNOWN',
      subgreen: 'UNKNOWN',
      subsplit: 'UNKNOWN',
      submin: min,
      submax: max,
      
      // Grid data from testResults
      cellColors: cellColors
    };
  }

  /**
   * Get fallback data specifically for aMerkfaehigkeit
   */
  getFallbackData() {
    return {
      name: '',
      lang: '',
      birthdate: '',
      age: '',
      since: '',
      date: new Date().toLocaleDateString('de-DE'),
      teacher: '',
      company: '',
      testResults: null,
      min: 0,
      max: 13,
      score: 0,
      colors: [],
      ranges: [],
      assessment: '',
      label1: '',
      label2: '',
      label3: '',
      label4: '',
      subgray: '',
      subgreen: '',
      subsplit: 50,
      submin: 0,
      submax: 13,
      cellColors: []
    };
  }
}

// Create global instance when this script loads
if (typeof window !== 'undefined' && window.edulogApi) {
  window.aMerkfaehigkeitApi = new AMerkfaehigkeitApi(window.edulogApi);
}
