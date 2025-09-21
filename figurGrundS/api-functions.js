/**
 * figurGrundS-specific API functions
 * Handles data fetching and processing for figurGrundS folder
 */

class FigurGrundSApi {
  constructor(apiService) {
    this.apiService = apiService;
  }

  /**
   * Fetch data specifically for figurGrundS
   */
  async fetchData() {
    const params = this.apiService.getUrlParams();
    
    if (!this.apiService.hasApiParams()) {
      console.warn('API parameters missing, using fallback data');
      return this.getFallbackData();
    }

    const cacheKey = `figurgrunds_${params.p_id}_${params.token}`;
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
        testResults = testData.fgs_TotalResult || null;
      } else {
        console.warn(`Test results API request failed with status ${testResponse.status}`);
      }

      const processedData = this.processData(data[0] || data, authData, testResults);

      this.apiService.cache.set(cacheKey, processedData);
      
      return processedData;
    } catch (error) {
      console.error('Error fetching figurGrundS data from API:', error);
      return this.getFallbackData();
    }
  }

  /**
   * Process API data for figurGrundS specifically
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
    let itemColors = {};
    
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
        const figurGrundThresholds = thresholds.filter(threshold => 
          threshold.category === "Figur Grund Sehen"
        );
        
        if (figurGrundThresholds.length >= 6) {
          // Sort by level to ensure we have levels 1-6
          const sortedThresholds = figurGrundThresholds.sort((a, b) => a.level - b.level);
          
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
          const score = testResults && testResults.fgs_score ? Number(testResults.fgs_score) : 0;
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
    
    // Extract item colors from testResults
    if (testResults && testResults.items && testResults.items.length > 0) {
      const greenColor = '#d5f5d5'; // The green color used in the grid
      const redColor = '#ffcccc';   // Light red color for false values
      const firstItem = testResults.items[0];
      
      // Map testResults fields to item colors
      itemColors = {
        kuh: firstItem.richtigKuh ? greenColor : (firstItem.richtigKuh === false ? redColor : ''),
        ente: firstItem.richtigEnte ? greenColor : (firstItem.richtigEnte === false ? redColor : ''),
        kreis: firstItem.richtigKreis ? greenColor : (firstItem.richtigKreis === false ? redColor : ''),
        dreieck: firstItem.richtigDreieck ? greenColor : (firstItem.richtigDreieck === false ? redColor : ''),
        auto: firstItem.richtigAuto ? greenColor : (firstItem.richtigAuto === false ? redColor : ''),
        haus: firstItem.richtigHaus ? greenColor : (firstItem.richtigHaus === false ? redColor : ''),
        baum: firstItem.richtigBaum ? greenColor : (firstItem.richtigBaum === false ? redColor : ''),
        lampe: firstItem.richtigLampe ? greenColor : (firstItem.richtigLampe === false ? redColor : '')
      };
    }

    
    return {
      // Basic user data - mapped from API
      name: `${apiData.Vorname || ''} ${apiData.Nachname || ''}`.trim() || '',
      lang: apiData.Familiensprache || '',
      birthdate: apiData.GeburtsDatum || '',
      age: this.apiService.calculateAge(apiData.GeburtsDatum) || '',
      since: apiData.InDEseit,
      date: new Date().toLocaleDateString('de-DE'),
      company: companyName,
      
      // Test results data from fgs_TotalResult
      testResults: testResults,
      
      // Performance data from thresholds
      min: min,
      max: max,
      score: testResults && testResults.fgs_score ? testResults.fgs_score : 0,
      
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
      subsplit: 'UNKNOWN',
      submin: min,
      submax: max,
      
      // Item colors from testResults
      ...itemColors
    };
  }

  /**
   * Get fallback data specifically for figurGrundS
   */
  getFallbackData() {
    return {
      name: '',
      lang: '',
      birthdate: '',
      age: '',
      since: '',
      date: new Date().toLocaleDateString('de-DE'),
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
      subsplit: 50,
      submin: 0,
      submax: 13,
      kuh: '',
      ente: '',
      kreis: '',
      dreieck: '',
      auto: '',
      haus: '',
      baum: '',
      lampe: ''
    };
  }
}

// Create global instance when this script loads
if (typeof window !== 'undefined' && window.edulogApi) {
  window.figurGrundSApi = new FigurGrundSApi(window.edulogApi);
}
