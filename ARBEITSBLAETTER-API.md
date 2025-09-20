# ArbeitsBlaetter API Integration

## Overview
This document explains the API integration for the ArbeitsBlaetter folder, which now includes authentication and loading screens.

## Authentication Flow

### 1. Authentication API Call
- **URL**: `POST https://dev.bildung.software/api/v1/authenticate`
- **Headers**: 
  - `Content-Type: application/json`
  - `Authorization: Bearer {token}`
- **Body**: 
  ```json
  {
    "p_id": "patient_id",
    "einrichtung_id": 15
  }
  ```

### 2. Data Extraction from Auth Response
The authentication response should contain:
- `user` - User information
- `einrichtung` - Institution data (used for company name)
- `privat_kunde` - Private customer flag
- `parameters` - Additional parameters

### 3. Data API Call
- **Base URL**: `GET http://logmedia-edulog-api.test/api/view-all-data?p_id={p_id}`
- **Conditional Parameters**:
  - If `authData.einrichtung.id` exists: `&Einrichtung_id={einrichtung.id}`
  - If `authData.privat_kunde.id` exists: `&privat_kunde_id={privat_kunde.id}`
- **Headers**:
  - `TOKEN: {token}`
  - `API-KEY: 190ecf3589ea350df3665156f2a43423`
  - `Content-Type: application/json`

## Loading Screen

### Features
- **Full-screen overlay** with semi-transparent background
- **Spinning loader** with Edulog branding colors
- **German text**: "Daten werden geladen..." / "Bitte warten Sie einen Moment"
- **Auto-removal** when data is loaded or on error

### Implementation
```javascript
// Show loading screen
window.edulogApi.showLoadingScreen();

// Fetch data (includes authentication)
const data = await window.edulogApi.fetchData();

// Hide loading screen
window.edulogApi.hideLoadingScreen();
```

## Data Mapping

### Placeholders Replaced
- `#NAME#` → `apiResponse.vorname + " " + apiResponse.nachname`
- `#BIRTHDATE#` → `apiResponse.GeburtsDatum`
- `#DAACH#` → `apiResponse.InDEseit`
- `#DATE#` → Current date (German format, not API related)
- `#COMPANY#` → `authData.einrichtung.name` or `authData.privat_kunde.name`
- `#DACHSINCE#` → `apiResponse.InDEseit`

### Data Sources
1. **Primary**: API response data
2. **Secondary**: Authentication data (for company name)
3. **Fallback**: Default values if API fails

## Error Handling

### Authentication Errors
- Missing token or p_id parameters
- Invalid credentials
- Network connectivity issues

### API Errors
- Invalid response format
- Missing required fields
- Server errors

### Fallback Behavior
- Uses URL parameters if available
- Falls back to default dummy data
- Always hides loading screen

## Testing

### Test URLs
1. **With API parameters**:
   ```
   test-arbeitsblaetter.html?token=test123&p_id=1755665051169
   ```

2. **With fallback parameters**:
   ```
   test-arbeitsblaetter.html?name=John%20Doe&birthdate=15/03/2018&since=01/01/2020&company=Test%20School
   ```

3. **Without parameters** (uses defaults):
   ```
   test-arbeitsblaetter.html
   ```

### Example API URL Construction
```
http://logmedia-edulog-api.test/api/view-all-data?p_id=1755665051169&Einrichtung_id=15
```
Or if privat_kunde exists:
```
http://logmedia-edulog-api.test/api/view-all-data?p_id=1755665051169&privat_kunde_id=123
```

## File Structure
```
ArbeitsBlaetter/
├── index.html              # Main HTML file with API integration
├── api-functions.js        # ArbeitsBlaetter-specific API functions
├── logo.png               # Logo image
├── img1.png - img6.png    # Content images
└── html2pdf.bundle.min.js # PDF generation library

js/
└── api-service.js         # Core API service (authentication, loading, utilities)

test-arbeitsblaetter.html  # Test page
```

## Next Steps
This implementation serves as a template for other folders. Each folder can have its own specific data extraction logic while using the same authentication and loading screen system.
