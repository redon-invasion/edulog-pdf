/**
 * mZeichnen-specific API functions
 * Handles data fetching and processing for mZeichnen folder
 */

class MZeichnenApi {
  constructor(apiService) {
    this.apiService = apiService;
  }

  /**
   * Fetch data specifically for mZeichnen
   */
  async fetchData() {
    const params = this.apiService.getUrlParams();
    
    if (!this.apiService.hasApiParams()) {
      console.warn('API parameters missing, using fallback data');
      return this.getFallbackData();
    }

    const cacheKey = `mzeichnen_${params.p_id}_${params.token}`;
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
        testResults = testData.mz_TotalResult || null;
      } else {
        console.warn(`Test results API request failed with status ${testResponse.status}`);
      }

      const processedData = this.processData(data[0] || data, authData, testResults);

      this.apiService.cache.set(cacheKey, processedData);
      
      return processedData;
    } catch (error) {
      console.error('Error fetching mZeichnen data from API:', error);
      return this.getFallbackData();
    }
  }

  /**
   * Process API data for mZeichnen specifically
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
        const mZeichnenThresholds = thresholds.filter(threshold => 
          threshold.category === "Mensch Zeichnen"
        );
        
        if (mZeichnenThresholds.length >= 6) {
          // Sort by level to ensure we have levels 1-6
          const sortedThresholds = mZeichnenThresholds.sort((a, b) => a.level - b.level);
          
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
          const score = testResults && testResults.mz_score ? Number(testResults.mz_score) : 0;
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

    
    return {
      // Basic user data - mapped from API
      name: `${apiData.Vorname || ''} ${apiData.Nachname || ''}`.trim() || '',
      lang: apiData.Familiensprache || '',
      birthdate: apiData.GeburtsDatum || '',
      age: this.apiService.calculateAge(apiData.GeburtsDatum) || '',
      since: apiData.InDEseit,
      date: new Date().toLocaleDateString('de-DE'),
      company: companyName,
      
      // Test results data from mz_TotalResult
      testResults: testResults,
      
      // Performance data from thresholds
      min: min,
      max: max,
      score: testResults && testResults.mz_score ? testResults.mz_score : 0,
      
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
      submax: max
    };
  }

  /**
   * Get fallback data specifically for mZeichnen
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
      submax: 13
    };
  }
}

// Create global instance when this script loads
if (typeof window !== 'undefined' && window.edulogApi) {
  window.mZeichnenApi = new MZeichnenApi(window.edulogApi);
}
