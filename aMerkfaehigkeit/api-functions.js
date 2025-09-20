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
      
      // Now fetch the specific data with correct URL construction
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
      console.log('aMerkfaehigkeit API data:', data);
      const processedData = this.processData(data[0] || data, authData);
      console.log('aMerkfaehigkeit processed data:', processedData);
      
      this.apiService.cache.set(cacheKey, processedData);
      
      return processedData;
    } catch (error) {
      console.error('Error fetching aMerkfaehigkeit data from API:', error);
      return this.getFallbackData();
    }
  }

  /**
   * Process API data for aMerkfaehigkeit specifically
   * TODO: Define what data this folder needs
   */
  processData(apiData, authData = null) {
    // Determine company name based on auth data
    let companyName = '';
    if (authData) {
      if (authData.einrichtung && authData.einrichtung.name) {
        companyName = authData.einrichtung.name;
      } else if (authData.privat_kunde && authData.privat_kunde.name) {
        companyName = authData.privat_kunde.name;
      }
    }
    
    return {
      // TODO: Define the specific data needed for aMerkfaehigkeit
      // Example structure - customize based on requirements:
      name: `${apiData.Vorname || ''} ${apiData.Nachname || ''}`.trim() || '',
      birthdate: apiData.GeburtsDatum || '',
      date: new Date().toLocaleDateString('de-DE'),
      company: companyName
      // Add more fields as needed for this specific folder
    };
  }

  /**
   * Get fallback data specifically for aMerkfaehigkeit
   */
  getFallbackData() {
    return {
      // TODO: Define empty fallback data for aMerkfaehigkeit
      name: '',
      birthdate: '',
      date: new Date().toLocaleDateString('de-DE'),
      company: ''
      // Add more fields as needed for this specific folder
    };
  }
}

// Create global instance when this script loads
if (typeof window !== 'undefined' && window.edulogApi) {
  window.aMerkfaehigkeitApi = new AMerkfaehigkeitApi(window.edulogApi);
}
