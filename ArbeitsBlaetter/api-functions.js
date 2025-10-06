/**
 * ArbeitsBlaetter-specific API functions
 * Handles data fetching and processing for ArbeitsBlaetter folder
 */

class ArbeitsBlaetterApi {
  constructor(apiService) {
    this.apiService = apiService;
  }

  /**
   * Fetch data specifically for ArbeitsBlaetter
   */
  async fetchData() {
    const params = this.apiService.getUrlParams();
    
    if (!this.apiService.hasApiParams()) {
      console.warn('API parameters missing, using fallback data');
      return this.getFallbackData();
    }

    const cacheKey = `arbeitsblaetter_${params.p_id}_${params.token}`;
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
      const processedData = this.processData(data[0] || data, authData);

      this.apiService.cache.set(cacheKey, processedData);
      
      return processedData;
    } catch (error) {
      console.error('Error fetching ArbeitsBlaetter data from API:', error);
      return this.getFallbackData();
    }
  }

  /**
   * Process API data for ArbeitsBlaetter specifically
   */
  processData(apiData, authData = null) {
    // Determine company name and stadt based on auth data
    let companyName = '';
    let stadt = '';
    if (authData) {
      if (authData.einrichtung && authData.einrichtung.name) {
        companyName = authData.einrichtung.name;
        stadt = authData.einrichtung.stadt || '';
      } else if (authData.privat_kunde && authData.privat_kunde.name) {
        companyName = authData.privat_kunde.name;
        stadt = authData.privat_kunde.stadt || '';
      }
    }
    
    return {
      // Only the data needed for ArbeitsBlaetter
      name: `${apiData.Vorname || ''} ${apiData.Nachname || ''}`.trim() || '',
      birthdate: apiData.GeburtsDatum || '',
      age: this.apiService.calculateAge(apiData.GeburtsDatum) || '',
      since: apiData.InDEseit || '',
      date: new Date().toLocaleDateString('de-DE'),
      company: companyName,
      stadt: stadt
    };
  }

  /**
   * Get fallback data specifically for ArbeitsBlaetter
   */
  getFallbackData() {
    return {
      name: '',
      birthdate: '',
      age: '',
      since: '',
      date: new Date().toLocaleDateString('de-DE'),
      company: '',
      stadt: ''
    };
  }
}

// Create global instance when this script loads
if (typeof window !== 'undefined' && window.edulogApi) {
  window.arbeitsBlaetterApi = new ArbeitsBlaetterApi(window.edulogApi);
}
