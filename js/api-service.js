/**
 * Centralized API Service for Edulog PDF Generation
 * Handles data fetching from LOGmedia API and provides consistent data structure
 */

class EdulogApiService {
  constructor() {
    // Dynamically determine URLs based on current domain
    const currentHost = window.location.hostname;
    const isDev = currentHost.includes('dev-') || currentHost.includes('.test');
    
    if (isDev) {
      this.authUrl = 'https://dev.bildung.software/api/v1/authenticate';
      this.baseUrl = 'https://dev-edulog-api.bildung.software/api';
    } else {
      this.authUrl = 'https://login.bildung.software/api/v1/authenticate';
      this.baseUrl = 'https://edulog-api.bildung.software/api';
    }
    
    this.apiKey = '190ecf3589ea350df3665156f2a43423';
    this.cache = new Map();
    this.authData = null; // Store authentication data
  }

  /**
   * Get URL parameters from current page
   */
  getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      token: params.get('token'),
      p_id: params.get('p_id')
    };
  }

  /**
   * Check if API parameters are available
   */
  hasApiParams() {
    const params = this.getUrlParams();
    return !!(params.token && params.p_id);
  }

  /**
   * Check if authentication is valid and should show content
   */
  async shouldShowContent() {
    try {
      const params = this.getUrlParams();
      
      // If no token or p_id, don't show content
      if (!this.hasApiParams()) {
        return false;
      }

      // Try to authenticate - if it fails, don't show content
      await this.authenticate();
      return true;
    } catch (error) {
      console.warn('Authentication failed, hiding content:', error.message);
      return false;
    }
  }

  /**
   * Authenticate and get basic data
   */
  async authenticate() {
    if (this.authData) {
      return this.authData; // Return cached auth data
    }

    const params = this.getUrlParams();
    
    if (!this.hasApiParams()) {
      throw new Error('Authentication requires token and p_id parameters');
    }

    try {
      const response = await fetch(this.authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${params.token}`
        },
        body: JSON.stringify({
          p_id: params.p_id,
          einrichtung_id: params.einrichtung_id
        })
      });

      if (!response.ok) {
        throw new Error(`Authentication failed with status ${response.status}`);
      }

      const authResponse = await response.json();
      
      // Extract required data from auth response
      this.authData = {
        user: authResponse.data.user,
        einrichtung: authResponse.data.einrichtung,
        privat_kunde: authResponse.data.privat_kunde,
        parameters: authResponse.data.parameters,
        token: params.token,
        p_id: params.p_id
      };

      return this.authData;
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  /**
   * Fetch data from API
   */
  async fetchData() {
    const params = this.getUrlParams();
    
    if (!this.hasApiParams()) {
      console.warn('API parameters missing, using fallback data');
      return this.getFallbackData();
    }

    // Check cache first
    const cacheKey = `${params.p_id}_${params.token}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      // First authenticate to get basic data
      const authData = await this.authenticate();
      
      // Now fetch the specific data with correct URL construction
      let apiUrl = `${this.baseUrl}/view-all-data?p_id=${encodeURIComponent(params.p_id)}`;
      
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
          'API-KEY': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      const processedData = this.processApiData(data[0] || data, authData);
      
      // Cache the result
      this.cache.set(cacheKey, processedData);
      
      return processedData;
    } catch (error) {
      console.error('Error fetching data from API:', error);
      return this.getFallbackData();
    }
  }


  /*
   * ARCHITECTURE FOR FOLDER-SPECIFIC FUNCTIONS:
   * 
   * Each folder should have its own api-functions.js file with:
   * 
   * class [FolderName]Api {
   *   constructor(apiService) {
   *     this.apiService = apiService;
   *   }
   *   
   *   async fetchData() {
   *     // Fetch data specific to this folder
   *   }
   *   
   *   processData(apiData, authData = null) {
   *     // Process data specific to this folder
   *   }
   *   
   *   getFallbackData() {
   *     // Return empty data for this folder when API fails
   *   }
   * }
   * 
   * // Create global instance
   * if (typeof window !== 'undefined' && window.edulogApi) {
   *   window.[folderName]Api = new [FolderName]Api(window.edulogApi);
   * }
   */

  /**
   * Process API data into consistent format (generic)
   */
  processApiData(apiData, authData = null) {
    // Determine company name based on auth data
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
      // Basic info - ArbeitsBlaetter specific mapping
      name: `${apiData.Vorname || ''} ${apiData.Nachname || ''}`.trim() || '',
      birthdate: apiData.GeburtsDatum || '',
      age: this.calculateAge(apiData.GeburtsDatum) || '',
      language: apiData.Familiensprache || '',
      since: apiData.InDEseit || '',
      date: new Date().toLocaleDateString('de-DE'),
      teacher: apiData.authuser_name || '',
      company: companyName,
      stadt: stadt,
      
      // Assessment data
      assessment: apiData.Beurteilung || '',
      
      // Bar configuration
      min: Number(apiData.min) || 0,
      max: Number(apiData.max) || 13,
      score: Number(apiData.score) || 0,
      
      // Colors and ranges
      colors: this.parseColors(apiData.colors) || ['#ed1b06','#ff7801','#fcc709','#fff15e','#c1ef4a','#79e607'],
      ranges: this.parseRanges(apiData.ranges) || [{start:0,end:3},{start:4,end:5},{start:6,end:6},{start:7,end:8},{start:9,end:10},{start:11,end:11}],
      
      // Labels
      label1: apiData.label1 || 'stark auffällig',
      label2: apiData.label2 || 'auffällig', 
      label3: apiData.label3 || 'unauffällig',
      label4: apiData.label4 || 'besonders unauffällig',
      
      // Sub-bar configuration
      subsplit: Number(apiData.subsplit) || 50,
      submin: Number(apiData.submin) || 0,
      submax: Number(apiData.submax) || 13,
      subgray: apiData.subgray || 'Weiterführende Fachdiagnostik empfohlen',
      subgreen: apiData.subgreen || 'Normbereich',
      
      // Additional data for specific pages
      ...apiData
    };
  }

  /**
   * Get fallback data when API is not available
   */
  getFallbackData() {
    return {
      // Empty data when API fails - no fallback data
      name: '',
      birthdate: '',
      age: '',
      language: '',
      since: '',
      date: new Date().toLocaleDateString('de-DE'),
      teacher: '',
      company: '',
      assessment: '',
      min: 0,
      max: 13,
      score: 0,
      colors: ['#ed1b06','#ff7801','#fcc709','#fff15e','#c1ef4a','#79e607'],
      ranges: [{start:0,end:3},{start:4,end:5},{start:6,end:6},{start:7,end:8},{start:9,end:10},{start:11,end:11}],
      label1: 'stark auffällig',
      label2: 'auffällig',
      label3: 'unauffällig', 
      label4: 'besonders unauffällig',
      subsplit: 50,
      submin: 0,
      submax: 13,
      subgray: 'Weiterführende Fachdiagnostik empfohlen',
      subgreen: 'Normbereich'
    };
  }

  /**
   * Format date from API response
   */
  formatDate(dateString) {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('de-DE');
    } catch (error) {
      return dateString;
    }
  }

  /**
   * Calculate age from birthdate (DD/MM/YYYY format)
   */
  calculateAge(birthdate) {
    if (!birthdate) return null;
    try {
      // Parse date in DD/MM/YYYY format
      let birth;
      if (birthdate.includes('/')) {
        // Handle DD/MM/YYYY format
        const parts = birthdate.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed in Date constructor
          const year = parseInt(parts[2], 10);
          birth = new Date(year, month, day);
        } else {
          birth = new Date(birthdate);
        }
      } else {
        birth = new Date(birthdate);
      }
      
      const today = new Date();
      
      // Calculate full years
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      
      // Adjust if birthday hasn't occurred this year
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      
      // Calculate months since last birthday
      let monthsSinceBirthday = today.getMonth() - birth.getMonth();
      if (monthsSinceBirthday < 0) {
        monthsSinceBirthday += 12;
      }
      
      // Adjust if the day hasn't occurred this month
      if (today.getDate() < birth.getDate()) {
        monthsSinceBirthday--;
        if (monthsSinceBirthday < 0) {
          monthsSinceBirthday = 11;
        }
      }
      
      return `${age},${monthsSinceBirthday}`;
    } catch (error) {
      return '0,0';
    }
  }

  /**
   * Parse colors from API response
   */
  parseColors(colorsString) {
    if (!colorsString) return null;
    try {
      return colorsString.split(',').map(color => color.trim());
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse ranges from API response
   */
  parseRanges(rangesString) {
    if (!rangesString) return null;
    try {
      return rangesString.split(',').map(range => {
        if (range.includes('-')) {
          const [start, end] = range.split('-').map(Number);
          return { start, end };
        } else {
          const val = Number(range);
          return { start: val, end: val };
        }
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Build gradient from colors and ranges
   */
  buildGradient(colors, ranges, min, max) {
    if (max === min) return colors[0] || '#ddd';
    let stops = [];
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i];
      const color = colors[i % colors.length];
      const startPct = ((r.start - min) / (max - min)) * 100;
      const endPct = ((r.end - min) / (max - min)) * 100;
      stops.push(`${color} ${startPct}%`, `${color} ${endPct}%`);
    }
    return `linear-gradient(90deg, ${stops.join(',')})`;
  }

  /**
   * Show loading screen
   */
  showLoadingScreen() {
    // Create loading screen if it doesn't exist
    if (!document.getElementById('edulog-loading-screen')) {
      const loadingScreen = document.createElement('div');
      loadingScreen.id = 'edulog-loading-screen';
      loadingScreen.innerHTML = `
        <div style="
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.95);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 9999;
          font-family: Arial, sans-serif;
        ">
          <div style="
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            max-width: 400px;
            margin: 20px;
          ">
            <div style="
              width: 50px;
              height: 50px;
              border: 4px solid #f3f3f3;
              border-top: 4px solid #f08a00;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin: 0 auto 20px;
            "></div>
            <h3 style="color: #f08a00; margin: 0 0 10px 0;">Daten werden geladen...</h3>
            <p style="color: #666; margin: 0;">Bitte warten Sie einen Moment</p>
          </div>
        </div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      `;
      document.body.appendChild(loadingScreen);
    }
  }

  /**
   * Hide loading screen
   */
  hideLoadingScreen() {
    const loadingScreen = document.getElementById('edulog-loading-screen');
    if (loadingScreen) {
      loadingScreen.remove();
    }
  }

  /**
   * Show loading state for placeholders (legacy method)
   */
  showLoadingState() {
    // Hide all elements with data-loading attribute
    const loadingElements = document.querySelectorAll('[data-loading]');
    loadingElements.forEach(el => {
      el.style.visibility = 'hidden';
    });
  }

  /**
   * Hide loading state and show data (legacy method)
   */
  hideLoadingState() {
    const loadingElements = document.querySelectorAll('[data-loading]');
    loadingElements.forEach(el => {
      el.style.visibility = 'visible';
    });
  }

  /**
   * Get current authentication data (for debugging)
   */
  getAuthData() {
    return this.authData;
  }

  /**
   * Get current environment info (for debugging)
   */
  getEnvironmentInfo() {
    return {
      hostname: window.location.hostname,
      isDev: window.location.hostname.includes('dev-'),
      authUrl: this.authUrl,
      baseUrl: this.baseUrl
    };
  }

  /**
   * Hide page content when authentication fails
   */
  hidePageContent() {
    // Hide the main content
    const body = document.body;
    if (body) {
      body.style.display = 'none';
    }
    
    // Show a message instead
    const messageDiv = document.createElement('div');
    messageDiv.id = 'edulog-no-access';
    messageDiv.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #f5f5f5;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: Arial, sans-serif;
      ">
        <div style="
          text-align: center;
          padding: 40px;
          background: white;
          border-radius: 10px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          max-width: 500px;
          margin: 20px;
        ">
          <div style="
            width: 80px;
            height: 80px;
            background: #ff6b6b;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            font-size: 40px;
            color: white;
          ">⚠️</div>
          <h2 style="color: #333; margin: 0 0 15px 0;">Zugriff verweigert</h2>
          <p style="color: #666; margin: 0 0 20px 0; line-height: 1.5;">
            Sie haben keine Berechtigung, diese Seite anzuzeigen.<br>
            Bitte überprüfen Sie Ihre Zugangsdaten.
          </p>
          <p style="color: #999; font-size: 14px; margin: 0;">
            Fehlende oder ungültige Authentifizierung
          </p>
        </div>
      </div>
    `;
    document.body.appendChild(messageDiv);
  }
}

// Create global instance
window.edulogApi = new EdulogApiService();
