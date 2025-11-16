/**
 * QuadFormWC - Web Component for RDF Quad Creation
 * Drop-in replacement for QuadForm.js with addtripleform.js behavior
 * 
 * Refactored for FULL|TINY|NANO mode unification:
 * - Single unified DOM structure
 * - CSS controls visibility via data-mode attribute
 * - No renderContent() calls after initial render()
 * - Event listeners attached once
 * 
 * NANO MODE FEATURES:
 * - Only object input visible
 * - Tab or Blur triggers submit
 * - Auto-clear and refocus after submit
 * - One-way transition (cannot return to form)
 */

// XSD to HTML5 input type mapping
const XSD_TO_HTML5 = {
  'xsd:date': 'date',
  'xsd:time': 'time',
  'xsd:dateTime': 'datetime-local',
  'xsd:integer': 'number',
  'xsd:decimal': 'number',
  'xsd:float': 'number',
  'xsd:double': 'number',
  'xsd:boolean': 'checkbox',
  'xsd:anyURI': 'url'
};

// Common RDF prefixes (hardcoded for initial implementation)
const COMMON_PREFIXES = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  schema: 'http://schema.org/',
  mntl: 'urn:mmm:mntl:',
  iii: 'urn:mmm:iii:',
  ex: 'http://example.org/',
  wp: 'https://en.wikipedia.org/wiki/'
};

// Hardcoded properties for predicate picker
const COMMON_PROPERTIES = [
  'rdf:type',
  'rdfs:label',
  'rdfs:comment',
  'owl:sameAs',
  'foaf:name',
  'foaf:knows',
  'dc:title',
  'dc:creator',
  'dcterms:created',
  'schema:name',
  'schema:description'
];

// Mental space types with their templates
const MENTAL_SPACE_TYPES = [
  { value: 'mntl:lock', label: 'mntl:lock/{identity}', disabled: true,
    description: 'mntl:lock - Owned by you, for you alone' },
  { value: 'mntl:hold', label: 'mntl:hold/{identity}', disabled: true,
    description: 'mntl:hold - Owned by you, with detailed capabilities' },
  { value: 'mntl:gate', label: 'mntl:gate/{identity}', disabled: true,
    description: 'mntl:gate - Owned by you, readable and writeable by whom you choose' },
  { value: 'mntl:open', label: 'mntl:open/{identity}', disabled: false,
    description: 'mntl:open - Owned by you, readable by the world' },
  { value: 'mntl:publ', label: 'mntl:publ', disabled: false,
    description: 'mntl:publ - A true public commons' }
];

/**
 * MMM canonical URN schemes (compact form without urn:mmm: prefix)
 * These are complete identifiers, not CURIEs requiring prefix expansion
 */
const MMM_URN_SCHEMES = new Set([
  'trpl',  // Triple entity: trpl:Base57Hash
  'quad',  // Quad entity: quad:Base57Hash
  'snip',  // Snippet entity: snip:Base57Hash
  'atby',  // Attribution entity: atby:Base57Hash
  'mntl',  // Mental space graph: mntl:publ/path or mntl:open/identity/path
  'iii',   // Identity: iii:identifier
  'time'   // Temporal reference: time:ISO8601
]);

/**
 * Standard URI and URN schemes
 * These are well-known identifiers that don't require prefix lookup
 */
const STANDARD_SCHEMES = new Set([
  // Common URI schemes
  'http', 'https', 'ftp', 'ftps', 'file', 'data',
  'mailto', 'tel', 'sms', 'geo',
  // Formal URN schemes
  'urn', 'isbn', 'issn', 'doi', 'uuid', 'oid', 'lex'
]);

class QuadFormWC extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // State
    this.fieldValues = {
      subject: '',
      predicate: '',
      object: '',
      graph: ''
    };
    
    // Field validity
    this.fieldValidity = {
      subject: false,
      predicate: false,
      object: false,
      graph: false
    };
    
    // Field modes: {qname|uri|literal}
    this.fieldTypes = {
      subject: 'uri',
      predicate: 'qname',
      object: 'uri',
      graph: 'qname'
    };
    
    // Field control modes: {input|select}
    this.fieldControls = {
      subject: 'input',
      predicate: 'select',
      object: 'input',
      graph: 'select'
    };
    
    // Object metadata
    this._objectDatatype = '';
    this._objectLanguage = '';
    this.objectUsesTextarea = false;
    
    // Graph mental space tracking
    this.graphMentalSpace = 'mntl:publ';
    this.graphPath = '/scratch';
    
    // Mode state
    this.nanoMode = false;
    this.tinyMode = false;
    this.tinyFieldTypes = {
      subject: 'qname',
      predicate: 'qname',
      object: 'qname'
    };
    this.tinyPickerIndices = {
      subject: 0,
      predicate: 0,
      object: 0
    };
    
    // Configuration
    this._mmmServer = null;
    this._prefixes = { ...COMMON_PREFIXES };
    this._prefixesFormLoaded = false;
    this._currentIdentity = null;
    this._expandQNames = true;
    this._defaultGraph = 'mntl:publ/scratch';
  }

  // Getters/setters for objectDatatype and objectLanguage
  // These trigger updateObjectInputType() when datatype changes
  get objectDatatype() {
    return this._objectDatatype;
  }

  set objectDatatype(value) {
    if (this._objectDatatype !== value) {
      this._objectDatatype = value;
      // Trigger input type update when datatype changes
      if (this.shadowRoot) {
        this.updateObjectInputType();
      }
    }
  }

  get objectLanguage() {
    return this._objectLanguage;
  }

  set objectLanguage(value) {
    if (this._objectLanguage !== value) {
      this._objectLanguage = value;
    }
  }
  
  connectedCallback() {
    this.render();
    this.attachEventListeners();
    this.updateAttribution();
    this.loadPrefixesForm();
  }
  
  // Getters/setters
  get mmmServer() { return this._mmmServer; }
  set mmmServer(value) { this._mmmServer = value; }
  
  get prefixes() { return this._prefixes; }
  set prefixes(value) { 
    this._prefixes = { ...COMMON_PREFIXES, ...value };
  }
  
  get currentIdentity() { return this._currentIdentity; }
  set currentIdentity(value) { 
    this._currentIdentity = value;
    this.updateAttribution();
    // Update by-value if it exists
    const byValue = this.shadowRoot?.getElementById('by-value');
    if (byValue) {
      byValue.textContent = value || 'not logged in';
    }
  }
  
  get expandQNames() { return this._expandQNames; }
  set expandQNames(value) { this._expandQNames = value; }
  
  get defaultGraph() { return this._defaultGraph; }
  set defaultGraph(value) { 
    this._defaultGraph = value;
    this.fieldValues.graph = value;
  }
  
  getGraphPrefix() {
    const identity = this._currentIdentity || '';
    if (!identity) {
      if (this.graphMentalSpace === 'mntl:publ') {
        return 'mntl:publ';
      }
      return this.graphMentalSpace + '/{identity}';
    }
    
    if (this.graphMentalSpace === 'http:' || this.graphMentalSpace === 'https:') {
      return this.graphMentalSpace + '//';
    } else if (this.graphMentalSpace === 'mntl:publ') {
      return 'mntl:publ';
    } else {
      return this.graphMentalSpace + '/' + identity;
    }
  }
  
  getPickerValues(field) {
    if (field === 'predicate') {
      return COMMON_PROPERTIES;
    }
    
    // For subject and object, return classes from prefixes
    const classes = [];
    for (const prefix in this._prefixes) {
      classes.push(`${prefix}:Class`);
      classes.push(`${prefix}:Resource`);
    }
    return classes;
  }

  /**
   * Validate a field value based on its type
   *
   * Supports three kinds of identifiers:
   * 1. URNs - scheme:namespace-specific-string (e.g., trpl:abc123, mntl:publ/scratch)
   * 2. URIs - scheme:hier-part (e.g., http://example.org/path)
   * 3. CURIEs - prefix:localName where prefix is defined (e.g., foaf:knows)
   *
   * @param {string} field - Field name (subject, predicate, object)
   * @param {string} value - Field value to validate
   * @param {string} type - Expected type ('uri', 'qname', 'string', etc.)
   * @returns {boolean} True if valid
   */
  validateField(field, value, type) {
    if (!value || value.trim() === '') {
      return false;
    }
    
    if (type === 'uri' || type === 'qname') {
      const colonIndex = value.indexOf(':');
      
      // Must contain a colon to be a valid identifier
      if (colonIndex <= 0) {
        return false;
      }
      
      const scheme = value.substring(0, colonIndex).toLowerCase();
      const nss = value.substring(colonIndex + 1); // Namespace Specific String or localName
      
      // Empty NSS/localName is invalid
      if (nss.length === 0) {
        return false;
      }
      
      // MMM URN schemes - compact form (without urn:mmm: prefix)
      // These are complete identifiers used internally in MMM
      if (MMM_URN_SCHEMES.has(scheme)) {
        return true;
      }
      
      // Standard URI/URN schemes - recognized by IETF/W3C
      if (STANDARD_SCHEMES.has(scheme)) {
        return true;
      }
      
      // Not a known URN/URI scheme, so it must be a CURIE
      // Check if the prefix is defined in the prefix table
      if (this._prefixes.hasOwnProperty(scheme)) {
        // Validate CURIE localName format: must start with letter/underscore
        // and contain only word characters and hyphens
        return /^[a-zA-Z_][\w-]*$/.test(nss);
      }
      
      // Unknown scheme and not a defined CURIE prefix - invalid
      return false;
      
    } else if (type === 'string') {
      // Plain string literals - always valid if non-empty
      return true;
      
    } else {
      // Other types (xsd:integer, xsd:date, etc.) - accept any non-empty value
      // The HTML5 input type constraints will handle validation
      return true;
    }
  }
  
  updateFieldValidation() {
    const container = this.shadowRoot.querySelector('.quad-form-container');
    const mode = container?.dataset.mode || 'full';
    
    if (mode === 'nano') {
      // In nano mode, only validate object
      const input = this.shadowRoot.getElementById('object-input');
      const textarea = this.shadowRoot.getElementById('object-textarea');
      const activeInput = textarea && !textarea.classList.contains('hidden') ? textarea : input;
      
      if (activeInput) {
        const type = this.fieldTypes.object;
        const value = activeInput.value;
        const isValid = this.validateField('object', value, type);
        this.fieldValidity.object = isValid;
        
        if (value) {
          activeInput.style.backgroundColor = isValid ? '#e8f5e9' : '#ffebee';
        } else {
          activeInput.style.backgroundColor = '';
        }
      }
    } else if (mode === 'tiny') {
      // Validate tiny mode fields (skip graph)
      ['subject', 'predicate', 'object'].forEach(field => {
        let input;
        
        if (field === 'object' && this.objectUsesTextarea) {
          // Use textarea for object if objectUsesTextarea is true
          input = this.shadowRoot.getElementById('object-textarea');
        } else {
          // Use regular input for all other cases
          input = this.shadowRoot.getElementById(`${field}-input`);
        }
        
        if (input && !input.classList.contains('hidden')) {
          const type = this.tinyFieldTypes[field];
          const value = input.value;
          const isValid = this.validateField(field, value, type);
          this.fieldValidity[field] = isValid;
          
          if (value) {
            input.style.backgroundColor = isValid ? '#e8f5e9' : '#ffebee';
          } else {
            input.style.backgroundColor = '';
          }
        }
      });
    } else {
      // Validate full mode fields
      ['subject', 'predicate', 'object'].forEach(field => {
        const input = this.shadowRoot.getElementById(`${field}-input`);
        if (input && !input.classList.contains('hidden')) {
          const type = this.fieldTypes[field];
          const value = input.value;
          const isValid = this.validateField(field, value, type);
          this.fieldValidity[field] = isValid;
          
          if (value) {
            input.style.backgroundColor = isValid ? '#e8f5e9' : '#ffebee';
          } else {
            input.style.backgroundColor = '';
          }
        }
      });
      
      // Validate graph
      const graphInput = this.shadowRoot.getElementById('graph-path-input');
      if (graphInput) {
        const fullGraph = this.fieldValues.graph;
        const isValid = fullGraph && fullGraph.trim() !== '';
        this.fieldValidity.graph = isValid;
        
        if (fullGraph) {
          graphInput.style.backgroundColor = isValid ? '#e8f5e9' : '#ffebee';
        } else {
          graphInput.style.backgroundColor = '';
        }
      }
    }
  }
  
  toggleNanoMode() {
    const container = this.shadowRoot.querySelector('.quad-form-container');
    
    if (!this.nanoMode) {
      // Entering nano mode
      this.nanoMode = true;
      this.tinyMode = false;
      container.setAttribute('data-mode', 'nano');
      
      // Set default values for hidden fields if not already set
      if (!this.fieldValues.subject) this.fieldValues.subject = 'ex:DefaultSubject';
      if (!this.fieldValues.predicate) this.fieldValues.predicate = 'rdfs:comment';
      if (!this.fieldValues.graph) this.fieldValues.graph = this._defaultGraph;
      
      setTimeout(() => {
        const objectInput = this.shadowRoot.getElementById('object-input');
        const objectTextarea = this.shadowRoot.getElementById('object-textarea');
        const activeInput = objectTextarea && !objectTextarea.classList.contains('hidden') ? 
                           objectTextarea : objectInput;
        if (activeInput) activeInput.focus();
      }, 50);
    }
    // Note: Once in nano mode, can't go back (no UI controls visible)
  }
  
  getObjectTinyType() {
    // Determine tiny type for object based on full mode type
    const fullType = this.fieldTypes.object;
    
    if (fullType === 'uri') return 'uri';
    if (fullType === 'qname') return 'qname';
    if (fullType === 'xsd:string') return 'string';
    
    // All other datatypes (xsd:dateTime, xsd:integer, etc) are literals with no decorators
    return 'literal';
  }
  
  toggleTinyMode() {
    const container = this.shadowRoot.querySelector('.quad-form-container');
    
    if (!this.tinyMode) {
      // Entering tiny mode
      this.tinyMode = true;
      this.nanoMode = false;
      
      // CRITICAL: Sync values from selects to inputs before switching modes
      ['subject', 'predicate', 'object'].forEach(field => {
        const select = this.shadowRoot.getElementById(`${field}-select`);
        const input = this.shadowRoot.getElementById(`${field}-input`);
        
        // If using picker (select), copy value to input for tiny mode
        if (select && !select.classList.contains('hidden') && select.value) {
          this.fieldValues[field] = select.value;
          if (input) input.value = select.value;
        }
      });
      
      // Sync field types from full mode
      this.tinyFieldTypes = {
        subject: this.fieldTypes.subject === 'uri' ? 'uri' : 'qname',
        predicate: this.fieldTypes.predicate === 'uri' ? 'uri' : 'qname',
        object: this.getObjectTinyType()
      };
      
      container.setAttribute('data-mode', 'tiny');
      
      // Sync textarea/input visibility for object field
      const objectInput = this.shadowRoot.getElementById('object-input');
      const objectTextarea = this.shadowRoot.getElementById('object-textarea');
      
      if (this.objectUsesTextarea) {
        // Show textarea, hide input
        if (objectInput) objectInput.classList.add('hidden');
        if (objectTextarea) {
          objectTextarea.classList.remove('hidden');
          // Ensure textarea has the current value
          if (this.fieldValues.object) {
            objectTextarea.value = this.fieldValues.object;
          }
        }
      } else {
        // Show input, hide textarea
        if (objectTextarea) objectTextarea.classList.add('hidden');
        if (objectInput) {
          objectInput.classList.remove('hidden');
          // Ensure input has the current value
          if (this.fieldValues.object) {
            objectInput.value = this.fieldValues.object;
          }
        }
      }
      
      // Update decorators based on field types
      this.updateTinyDecorators();
      
      setTimeout(() => {
        const firstInput = this.shadowRoot.getElementById('subject-input');
        if (firstInput) firstInput.focus();
      }, 400);
      
    } else {
      // Exiting tiny mode
      this.tinyMode = false;
      container.setAttribute('data-mode', 'full');
      
      setTimeout(() => {
        const firstInput = this.shadowRoot.getElementById('subject-input');
        if (firstInput) firstInput.focus();
      }, 400);
    }
  }
  
  render() {
    const initialMode = this.nanoMode ? 'nano' : this.tinyMode ? 'tiny' : 'full';
    
    this.shadowRoot.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        
        .quad-form-container {
          font-family: monospace;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 20px;
          transition: all 0.4s ease-in-out;
        }
        
        /* NANO MODE - Transparent container, only object input visible */
        [data-mode="nano"].quad-form-container {
          padding: 0;
          border: none;
          background: transparent;
        }
        
        [data-mode="nano"] .form-header,
        [data-mode="nano"] .field-label,
        [data-mode="nano"] .field-controls,
        [data-mode="nano"] .subject-field,
        [data-mode="nano"] .predicate-field,
        [data-mode="nano"] .graph-field,
        [data-mode="nano"] .tiny-decorator,
        [data-mode="nano"] .tiny-period,
        [data-mode="nano"] .form-actions {
          display: none;
        }
        
        [data-mode="nano"] .object-field {
          width: 100%;
          height: 100%;
        }
        
        [data-mode="nano"] #object-input,
        [data-mode="nano"] #object-textarea {
          width: 100%;
          height: 100%;
          border: none;
          background: transparent;
          padding: 0;
          margin: 0;
          outline: none;
        }
        
        /* TINY MODE - Horizontal inline layout */
        [data-mode="tiny"] .form-header,
        [data-mode="tiny"] .field-label,
        [data-mode="tiny"] .field-controls,
        [data-mode="tiny"] .graph-field,
        [data-mode="tiny"] .submit-btn,
        [data-mode="tiny"] .tiny-btn,
        [data-mode="tiny"] .nano-btn,
        [data-mode="tiny"] .field-select {
          display: none;
        }
        
        /* In tiny mode, show textarea OR input based on hidden class */
        [data-mode="tiny"] #object-textarea:not(.hidden) {
          display: inline-block;
          border: none;
          border-bottom: 2px solid #ddd;
          border-radius: 0;
          min-width: 16ch;
          min-height: 2em;
          padding: 4px 8px;
          font-size: 14px;
          resize: none;
          vertical-align: top;
        }
        
        [data-mode="tiny"] #object-input.hidden {
          display: none;
        }
        
        [data-mode="tiny"] .unified-content {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        
        [data-mode="tiny"] .field-group {
          display: inline-flex;
          align-items: center;
          margin-bottom: 0;
        }

        /* Tiny mode field inputs - but NOT object input since it switches with textarea */
        [data-mode="tiny"] .field-input:not(#object-input) {
          display: inline-block !important;  /* Force visible for subject/predicate */
          border: none;
          border-bottom: 2px solid #ddd;
          border-radius: 0;
          padding: 4px 8px;
          font-size: 14px;
          width: auto;
          max-width: none;
        }
        
        /* Object input in tiny mode - respect .hidden class for input/textarea switching */
        [data-mode="tiny"] #object-input:not(.hidden) {
          display: inline-block;
          border: none;
          border-bottom: 2px solid #ddd;
          border-radius: 0;
          padding: 4px 8px;
          font-size: 14px;
          width: auto;
          max-width: none;
        }
        
        [data-mode="tiny"] .tiny-decorator,
        [data-mode="tiny"] .tiny-period,
        [data-mode="tiny"] .submit-btn-tiny,
        [data-mode="tiny"] .form-btn {
          display: inline-block;
        }
        
        [data-mode="tiny"] .form-actions {
          display: flex;
          border-top: none;
          padding-top: 15px;
        }
        
        /* FULL MODE - Normal vertical layout */
        [data-mode="full"] .tiny-decorator,
        [data-mode="full"] .tiny-period,
        [data-mode="full"] .submit-btn-tiny,
        [data-mode="full"] .form-btn {
          display: none;
        }
        
        [data-mode="full"] .field-group {
          display: block;
          margin-bottom: 15px;
        }
        
        [data-mode="full"] .unified-content {
          display: block;
        }
        
        /* Full mode styles */
        .form-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #e0e0e0;
        }
        
        h3 {
          margin: 0;
          font-size: 16px;
        }
        
        .attribution {
          display: inline-flex;
          gap: 15px;
          font-size: 11px;
          color: #666;
          background: #f9f9f9;
          padding: 4px 10px;
          border-radius: 3px;
        }
        
        .prefixes-btn {
          background: #2196F3;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 12px;
        }
        
        .prefixes-btn:hover {
          background: #1976D2;
        }
        
        .field-group {
          margin-bottom: 15px;
        }
        
        .field-label {
          display: inline-block;
          font-weight: bold;
          font-size: 13px;
          margin-right: 8px;
          margin-bottom: 0;
          white-space: nowrap;
        }
        
        .field-controls {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
          align-items: center;
        }
        
        .type-select-dropdown {
          padding: 6px;
          border: 1px solid #ddd;
          border-radius: 3px;
          font-family: monospace;
          font-size: 12px;
        }

        #graph-mental-space-select {
          text-align-last: right;
        }

        .spacer {
          flex: 1;
        }
        
        .language-input {
          width: 35px;
          padding: 6px;
          border: 1px solid #ddd;
          border-radius: 3px;
          font-family: monospace;
          font-size: 12px;
          text-align: center;
        }
        
        .language-input:disabled {
          background: #f0f0f0;
          color: #999;
          cursor: not-allowed;
        }
        
        .control-toggle {
          background: white;
          border: 1px solid #ddd;
          padding: 6px 10px;
          cursor: pointer;
          font-family: monospace;
          border-radius: 3px;
          font-size: 12px;
          white-space: nowrap;
        }
        
        .control-toggle:hover {
          background: #f5f5f5;
          border-color: #999;
        }
        
        .field-input, .field-select, .field-textarea {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 3px;
          font-family: monospace;
          font-size: 13px;
          min-width: 16ch;
        }
        
        .field-textarea {
          min-height: 80px;
          resize: vertical;
        }
        
        .field-input:focus, .field-select:focus, .field-textarea:focus {
          outline: none;
          border-color: #4CAF50;
          box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.1);
        }
        
        .graph-input-wrapper {
          display: flex;
          align-items: stretch;
          border: 1px solid #ddd;
          border-radius: 3px;
          overflow: hidden;
        }
        
        .graph-input-wrapper:focus-within {
          border-color: #4CAF50;
          box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.1);
        }
        
        .graph-prefix {
          background: #e8e8e8;
          color: #555;
          padding: 8px;
          font-family: monospace;
          font-size: 13px;
          white-space: nowrap;
          display: flex;
          align-items: center;
          border-right: 1px solid #ccc;
        }
        
        .graph-path-input {
          flex: 1;
          border: none;
          padding: 8px;
          font-family: monospace;
          font-size: 13px;
        }
        
        .graph-path-input:focus {
          outline: none;
        }
        
        .graph-hint {
          margin-left: 12px;
          font-style: italic;
          font-size: 0.9em;
          color: #666;
          font-weight: normal;
        }
        
        .hidden {
          display: none !important;
        }
        
        /* Tiny mode decorators */
        .tiny-decorator {
          font-weight: 900;
          font-size: 16px;
          color: #666;
        }
        
        .tiny-period {
          font-weight: bold;
          font-size: 18px;
          margin-left: 4px;
        }
        
        .tiny-lang {
          border: none;
          border-bottom: 1px solid #ddd;
          font-family: monospace;
          font-size: 12px;
          padding: 2px 4px;
          width: 40px;
        }
        
        /* Form actions */
        .form-actions {
          display: flex;
          gap: 10px;
          margin-top: 20px;
          padding-top: 15px;
          border-top: 2px solid #e0e0e0;
        }
        
        .submit-btn, .submit-btn-tiny, .clear-btn, .tiny-btn, .form-btn, .nano-btn {
          padding: 10px 20px;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-family: monospace;
          font-size: 13px;
          font-weight: bold;
        }
        
        .submit-btn {
          background: #4CAF50;
          color: white;
          flex: 1;
        }
        
        .submit-btn:hover:not(:disabled) {
          background: #45a049;
        }
        
        .submit-btn:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        .submit-btn-tiny {
          background: #4CAF50;
          color: white;
          width: 50px;
          height: 40px;
          font-size: 24px;
          padding: 0;
        }
        
        .submit-btn-tiny:hover:not(:disabled) {
          background: #45a049;
        }
        
        .submit-btn-tiny:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        .tiny-btn {
          background: #2196F3;
          color: white;
        }
        
        .form-btn {
          background: #2196F3;
          color: white;
        }
        
        .tiny-btn:hover, .form-btn:hover {
          background: #1976D2;
        }
        
        .nano-btn {
          background: #FF9800;
          color: white;
        }
        
        .nano-btn:hover {
          background: #F57C00;
        }
        
        .clear-btn {
          background: #f44336;
          color: white;
        }
        
        .clear-btn:hover {
          background: #da190b;
        }
        
        .prefixes-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .prefixes-overlay.visible {
          display: flex;
        }
        
        .prefixes-container {
          background: white;
          padding: 20px;
          border-radius: 8px;
          max-width: 600px;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          position: relative;
        }
        
        .close-prefixes {
          position: absolute;
          top: 10px;
          right: 10px;
          background: #f44336;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 3px;
          cursor: pointer;
          font-family: monospace;
          font-size: 14px;
          z-index: 1;
        }
        
        .close-prefixes:hover {
          background: #d32f2f;
        }
        
        .prefix-list {
          margin-top: 30px;
        }
        
        .prefix-item {
          padding: 8px;
          border-bottom: 1px solid #eee;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .prefix-name {
          font-weight: bold;
          color: #2196F3;
          min-width: 80px;
        }
        
        .prefix-url {
          color: #666;
          word-break: break-all;
          flex: 1;
        }
        
        /* Transitions */
        .quad-form-container,
        .field-group,
        .field-input,
        .tiny-decorator,
        .form-header {
          transition: opacity 0.4s ease-in-out, 
                      transform 0.4s ease-in-out;
        }
      </style>
      
      <div class="quad-form-container" data-mode="${initialMode}">
        ${this.renderUnifiedContent()}
        
        <div class="prefixes-overlay" id="prefixes-overlay">
          <div class="prefixes-container">
            <button class="close-prefixes" id="close-prefixes">✕</button>
            <div id="prefixes-form-container"></div>
          </div>
        </div>
      </div>
    `;
    
    this.updateAttribution();
  }
  
  renderUnifiedContent() {
    return `
      <div class="unified-content">
        <!-- Form header (visible: full only) -->
        <div class="form-header">
          <h3>Say It</h3>
          <div class="attribution">
            <span><strong>at:</strong> <span id="at-value">—</span></span>
            <span><strong>by:</strong> <span id="by-value">${this._currentIdentity || 'not logged in'}</span></span>
          </div>
          <button class="prefixes-btn" id="prefixes-btn">Prefixes</button>
        </div>
        
        <!-- Subject field -->
        <div class="field-group subject-field">
          <div class="field-controls">
            <label class="field-label">Subject</label>
            ${this.renderStandardTypeOptions('subject', this.fieldTypes.subject)}
            <div class="spacer"></div>
            <button type="button" class="control-toggle" data-field="subject">
              ${this.fieldControls.subject === 'input' ? '<strong>input</strong>/picker' : 'input/<strong>picker</strong>'}
            </button>
          </div>
          <span class="tiny-decorator subject-left">&lt;</span>
          <input type="text" 
                 class="field-input ${this.fieldControls.subject === 'select' ? 'hidden' : ''}" 
                 id="subject-input"
                 data-field="subject"
                 placeholder="${this.getPlaceholder('subject', this.fieldTypes.subject)}"
                 value="${this.fieldValues.subject}">
          <span class="tiny-decorator subject-right">&gt;</span>
          <select class="field-select ${this.fieldControls.subject === 'input' ? 'hidden' : ''}" 
                  id="subject-select"
                  data-field="subject">
            <option value="">Select Subject...</option>
            ${this.renderSelectOptions('subject')}
          </select>
        </div>
        
        <!-- Predicate field -->
        <div class="field-group predicate-field">
          <div class="field-controls">
            <label class="field-label">Predicate</label>
            ${this.renderStandardTypeOptions('predicate', this.fieldTypes.predicate)}
            <div class="spacer"></div>
            <button type="button" class="control-toggle" data-field="predicate">
              ${this.fieldControls.predicate === 'input' ? '<strong>input</strong>/picker' : 'input/<strong>picker</strong>'}
            </button>
          </div>
          <span class="tiny-decorator predicate-left"></span>
          <input type="text" 
                 class="field-input ${this.fieldControls.predicate === 'select' ? 'hidden' : ''}" 
                 id="predicate-input"
                 data-field="predicate"
                 placeholder="${this.getPlaceholder('predicate', this.fieldTypes.predicate)}"
                 value="${this.fieldValues.predicate}">
          <span class="tiny-decorator predicate-right"></span>
          <select class="field-select ${this.fieldControls.predicate === 'input' ? 'hidden' : ''}" 
                  id="predicate-select"
                  data-field="predicate">
            <option value="">Select Predicate...</option>
            ${this.renderSelectOptions('predicate')}
          </select>
        </div>
        
        <!-- Object field -->
        <div class="field-group object-field">
          <div class="field-controls">
            <label class="field-label">Object</label>
            ${this.renderObjectTypeOptions(this.fieldTypes.object)}
            <div class="spacer"></div>
            <input type="text" 
                   class="language-input" 
                   id="language-input"
                   placeholder="en"
                   title="Language tag (e.g., en, fr, es)"
                   maxlength="3"
                   pattern="^([a-z]{2}|[a-z]{3})?$"
                   ${!this.objectUsesTextarea ? 'disabled' : ''}
                   value="${this.objectLanguage}">
            <button type="button" class="control-toggle" data-field="object">
              ${this.fieldControls.object === 'input' ? '<strong>input</strong>/picker' : 'input/<strong>picker</strong>'}
            </button>
          </div>
          <span class="tiny-decorator object-left">&lt;</span>
          <div class="object-input-wrapper">
            <input type="text" 
                   class="field-input ${this.fieldControls.object === 'select' || this.objectUsesTextarea ? 'hidden' : ''}" 
                   id="object-input"
                   data-field="object"
                   placeholder="${this.getPlaceholder('object', this.fieldTypes.object)}"
                   value="${this.fieldValues.object}">
            <textarea class="field-textarea ${!this.objectUsesTextarea ? 'hidden' : ''}"
                      id="object-textarea"
                      data-field="object"
                      placeholder="Enter text content...">${this.fieldValues.object}</textarea>
          </div>
          <span class="tiny-decorator object-right">&gt;</span>
          <select class="field-select ${this.fieldControls.object === 'input' ? 'hidden' : ''}" 
                  id="object-select"
                  data-field="object">
            <option value="">Select Object...</option>
            ${this.renderSelectOptions('object')}
          </select>
        </div>
        
        <span class="tiny-period">.</span>
        
        <!-- Graph field -->
        <div class="field-group graph-field">
          <div class="field-controls">
            <label class="field-label">Graph<span class="graph-hint">${this.getMentalSpaceDescription()}</span></label>
          </div>
          ${this.renderGraphInput()}
        </div>
        
        <!-- Form actions -->
        <div class="form-actions">
          <button type="button" class="tiny-btn" id="tiny-btn">Tiny</button>
          <button type="button" class="form-btn" id="form-btn">Form</button>
          <button type="button" class="nano-btn" id="nano-btn">Nano</button>
          <button type="button" class="clear-btn" id="clear-btn">Clear</button>
          <button type="submit" class="submit-btn" id="submit-btn">Submit Quad</button>
          <button type="button" class="submit-btn-tiny" id="submit-btn-tiny">+</button>
        </div>
      </div>
    `;
  }

  getMentalSpaceDescription() {
    const type = MENTAL_SPACE_TYPES.find(t => t.value === this.graphMentalSpace);
    return type ? type.description : '';
  }
  
  renderGraphInput() {
    const fullValue = this.fieldValues.graph || this._defaultGraph;
    
    // Extract path from full value
    const prefix = this.getGraphPrefix();
    let path = this.graphPath;
    if (fullValue.startsWith(prefix)) {
      path = fullValue.substring(prefix.length);
    }
    
    return `
      <div class="graph-input-wrapper">
        ${this.renderGraphMentalSpaceSelect()}
        <input type="text" 
               class="graph-path-input" 
               id="graph-path-input"
               placeholder="/path"
               value="${path}">
      </div>
    `;
  }  
  
  renderGraphMentalSpaceSelect() {
    const identity = this._currentIdentity || '{identity}';
    return `
      <select class="type-select-dropdown" id="graph-mental-space-select">
        ${MENTAL_SPACE_TYPES.map(type => {
          const label = type.label.replace('{identity}', identity);
          const selected = this.graphMentalSpace === type.value ? 'selected' : '';
          const disabled = type.disabled ? 'disabled' : '';
          return `<option value="${type.value}" ${selected} ${disabled}>${label}</option>`;
        }).join('')}
      </select>
    `;
  }
  
  renderStandardTypeOptions(fieldName, currentType) {
    return `
      <select class="type-select-dropdown" data-field="${fieldName}">
        <option value="qname" ${currentType === 'qname' ? 'selected' : ''}>QName</option>
        <option value="uri" ${currentType === 'uri' ? 'selected' : ''}>URI</option>
      </select>
    `;
  }
  
  renderObjectTypeOptions(currentType) {
    return `
      <select class="type-select-dropdown" data-field="object" id="object-type-select">
        <option value="qname" ${currentType === 'qname' ? 'selected' : ''}>QName</option>
        <option value="uri" ${currentType === 'uri' ? 'selected' : ''}>URI</option>
        <optgroup label="XSD types">
          <option value="xsd:string" ${currentType === 'xsd:string' ? 'selected' : ''}>xsd:string</option>
          <option value="xsd:integer" ${currentType === 'xsd:integer' ? 'selected' : ''}>xsd:integer</option>
          <option value="xsd:decimal" ${currentType === 'xsd:decimal' ? 'selected' : ''}>xsd:decimal</option>
          <option value="xsd:float" ${currentType === 'xsd:float' ? 'selected' : ''}>xsd:float</option>
          <option value="xsd:double" ${currentType === 'xsd:double' ? 'selected' : ''}>xsd:double</option>
          <option value="xsd:boolean" ${currentType === 'xsd:boolean' ? 'selected' : ''}>xsd:boolean</option>
          <option value="xsd:date" ${currentType === 'xsd:date' ? 'selected' : ''}>xsd:date</option>
          <option value="xsd:dateTime" ${currentType === 'xsd:dateTime' ? 'selected' : ''}>xsd:dateTime</option>
          <option value="xsd:time" ${currentType === 'xsd:time' ? 'selected' : ''}>xsd:time</option>
          <option value="xsd:gYear" ${currentType === 'xsd:gYear' ? 'selected' : ''}>xsd:gYear</option>
          <option value="xsd:duration" ${currentType === 'xsd:duration' ? 'selected' : ''}>xsd:duration</option>
          <option value="xsd:anyURI" ${currentType === 'xsd:anyURI' ? 'selected' : ''}>xsd:anyURI</option>
          <option value="xsd:base64Binary" ${currentType === 'xsd:base64Binary' ? 'selected' : ''}>xsd:base64Binary</option>
          <option value="xsd:hexBinary" ${currentType === 'xsd:hexBinary' ? 'selected' : ''}>xsd:hexBinary</option>
        </optgroup>
        <optgroup label="RDF types">
          <option value="rdf:HTML" ${currentType === 'rdf:HTML' ? 'selected' : ''}>rdf:HTML</option>
          <option value="rdf:XMLLiteral" ${currentType === 'rdf:XMLLiteral' ? 'selected' : ''}>rdf:XMLLiteral</option>
          <option value="rdf:JSON" ${currentType === 'rdf:JSON' ? 'selected' : ''}>rdf:JSON</option>
        </optgroup>
        <optgroup label="MMM types">
          <option value="mmmdt:markdown" ${currentType === 'mmmdt:markdown' ? 'selected' : ''}>mmmdt:markdown</option>
        </optgroup>
      </select>
    `;
  }
  
  renderSelectOptions(fieldName) {
    if (fieldName === 'predicate') {
      return COMMON_PROPERTIES.map(prop => 
        `<option value="${prop}">${prop}</option>`
      ).join('');
    }
    return '';
  }
  
  getPlaceholder(fieldName, fieldType) {
    // For datatypes, return appropriate placeholder
    if (fieldType && fieldType.startsWith('xsd:')) {
      const typeMap = {
        'xsd:integer': '42',
        'xsd:decimal': '3.14',
        'xsd:float': '3.14',
        'xsd:double': '2.71828',
        'xsd:boolean': 'true',
        'xsd:date': '2025-01-15',
        'xsd:dateTime': '2025-01-15T10:30:00',
        'xsd:time': '10:30:00',
        'xsd:gYear': '2025',
        'xsd:duration': 'P1Y2M3D',
        'xsd:anyURI': 'http://example.org',
        'xsd:base64Binary': 'SGVsbG8gV29ybGQ=',
        'xsd:hexBinary': '48656c6c6f',
        'xsd:string': 'text value'
      };
      return typeMap[fieldType] || 'value';
    }
    
    if (fieldType && (fieldType.startsWith('rdf:') || fieldType.startsWith('mmmdt:'))) {
      return 'formatted content';
    }
    
    const placeholders = {
      subject: {
        qname: 'ex:Alice',
        uri: 'http://example.org/Alice'
      },
      predicate: {
        qname: 'foaf:knows',
        uri: 'http://xmlns.com/foaf/0.1/knows'
      },
      object: {
        qname: 'ex:Bob',
        uri: 'http://example.org/Bob'
      }
    };
    return placeholders[fieldName]?.[fieldType] || '';
  }
  
  async loadPrefixesForm() {
    const container = this.shadowRoot.getElementById('prefixes-form-container');
    if (!container) return;
    
    // Check if prefixes-form custom element is defined
    if (customElements.get('prefixes-form')) {
      try {
        const prefixesForm = document.createElement('prefixes-form');
        
        // Listen for prefix events and update our internal _prefixes
        prefixesForm.addEventListener('prefix-added', (e) => {
          this._prefixes[e.detail.prefix] = e.detail.expansion;
        });
        
        prefixesForm.addEventListener('prefix-enabled', (e) => {
          this._prefixes[e.detail.prefix] = e.detail.expansion;
        });
        
        prefixesForm.addEventListener('prefix-disabled', (e) => {
          delete this._prefixes[e.detail.prefix];
        });
        
        container.innerHTML = '';
        container.appendChild(prefixesForm);
        this._prefixesFormElement = prefixesForm;
        
        setTimeout(() => {
          this.syncPrefixesForm();
        }, 50);
        
        return;
      } catch (err) {
        console.warn('Error loading prefixes-form:', err);
      }
    }
    
    // Fallback: show a styled list of prefixes
    container.innerHTML = `
    <h3 style="margin: 0 0 15px 0; color: #2196F3;">Current Prefixes</h3>
    <div class="prefix-list">
      ${Object.entries(this._prefixes).map(([prefix, url]) => `
      <div class="prefix-item">
      <span class="prefix-name">${prefix}:</span>
      <span class="prefix-url">${url}</span>
      </div>
      `).join('')}
    </div>
    <p style="margin-top: 20px; font-size: 12px; color: #666;">
      To edit prefixes, install the <code>prefixes-form</code> component.
    </p>
  `;
  }

  syncPrefixesForm() {
    if (!this._prefixesFormElement) return;
    
    const formPrefixes = this._prefixesFormElement.getSelectedPrefixes();
    
    for (const [prefix, expansion] of Object.entries(this._prefixes)) {
      if (!formPrefixes[prefix]) {
        this._prefixesFormElement.addPrefix(prefix, expansion);
      }
    }
  }
  
  attachEventListeners() {
    // Mode toggle buttons
    const tinyBtn = this.shadowRoot.getElementById('tiny-btn');
    if (tinyBtn) {
      tinyBtn.addEventListener('click', () => this.toggleTinyMode());
    }
    
    const formBtn = this.shadowRoot.getElementById('form-btn');
    if (formBtn) {
      formBtn.addEventListener('click', () => this.toggleTinyMode());
    }
    
    const nanoBtn = this.shadowRoot.getElementById('nano-btn');
    if (nanoBtn) {
      nanoBtn.addEventListener('click', () => this.toggleNanoMode());
    }
    
    // Submit buttons (both regular and tiny)
    const submitBtn = this.shadowRoot.getElementById('submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => this.handleSubmit(e));
    }
    
    const submitBtnTiny = this.shadowRoot.getElementById('submit-btn-tiny');
    if (submitBtnTiny) {
      submitBtnTiny.addEventListener('click', (e) => this.handleSubmit(e));
    }
    
    // Clear button
    const clearBtn = this.shadowRoot.getElementById('clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }
    
    // Type select dropdowns (except graph mental space)
    this.shadowRoot.querySelectorAll('.type-select-dropdown[data-field]').forEach(select => {
      select.addEventListener('change', this.handleTypeChange.bind(this));
    });
    
    // Graph mental space select
    const graphMentalSpaceSelect = this.shadowRoot.getElementById('graph-mental-space-select');
    if (graphMentalSpaceSelect) {
      graphMentalSpaceSelect.addEventListener('change', this.handleGraphMentalSpaceChange.bind(this));
    }
    
    // Graph path input
    const graphPathInput = this.shadowRoot.getElementById('graph-path-input');
    if (graphPathInput) {
      graphPathInput.addEventListener('input', (e) => {
        this.handleGraphPathChange(e);
        this.updateFieldValidation();
      });
    }
    
    // Control toggle buttons
    this.shadowRoot.querySelectorAll('.control-toggle').forEach(btn => {
      btn.addEventListener('click', this.handleControlToggle.bind(this));
    });
    
    // Field inputs - ALL fields (subject, predicate, object)
    ['subject', 'predicate', 'object'].forEach(field => {
      const input = this.shadowRoot.getElementById(`${field}-input`);
      if (input) {
        input.addEventListener('input', (e) => {
          this.fieldValues[field] = e.target.value;
          this.updateFieldValidation();
          
          // Emit field-changed event
          this.dispatchEvent(new CustomEvent('field-changed', {
            detail: { field, value: e.target.value },
            bubbles: true,
            composed: true
          }));
          
          this.validate();
        });
        
        // Tiny mode keyboard navigation
        input.addEventListener('keydown', (e) => {
          const container = this.shadowRoot.querySelector('.quad-form-container');
          const mode = container?.dataset.mode;
          
          if (mode === 'tiny') {
            this.handleTinyKeydown(e, field);
          } else if (mode === 'nano' && field === 'object' && e.key === 'Tab') {
            // NANO MODE: Tab key triggers submit
            e.preventDefault();
            this.handleSubmit(e);
          }
        });
        
        // Nano mode - blur triggers submit
        input.addEventListener('blur', (e) => {
          const container = this.shadowRoot.querySelector('.quad-form-container');
          const mode = container?.dataset.mode;
          
          if (mode === 'nano' && field === 'object') {
            this.handleSubmit(e);
          }
        });
      }
      
      // Field selects
      const select = this.shadowRoot.getElementById(`${field}-select`);
      if (select) {
        select.addEventListener('change', (e) => {
          this.fieldValues[field] = e.target.value;
          this.updateFieldValidation();
          
          this.dispatchEvent(new CustomEvent('field-changed', {
            detail: { field, value: e.target.value },
            bubbles: true,
            composed: true
          }));
          
          this.validate();
        });
      }
    });
    
    // Object textarea
    const objectTextarea = this.shadowRoot.getElementById('object-textarea');
    if (objectTextarea) {
      objectTextarea.addEventListener('input', (e) => {
        this.fieldValues.object = e.target.value;
        this.updateFieldValidation();
        
        this.dispatchEvent(new CustomEvent('field-changed', {
          detail: { field: 'object', value: e.target.value },
          bubbles: true,
          composed: true
        }));
        
        this.validate();
      });
      
      objectTextarea.addEventListener('keydown', (e) => {
        const container = this.shadowRoot.querySelector('.quad-form-container');
        const mode = container?.dataset.mode;
        
        if (mode === 'tiny') {
          this.handleTinyKeydown(e, 'object');
        } else if (mode === 'nano' && e.key === 'Tab') {
          // NANO MODE: Tab key triggers submit (even in textarea)
          e.preventDefault();
          this.handleSubmit(e);
        }
      });
      
      objectTextarea.addEventListener('blur', (e) => {
        const container = this.shadowRoot.querySelector('.quad-form-container');
        const mode = container?.dataset.mode;
        
        if (mode === 'nano') {
          this.handleSubmit(e);
        }
      });
    }
    
    // Language input
    const languageInput = this.shadowRoot.getElementById('language-input');
    if (languageInput) {
      languageInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/^@/, '').toLowerCase();
        if (value.length === 1) {
          e.target.value = '';
          this.objectLanguage = '';
        } else {
          this.objectLanguage = value;
        }
      });
    }
    
    // Prefixes button
    const prefixesBtn = this.shadowRoot.getElementById('prefixes-btn');
    if (prefixesBtn) {
      prefixesBtn.addEventListener('click', () => this.showPrefixes());
    }
    
    const closePrefixes = this.shadowRoot.getElementById('close-prefixes');
    if (closePrefixes) {
      closePrefixes.addEventListener('click', () => this.hidePrefixes());
    }
    
    // Close overlay on backdrop click
    const overlay = this.shadowRoot.getElementById('prefixes-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target.id === 'prefixes-overlay') {
          this.hidePrefixes();
        }
      });
    }
  }
  
  handleTinyKeydown(e, field) {
    // Check if we're in a textarea (for object field with markdown/string types)
    const isTextarea = e.target.tagName === 'TEXTAREA';
    
    // Tab key - control tab order
    if (e.key === 'Tab') {
      e.preventDefault();
      
      if (e.shiftKey) {
        // Shift+Tab - go backwards
        if (field === 'subject') {
          this.shadowRoot.getElementById('submit-btn-tiny').focus();
        } else if (field === 'predicate') {
          this.shadowRoot.getElementById('subject-input').focus();
        } else if (field === 'object') {
          this.shadowRoot.getElementById('predicate-input').focus();
        }
      } else {
        // Tab - go forwards
        if (field === 'subject') {
          this.shadowRoot.getElementById('predicate-input').focus();
        } else if (field === 'predicate') {
          // Focus object - could be input or textarea
          if (this.objectUsesTextarea) {
            this.shadowRoot.getElementById('object-textarea').focus();
          } else {
            this.shadowRoot.getElementById('object-input').focus();
          }
        } else if (field === 'object') {
          this.shadowRoot.getElementById('form-btn').focus();
        }
      }
      return;
    }
    
    // ESC - toggle field type (not for textarea since it might have content)
    if (e.key === 'Escape' && !isTextarea) {
      e.preventDefault();
      this.cycleTinyFieldType(field);
      return;
    }
    
    // Up/Down arrows - previous/next picker value (not for textarea)
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isTextarea) {
      e.preventDefault();
      const direction = e.key === 'ArrowUp' ? -1 : 1;
      this.cycleTinyPicker(field, direction);
      return;
    }
    
    // Enter - submit (but only if not in textarea, where Enter should insert newline)
    if (e.key === 'Enter' && !isTextarea) {
      e.preventDefault();
      this.handleSubmit(e);
      return;
    }
    
    // Ctrl+Enter or Cmd+Enter in textarea - submit
    if (e.key === 'Enter' && isTextarea && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.handleSubmit(e);
      return;
    }
  }
  
  updateTinyDecorators() {
    // Update decorators based on tinyFieldTypes
    ['subject', 'predicate', 'object'].forEach(field => {
      const type = this.tinyFieldTypes[field];
      const leftDecorator = this.shadowRoot.querySelector(`.tiny-decorator.${field}-left`);
      const rightDecorator = this.shadowRoot.querySelector(`.tiny-decorator.${field}-right`);
      
      if (type === 'uri') {
        if (leftDecorator) leftDecorator.textContent = '<';
        if (rightDecorator) rightDecorator.textContent = '>';
      } else if (type === 'string') {
        if (leftDecorator) leftDecorator.textContent = '"';
        if (rightDecorator) rightDecorator.textContent = '"';
      } else {
        // qname - no decorators
        if (leftDecorator) leftDecorator.textContent = '';
        if (rightDecorator) rightDecorator.textContent = '';
      }
    });
  }
  
  cycleTinyFieldType(field) {
    const current = this.tinyFieldTypes[field];
    
    if (field === 'object') {
      // Object cycles: qname -> uri -> string -> qname
      if (current === 'qname') {
        this.tinyFieldTypes[field] = 'uri';
      } else if (current === 'uri') {
        this.tinyFieldTypes[field] = 'string';
      } else {
        this.tinyFieldTypes[field] = 'qname';
      }
    } else {
      // Subject/Predicate toggle: qname <-> uri
      this.tinyFieldTypes[field] = current === 'qname' ? 'uri' : 'qname';
    }
    
    // Convert value if needed
    const currentValue = this.fieldValues[field];
    if (currentValue) {
      if (this.tinyFieldTypes[field] === 'uri' && current === 'qname') {
        this.fieldValues[field] = this.expandQName(currentValue);
      } else if (this.tinyFieldTypes[field] === 'qname' && current === 'uri') {
        this.fieldValues[field] = this.contractUri(currentValue);
      }
    }
    
    // Update decorators
    this.updateTinyDecorators();
    
    // Update the input value
    const input = this.shadowRoot.getElementById(`${field}-input`);
    if (input) {
      input.value = this.fieldValues[field];
      input.focus();
      this.updateFieldValidation();
    }
  }
  
  cycleTinyPicker(field, direction) {
    const values = this.getPickerValues(field);
    if (values.length === 0) return;
    
    const currentIndex = this.tinyPickerIndices[field];
    let newIndex = currentIndex + direction;
    
    // Wrap around
    if (newIndex < 0) newIndex = values.length - 1;
    if (newIndex >= values.length) newIndex = 0;
    
    this.tinyPickerIndices[field] = newIndex;
    this.fieldValues[field] = values[newIndex];
    
    const input = this.shadowRoot.getElementById(`${field}-input`);
    if (input) {
      input.value = values[newIndex];
      this.updateFieldValidation();
    }
  }
  
  handleGraphPathChange(e) {
    const path = e.target.value;
    this.graphPath = path;
    
    // Update full graph value
    const prefix = this.getGraphPrefix();
    this.fieldValues.graph = prefix + path;
    
    this.validate();
  }
  
  handleGraphMentalSpaceChange(e) {
    const newSpace = e.target.value;
    const oldSpace = this.graphMentalSpace;
    
    // Preserve path if both are mntl: types
    if (oldSpace.startsWith('mntl:') && newSpace.startsWith('mntl:')) {
      // Keep existing path
    } else {
      // Reset path for non-mntl transitions
      this.graphPath = newSpace === 'mntl:publ' ? '/scratch' : '/path';
    }
    
    this.graphMentalSpace = newSpace;
    
    // Update graph prefix and input
    const graphPathInput = this.shadowRoot.getElementById('graph-path-input');
    
    const prefix = this.getGraphPrefix();
    
    if (graphPathInput) {
      if (newSpace === 'http:' || newSpace === 'https:') {
        graphPathInput.placeholder = '//example.org/graph';
        if (this.graphPath === '/scratch' || this.graphPath === '/path') {
          this.graphPath = '//example.org/graph';
          graphPathInput.value = this.graphPath;
        }
      } else {
        graphPathInput.placeholder = '/path';
      }
    }
    
    // Update full graph value
    this.fieldValues.graph = prefix + this.graphPath;
    
    // Update the hint text directly without re-rendering
    const graphHint = this.shadowRoot.querySelector('.graph-hint');
    if (graphHint) {
      graphHint.textContent = this.getMentalSpaceDescription();
    }
    
    this.validate();
  }
  
  handleTypeChange(e) {
    const field = e.target.dataset.field;
    const newType = e.target.value;
    const oldType = this.fieldTypes[field];
    
    this.fieldTypes[field] = newType;
    
    // Update placeholder
    const input = this.shadowRoot.getElementById(`${field}-input`);
    if (input) {
      input.placeholder = this.getPlaceholder(field, newType);
    }
    
    // Convert value between QName and URI if switching between those modes
    if (!field.includes('object') && input) {
      const currentValue = input.value || this.fieldValues[field];
      
      if (oldType === 'qname' && newType === 'uri') {
        const expanded = this.expandQName(currentValue);
        input.value = expanded;
        this.fieldValues[field] = expanded;
      } else if (oldType === 'uri' && newType === 'qname') {
        const contracted = this.contractUri(currentValue);
        input.value = contracted;
        this.fieldValues[field] = contracted;
      }
    }
    
    // Handle object field special cases
    if (field === 'object') {
      const objectInput = this.shadowRoot.getElementById('object-input');
      const objectTextarea = this.shadowRoot.getElementById('object-textarea');
      const languageInput = this.shadowRoot.getElementById('language-input');
      
      // Get current value from whichever input is active
      const currentValue = objectInput?.value || objectTextarea?.value || this.fieldValues.object;
      
      // Convert between QName and URI for object field if needed
      let valueToUse = currentValue;
      if (oldType === 'qname' && newType === 'uri') {
        valueToUse = this.expandQName(currentValue);
      } else if (oldType === 'uri' && newType === 'qname') {
        valueToUse = this.contractUri(currentValue);
      }
      // For all other transitions (literal to literal), preserve the value as-is
      
      // Update the internal state
      this.fieldValues.object = valueToUse;
      
      // Determine if we should use textarea
      const shouldUseTextarea = newType === 'xsd:string' || 
                                newType === 'rdf:HTML' || 
                                newType === 'rdf:XMLLiteral' || 
                                newType === 'rdf:JSON' || 
                                newType === 'mmmdt:markdown';
      
      this.objectUsesTextarea = shouldUseTextarea;
      
      // Show/hide appropriate input and set the value
      if (shouldUseTextarea) {
        if (objectInput) objectInput.classList.add('hidden');
        if (objectTextarea) {
          objectTextarea.classList.remove('hidden');
          objectTextarea.value = valueToUse;
        }
        if (languageInput) {
          languageInput.disabled = false;
        }
      } else {
        if (objectTextarea) objectTextarea.classList.add('hidden');
        if (objectInput) {
          objectInput.classList.remove('hidden');
          objectInput.value = valueToUse;
        }
      }
      
      // Handle QName/URI vs literal behavior
      const isQNameOrUri = newType === 'qname' || newType === 'uri';
      
      if (isQNameOrUri) {
        if (languageInput) {
          languageInput.disabled = true;
          languageInput.value = '';
        }
        this.objectDatatype = '';
        this.objectLanguage = '';
      } else {
        if (!shouldUseTextarea && languageInput) {
          languageInput.disabled = true;
        }
        this.objectDatatype = newType;
        this.updateObjectInputType();
      }
    }
    
    this.updateFieldValidation();
    this.validate();
  }

  handleControlToggle(e) {
    const button = e.target.closest('.control-toggle');
    if (!button) return;
    
    const field = button.dataset.field;
    const currentControl = this.fieldControls[field];
    const newControl = currentControl === 'input' ? 'select' : 'input';
    
    this.fieldControls[field] = newControl;
    
    // Update button text
    button.innerHTML = newControl === 'input' ? '<strong>input</strong>/picker' : 'input/<strong>picker</strong>';
    
    // Show/hide controls
    const input = this.shadowRoot.getElementById(`${field}-input`);
    const select = this.shadowRoot.getElementById(`${field}-select`);
    
    if (input && select) {
      if (newControl === 'input') {
        input.classList.remove('hidden');
        select.classList.add('hidden');
      } else {
        input.classList.add('hidden');
        select.classList.remove('hidden');
      }
    }
    
    this.validate();
  }
  
  updateObjectInputType() {
    const objectInput = this.shadowRoot.getElementById('object-input');
    const datatype = this.objectDatatype;
    
    if (!objectInput) return;
    
    // Reset attributes
    objectInput.removeAttribute('step');
    objectInput.removeAttribute('pattern');
    
    // Set HTML5 input type based on datatype
    const html5Type = XSD_TO_HTML5[datatype];
    if (html5Type) {
      objectInput.type = html5Type;
      
      // Special handling for numbers
      if (datatype === 'xsd:integer') {
        objectInput.step = '1';
      } else if (datatype === 'xsd:decimal' || datatype === 'xsd:float' || datatype === 'xsd:double') {
        objectInput.step = 'any';
      }
    } else if (datatype === 'xsd:base64Binary') {
      objectInput.type = 'text';
      objectInput.pattern = '^[A-Za-z0-9+/=]+$';
    } else if (datatype === 'xsd:hexBinary') {
      objectInput.type = 'text';
      objectInput.pattern = '^[0-9A-Fa-f]+$';
    } else {
      objectInput.type = 'text';
    }
  }
  
  validate() {
    const container = this.shadowRoot.querySelector('.quad-form-container');
    const mode = container?.dataset.mode || 'full';
    const errors = [];
    
    if (mode === 'nano') {
      // Only validate object in nano mode
      if (!this.fieldValues.object) errors.push('Object is required');
    } else if (mode === 'tiny') {
      // Skip graph validation in tiny mode
      if (!this.fieldValues.subject) errors.push('Subject is required');
      if (!this.fieldValues.predicate) errors.push('Predicate is required');
      if (!this.fieldValues.object) errors.push('Object is required');
    } else {
      // Full validation in full mode
      if (!this.fieldValues.subject) errors.push('Subject is required');
      if (!this.fieldValues.predicate) errors.push('Predicate is required');
      if (!this.fieldValues.object) errors.push('Object is required');
      if (!this.fieldValues.graph) errors.push('Graph is required');
    }
    
    const valid = errors.length === 0;
    
    // Update submit buttons
    const submitBtn = this.shadowRoot.getElementById('submit-btn');
    const submitBtnTiny = this.shadowRoot.getElementById('submit-btn-tiny');
    if (submitBtn) submitBtn.disabled = !valid;
    if (submitBtnTiny) submitBtnTiny.disabled = !valid;
    
    // Emit validation event
    this.dispatchEvent(new CustomEvent('validation-changed', {
      detail: { valid, errors },
      bubbles: true,
      composed: true
    }));
    
    return valid;
  }
  
  async handleSubmit(e) {
    e.preventDefault();
    
    const container = this.shadowRoot.querySelector('.quad-form-container');
    const mode = container?.dataset.mode || 'full';
    
    // For nano mode, use default values for missing fields
    if (mode === 'nano') {
      if (!this.fieldValues.object || this.fieldValues.object.trim() === '') {
        return;
      }
      
      // Set defaults if not present
      if (!this.fieldValues.subject) this.fieldValues.subject = 'ex:DefaultSubject';
      if (!this.fieldValues.predicate) this.fieldValues.predicate = 'rdfs:comment';
      if (!this.fieldValues.graph) this.fieldValues.graph = this._defaultGraph;
    } else if (mode === 'tiny') {
      // For tiny mode, use default graph if not present
      if (!this.fieldValues.graph) this.fieldValues.graph = this._defaultGraph;
      
      if (!this.validate()) {
        return;
      }
    } else {
      // Full mode - normal validation
      if (!this.validate()) {
        return;
      }
    }
    
    // Build quad in FLAT format
    const quad = {
      s: this._expandQNames ? this.expandQName(this.fieldValues.subject) : this.fieldValues.subject,
      p: this._expandQNames ? this.expandQName(this.fieldValues.predicate) : this.fieldValues.predicate,
      o: this._expandQNames ? this.expandQName(this.fieldValues.object) : this.fieldValues.object,
      g: this._expandQNames ? this.expandQName(this.fieldValues.graph) : this.fieldValues.graph,
      at: new Date().toISOString(),
      by: this._currentIdentity || 'anonymous'
    };
    
    // Add datatype if present and not xsd:string
    if (this.objectDatatype && this.objectDatatype !== 'xsd:string') {
      quad.d = this.objectDatatype;
    }
    
    // Add language if present
    if (this.objectLanguage) {
      quad.l = this.objectLanguage;
    }
    
    // Emit event
    this.dispatchEvent(new CustomEvent('quad-submitted', {
      detail: quad,
      bubbles: true,
      composed: true
    }));
    
    // If mmmServer is available, submit directly
    if (this._mmmServer) {
      try {
        await this._mmmServer.addQuad(quad);
        // Never auto-clear - user can manually use Clear button if desired
      } catch (err) {
        console.error('Failed to submit quad:', err);
        this.dispatchEvent(new CustomEvent('quad-error', {
          detail: { error: err },
          bubbles: true,
          composed: true
        }));
      }
    }
    // Form stays populated after submit - use Clear button to clear manually
  }
  
  expandQName(value) {
    if (!value || value.includes('://')) {
      return value;
    }
    
    const colonIndex = value.indexOf(':');
    if (colonIndex === -1) {
      return value;
    }
    
    const prefix = value.substring(0, colonIndex);
    
    // CRITICAL: MMM URN schemes are complete identifiers, not CURIEs!
    if (MMM_URN_SCHEMES.has(prefix) || STANDARD_SCHEMES.has(prefix)) {
      return value;
    }
    
    const localPart = value.substring(colonIndex + 1);
    
    if (this._prefixes[prefix]) {
      return this._prefixes[prefix] + localPart;
    }
    
    return value;
  }
  
  contractUri(value) {
    // Try to contract a full URI to a CURIE
    for (const [prefix, expansion] of Object.entries(this._prefixes)) {
      if (value.startsWith(expansion)) {
        return prefix + ':' + value.substring(expansion.length);
      }
    }
    return value;
  }
  
  updateAttribution() {
    const atValue = this.shadowRoot?.getElementById('at-value');
    const byValue = this.shadowRoot?.getElementById('by-value');
    
    if (atValue) {
      atValue.textContent = new Date().toISOString();
    }
    
    if (byValue) {
      byValue.textContent = this._currentIdentity || 'not logged in';
    }
    
    // Update every second
    if (!this._attributionInterval) {
      this._attributionInterval = setInterval(() => {
        const atValue = this.shadowRoot?.getElementById('at-value');
        if (atValue) {
          atValue.textContent = new Date().toISOString();
        }
      }, 1000);
    }
  }
  
  showPrefixes() {
    const overlay = this.shadowRoot.getElementById('prefixes-overlay');
    if (overlay) {
      overlay.classList.add('visible');
      
      if (!this._prefixesFormLoaded) {
        this.loadPrefixesForm();
        this._prefixesFormLoaded = true;
      } else {
        this.syncPrefixesForm();
      }
    }
  }
  
  hidePrefixes() {
    const overlay = this.shadowRoot.getElementById('prefixes-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
    }
  }
  
  // Public API
  setField(name, value) {
    this.fieldValues[name] = value;
    
    const input = this.shadowRoot.getElementById(`${name}-input`);
    const select = this.shadowRoot.getElementById(`${name}-select`);
    const textarea = this.shadowRoot.getElementById(`${name}-textarea`);
    
    if (this.fieldControls[name] === 'input' && input) {
      input.value = value;
    } else if (this.fieldControls[name] === 'select' && select) {
      select.value = value;
    }
    
    if (name === 'object' && textarea) {
      textarea.value = value;
    }
    
    if (name === 'graph') {
      const prefix = this.getGraphPrefix();
      if (value.startsWith(prefix)) {
        const path = value.substring(prefix.length);
        const graphPathInput = this.shadowRoot.getElementById('graph-path-input');
        if (graphPathInput) {
          graphPathInput.value = path;
        }
        this.graphPath = path;
      }
    }
    
    this.validate();
  }
  
  getField(name) {
    return this.fieldValues[name] || '';
  }
  
  populateFromEntity(entity, role, mode) {
    if (mode === 'reuse') {
      this.setField(role, entity);
    } else if (mode === 'meta') {
      this.setField('subject', entity);
    }
  }
  
  clear() {
    const container = this.shadowRoot.querySelector('.quad-form-container');
    const mode = container?.dataset.mode || 'full';
    
    this.fieldValues = {
      subject: '',
      predicate: '',
      object: '',
      graph: this._defaultGraph
    };
    
    this.fieldTypes = {
      subject: 'uri',
      predicate: 'qname',
      object: 'uri',
      graph: 'qname'
    };
    
    this.objectDatatype = '';
    this.objectLanguage = '';
    this.objectUsesTextarea = false;
    
    // Clear ALL inputs (they all exist in unified DOM)
    ['subject', 'predicate', 'object'].forEach(field => {
      const input = this.shadowRoot.getElementById(`${field}-input`);
      if (input) {
        input.value = '';
        input.style.backgroundColor = '';
      }
      
      const select = this.shadowRoot.getElementById(`${field}-select`);
      if (select) {
        select.value = '';
      }
    });
    
    const textarea = this.shadowRoot.getElementById('object-textarea');
    if (textarea) {
      textarea.value = '';
      textarea.style.backgroundColor = '';
    }
    
    const graphPathInput = this.shadowRoot.getElementById('graph-path-input');
    if (graphPathInput) {
      graphPathInput.value = this.graphPath;
      graphPathInput.style.backgroundColor = '';
    }
    
    // Reset type dropdowns
    this.shadowRoot.querySelectorAll('.type-select-dropdown[data-field]').forEach(select => {
      const field = select.dataset.field;
      if (field) {
        select.value = this.fieldTypes[field];
      }
    });
    
    const languageInput = this.shadowRoot.getElementById('language-input');
    if (languageInput) {
      languageInput.value = '';
      languageInput.disabled = true;
    }
    
    this.validate();
  }
  
  disconnectedCallback() {
    if (this._attributionInterval) {
      clearInterval(this._attributionInterval);
      this._attributionInterval = null;
    }
  }
}

// Register the custom element
customElements.define('quad-form', QuadFormWC);

// Export for ES modules
export { QuadFormWC };
