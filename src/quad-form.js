/**
 * QuadFormWC - Web Component for RDF Quad Creation
 * Drop-in replacement for QuadForm.js with addtripleform.js behavior
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
  { value: 'mntl:lock', label: 'mntl:lock/{identity}', disabled: true},
  { value: 'mntl:hold', label: 'mntl:hold/{identity}', disabled: true },
  { value: 'mntl:gate', label: 'mntl:gate/{identity}', disabled: false },
  { value: 'mntl:open', label: 'mntl:open/{identity}', disabled: false },
  { value: 'mntl:publ', label: 'mntl:publ', disabled: false }
  // Disaabled (but previously supported)
  // It bears consideration whether there is any meaning in "writing to http"
  //{ value: 'http:', label: 'http:', disabled: false },
  //{ value: 'https:', label: 'https:', disabled: false }
];

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
    this.objectDatatype = '';
    this.objectLanguage = '';
    this.objectUsesTextarea = false;
    
    // Graph mental space tracking
    this.graphMentalSpace = 'mntl:publ';
    this.graphPath = '/scratch';
    
    // Tiny mode state
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
    this._currentIdentity = null;
    this._expandQNames = true;
    this._defaultGraph = 'mntl:publ/scratch';
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
    // Re-render to update identity placeholders
    if (this.shadowRoot.querySelector('.quad-form-container')) {
      this.render();
      this.attachEventListeners();
      this.loadPrefixesForm();
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
  
  validateField(field, value, type) {
    if (!value || value.trim() === '') {
      return false;
    }
    
    if (type === 'qname') {
      // QName format: prefix:localName
      const qnameRegex = /^[a-zA-Z_][\w-]*:[a-zA-Z_][\w-]*$/;
      if (!qnameRegex.test(value)) {
        return false;
      }
      // Check if prefix exists
      const prefix = value.split(':')[0];
      return this._prefixes.hasOwnProperty(prefix);
    } else if (type === 'uri') {
      // URI must contain ://
      return value.includes('://');
    } else if (type === 'string') {
      // Strings are always valid if not empty
      return true;
    } else {
      // For other types (xsd:*), accept any non-empty value
      return true;
    }
  }
  
  updateFieldValidation() {
    if (this.tinyMode) {
      // Validate tiny mode fields
      ['subject', 'predicate', 'object'].forEach(field => {
        const input = this.shadowRoot.getElementById(`tiny-${field}`);
        if (input) {
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
  
  toggleTinyMode() {
    const container = this.shadowRoot.querySelector('.quad-form-container');
    
    if (!this.tinyMode) {
      // Entering tiny mode
      this.tinyMode = true;
      
      // Set all fields to qname input mode for tiny
      this.tinyFieldTypes = {
        subject: 'qname',
        predicate: 'qname',
        object: 'qname'
      };
      
      // Add transitioning class
      container.classList.add('transitioning-to-tiny');
      
      // After animation, update DOM
      setTimeout(() => {
        container.classList.remove('transitioning-to-tiny');
        container.classList.add('tiny-mode');
        this.renderContent();
        this.attachEventListeners();
        
        // Focus first field
        setTimeout(() => {
          const firstInput = this.shadowRoot.getElementById('tiny-subject');
          if (firstInput) firstInput.focus();
        }, 50);
      }, 400);
      
    } else {
      // Exiting tiny mode
      this.tinyMode = false;
      
      // Add transitioning class
      container.classList.add('transitioning-to-full');
      container.classList.remove('tiny-mode');
      
      // After animation, update DOM
      setTimeout(() => {
        container.classList.remove('transitioning-to-full');
        this.renderContent();
        this.attachEventListeners();
        this.loadPrefixesForm();
      }, 400);
    }
  }
  
  render() {
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
        
        /* Animation states */
        .quad-form-container.transitioning-to-tiny .full-mode-content {
          opacity: 0;
          transform: scale(0.95);
        }
        
        .quad-form-container.transitioning-to-full .tiny-mode-content {
          opacity: 0;
          transform: scale(0.95);
        }
        
        .full-mode-content,
        .tiny-mode-content {
          transition: opacity 0.4s ease-in-out, transform 0.4s ease-in-out;
        }

        
        .quad-form-container.tiny-mode .full-mode-content {
          display: none;
        }
        
        .quad-form-container:not(.tiny-mode) .tiny-mode-content {
          display: none;
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
          min-width: 16ch;
        }
        
        .graph-path-input:focus {
          outline: none;
        }
        
        .hidden {
          display: none;
        }
        
        /* Tiny mode styles */
        .tiny-line {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        
        .tiny-field-wrapper {
          display: inline-flex;
          align-items: center;
        }
        
        .tiny-decorator {
          font-weight: 900;
          font-size: 16px;
          color: #666;
        }
        
        .tiny-input {
          border: none;
          border-bottom: 2px solid #ddd;
          font-family: monospace;
          font-size: 14px;
          padding: 4px 8px;
          min-width: 16ch;
        }
        
        .tiny-input:focus {
          outline: none;
          border-bottom-color: #4CAF50;
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
        
        .quad-form-container.tiny-mode .form-actions {
          border-top: none;
          padding-top: 15px;
        }
        
        .submit-btn, .submit-btn-tiny, .clear-btn, .tiny-btn, .form-btn {
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
          display: none;
        }
        
        .form-btn {
          background: #2196F3;
          color: white;
        }
        
        .tiny-btn:hover, .form-btn:hover {
          background: #1976D2;
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
      </style>
      
      <div class="quad-form-container">
        <div class="content-wrapper"></div>
        
        <div class="prefixes-overlay" id="prefixes-overlay">
          <div class="prefixes-container">
            <button class="close-prefixes" id="close-prefixes">✕</button>
            <div id="prefixes-form-container"></div>
          </div>
        </div>
      </div>
    `;
    
    this.renderContent();
    this.updateAttribution();
  }
  
  renderContent() {
    const wrapper = this.shadowRoot.querySelector('.content-wrapper');
    if (!wrapper) return;
    
    if (this.tinyMode) {
      wrapper.innerHTML = `
        <div class="tiny-mode-content">
          <div class="tiny-line">
            ${this.renderTinyField('subject')}
            ${this.renderTinyField('predicate')}
            ${this.renderTinyField('object')}
            <span class="tiny-period">.</span>
          </div>
          
          <div class="form-actions">
            <button type="button" class="form-btn" id="form-btn" tabindex="4">Form</button>
            <button type="button" class="clear-btn" id="clear-btn" tabindex="5">Clear</button>
            <button type="button" class="submit-btn-tiny" id="submit-btn" tabindex="6">+</button>
          </div>
        </div>
      `;
    } else {
      wrapper.innerHTML = `
        <div class="full-mode-content">
          <div class="form-header">
            <h3>Say It</h3>
            <div class="attribution">
              <span><strong>at:</strong> <span id="at-value">—</span></span>
              <span><strong>by:</strong> <span id="by-value">${this._currentIdentity || 'not logged in'}</span></span>
            </div>
            <button class="prefixes-btn" id="prefixes-btn">Prefixes</button>
          </div>
          
          <form id="quad-form">
            ${this.renderField('subject', 'Subject')}
            ${this.renderField('predicate', 'Predicate')}
            ${this.renderField('object', 'Object')}
            ${this.renderField('graph', 'Graph')}
            
            <div class="form-actions">
              <button type="button" class="tiny-btn" id="tiny-btn">Tiny</button>
              <button type="button" class="clear-btn" id="clear-btn">Clear</button>
              <button type="submit" class="submit-btn" id="submit-btn">Submit Quad</button>
            </div>
          </form>
        </div>
      `;
    }
  }
  
  renderTinyField(field) {
    const type = this.tinyFieldTypes[field];
    const value = this.fieldValues[field] || '';
    
    let leftDecorator = '';
    let rightDecorator = '';
    let placeholder = '';
    
    if (type === 'uri') {
      leftDecorator = '<span class="tiny-decorator">&lt;</span>';
      rightDecorator = '<span class="tiny-decorator">&gt;</span>';
      placeholder = 'http://example.org/' + field;
    } else if (type === 'string') {
      leftDecorator = '<span class="tiny-decorator">"</span>';
      rightDecorator = '<span class="tiny-decorator">"</span>';
      placeholder = 'text value';
    } else {
      // qname
      placeholder = field === 'predicate' ? 'foaf:knows' : 'ex:' + field.charAt(0).toUpperCase() + field.slice(1);
    }
    
    const langField = (field === 'object' && type === 'string') 
      ? `<span class="tiny-decorator">@</span><input type="text" class="tiny-lang" id="tiny-lang" value="${this.objectLanguage}" maxlength="3" tabindex="4">`
      : '';
    
    const tabIndex = field === 'subject' ? '1' : field === 'predicate' ? '2' : '3';
    
    return `
      <div class="tiny-field-wrapper">
        ${leftDecorator}
        <input type="text" 
               class="tiny-input" 
               id="tiny-${field}"
               data-field="${field}"
               value="${value}"
               placeholder="${placeholder}"
               tabindex="${tabIndex}">
        ${rightDecorator}
        ${langField}
      </div>
    `;
  }
  
  renderField(fieldName, label) {
    const fieldType = this.fieldTypes[fieldName];
    const controlType = this.fieldControls[fieldName];
    const isObject = fieldName === 'object';
    const isGraph = fieldName === 'graph';
    
    return `
      <div class="field-group">
        <div class="field-controls">
          <label class="field-label">${label}</label>
          ${isGraph ? '' : this.renderTypeSelect(fieldName, fieldType, isObject)}
          
          <div class="spacer"></div>
          
          ${isObject && !this.objectUsesTextarea ? `
            <input type="text" 
                   class="language-input" 
                   id="language-input"
                   placeholder="en"
                   title="Language tag (e.g., en, fr, es)"
                   maxlength="3"
                   pattern="^([a-z]{2}|[a-z]{3})?$"
                   ${!this.objectUsesTextarea ? 'disabled' : ''}
                   value="${this.objectLanguage}">
          ` : ''}
          
          ${!isGraph ? `
            <button type="button" class="control-toggle" data-field="${fieldName}">
              ${controlType === 'input' ? '<strong>input</strong>/picker' : 'input/<strong>picker</strong>'}
            </button>
          ` : ''}
        </div>
        
        ${!isGraph ? `
          <input type="text" 
                 class="field-input ${controlType === 'select' || (isObject && this.objectUsesTextarea) ? 'hidden' : ''}" 
                 id="${fieldName}-input"
                 data-field="${fieldName}"
                 placeholder="${this.getPlaceholder(fieldName, fieldType)}"
                 value="${this.fieldValues[fieldName]}">
          
          <select class="field-select ${controlType === 'input' ? 'hidden' : ''}" 
                  id="${fieldName}-select"
                  data-field="${fieldName}">
            <option value="">Select ${label}...</option>
            ${this.renderSelectOptions(fieldName)}
          </select>
          
          ${isObject ? `
            <textarea class="field-textarea ${!this.objectUsesTextarea ? 'hidden' : ''}"
                      id="object-textarea"
                      data-field="object"
                      placeholder="Enter text content...">${this.fieldValues.object}</textarea>
          ` : ''}
        ` : this.renderGraphInput()}
      </div>
    `;
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
  
  renderTypeSelect(fieldName, fieldType, isObject) {
    if (isObject) {
      return this.renderObjectTypeOptions(fieldType);
    }
    return this.renderStandardTypeOptions(fieldName, fieldType);
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
        prefixesForm.setAttribute('prefixes', JSON.stringify(this._prefixes));
        
        prefixesForm.addEventListener('prefix-added', (e) => {
          this._prefixes[e.detail.prefix] = e.detail.expansion;
        });
        
        prefixesForm.addEventListener('prefix-removed', (e) => {
          delete this._prefixes[e.detail.prefix];
        });
        
        container.innerHTML = '';
        container.appendChild(prefixesForm);
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
  
  attachEventListeners() {
    if (this.tinyMode) {
      this.attachTinyModeListeners();
    } else {
      this.attachFullModeListeners();
    }
  }
  
  attachTinyModeListeners() {
    // Form button
    const formBtn = this.shadowRoot.getElementById('form-btn');
    if (formBtn) {
      formBtn.addEventListener('click', () => this.toggleTinyMode());
    }
    
    // Clear button
    const clearBtn = this.shadowRoot.getElementById('clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clear());
    }
    
    // Submit button
    const submitBtn = this.shadowRoot.getElementById('submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => this.handleSubmit(e));
    }
    
    // Field inputs
    ['subject', 'predicate', 'object'].forEach(field => {
      const input = this.shadowRoot.getElementById(`tiny-${field}`);
      if (input) {
        input.addEventListener('input', (e) => {
          this.fieldValues[field] = e.target.value;
          this.updateFieldValidation();
        });
        
        input.addEventListener('keydown', (e) => this.handleTinyKeydown(e, field));
      }
    });
    
    // Language input
    const langInput = this.shadowRoot.getElementById('tiny-lang');
    if (langInput) {
      langInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/^@/, '').toLowerCase();
        if (value.length === 1) {
          e.target.value = '';
          this.objectLanguage = '';
        } else {
          this.objectLanguage = value;
        }
      });
      
      langInput.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          this.shadowRoot.getElementById('form-btn').focus();
        }
      });
    }
  }
  
  handleTinyKeydown(e, field) {
    // Tab key - control tab order
    if (e.key === 'Tab') {
      e.preventDefault();
      
      if (e.shiftKey) {
        // Shift+Tab - go backwards
        if (field === 'subject') {
          this.shadowRoot.getElementById('submit-btn').focus();
        } else if (field === 'predicate') {
          this.shadowRoot.getElementById('tiny-subject').focus();
        } else if (field === 'object') {
          const langInput = this.shadowRoot.getElementById('tiny-lang');
          if (langInput && !langInput.classList.contains('hidden')) {
            // Skip to predicate if lang is showing
            this.shadowRoot.getElementById('tiny-predicate').focus();
          } else {
            this.shadowRoot.getElementById('tiny-predicate').focus();
          }
        }
      } else {
        // Tab - go forwards
        if (field === 'subject') {
          this.shadowRoot.getElementById('tiny-predicate').focus();
        } else if (field === 'predicate') {
          this.shadowRoot.getElementById('tiny-object').focus();
        } else if (field === 'object') {
          const langInput = this.shadowRoot.getElementById('tiny-lang');
          if (langInput && !langInput.classList.contains('hidden') && this.tinyFieldTypes.object === 'string') {
            langInput.focus();
          } else {
            this.shadowRoot.getElementById('form-btn').focus();
          }
        }
      }
      return;
    }
    
    // ESC - toggle field type
    if (e.key === 'Escape') {
      e.preventDefault();
      this.cycleTinyFieldType(field);
      return;
    }
    
    // Up arrow - previous picker value
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.cycleTinyPicker(field, -1);
      return;
    }
    
    // Down arrow - next picker value
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.cycleTinyPicker(field, 1);
      return;
    }
    
    // Enter - submit
    if (e.key === 'Enter') {
      e.preventDefault();
      this.handleSubmit(e);
      return;
    }
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
    
    this.renderContent();
    this.attachEventListeners();
    
    // Re-focus the field
    setTimeout(() => {
      const input = this.shadowRoot.getElementById(`tiny-${field}`);
      if (input) {
        input.focus();
        this.updateFieldValidation();
      }
    }, 0);
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
    
    const input = this.shadowRoot.getElementById(`tiny-${field}`);
    if (input) {
      input.value = values[newIndex];
      this.updateFieldValidation();
    }
  }
  
  attachFullModeListeners() {
    const form = this.shadowRoot.getElementById('quad-form');
    if (form) {
      form.addEventListener('submit', this.handleSubmit.bind(this));
    }
    
    // Tiny button
    const tinyBtn = this.shadowRoot.getElementById('tiny-btn');
    if (tinyBtn) {
      tinyBtn.addEventListener('click', () => this.toggleTinyMode());
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
    
    // Field inputs
    this.shadowRoot.querySelectorAll('.field-input, .field-select, .field-textarea').forEach(input => {
      input.addEventListener('input', (e) => {
        this.handleFieldChange(e);
        this.updateFieldValidation();
      });
      input.addEventListener('change', (e) => {
        this.handleFieldChange(e);
        this.updateFieldValidation();
      });
    });
    
    // Language input
    const languageInput = this.shadowRoot.getElementById('language-input');
    if (languageInput) {
      languageInput.addEventListener('input', (e) => {
        // Only allow 0, 2, or 3 characters
        let value = e.target.value.replace(/^@/, '').toLowerCase();
        if (value.length === 1) {
          // Don't allow single character
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
    const graphPrefix = this.shadowRoot.getElementById('graph-prefix');
    const graphPathInput = this.shadowRoot.getElementById('graph-path-input');
    
    const prefix = this.getGraphPrefix();
    
    if (graphPrefix) {
      graphPrefix.textContent = prefix;
    }
    
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
        // Expand QName to URI
        const expanded = this.expandQName(currentValue);
        input.value = expanded;
        this.fieldValues[field] = expanded;
      } else if (oldType === 'uri' && newType === 'qname') {
        // Contract URI to QName
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
      
      // Convert between QName and URI for object field too
      const currentValue = objectInput?.value || objectTextarea?.value || this.fieldValues.object;
      
      if (oldType === 'qname' && newType === 'uri') {
        const expanded = this.expandQName(currentValue);
        if (objectInput) objectInput.value = expanded;
        if (objectTextarea) objectTextarea.value = expanded;
        this.fieldValues.object = expanded;
      } else if (oldType === 'uri' && newType === 'qname') {
        const contracted = this.contractUri(currentValue);
        if (objectInput) objectInput.value = contracted;
        if (objectTextarea) objectTextarea.value = contracted;
        this.fieldValues.object = contracted;
      }
      
      // Determine if we should use textarea
      const shouldUseTextarea = newType === 'xsd:string' || 
                                newType === 'rdf:HTML' || 
                                newType === 'rdf:XMLLiteral' || 
                                newType === 'rdf:JSON' || 
                                newType === 'mmmdt:markdown';
      
      this.objectUsesTextarea = shouldUseTextarea;
      
      // Show/hide appropriate input
      if (shouldUseTextarea) {
        if (objectInput) objectInput.classList.add('hidden');
        if (objectTextarea) {
          objectTextarea.classList.remove('hidden');
          // Transfer value if switching
          if (objectInput && objectInput.value) {
            objectTextarea.value = objectInput.value;
            this.fieldValues.object = objectInput.value;
          }
        }
        // Enable language input for textarea
        if (languageInput) {
          languageInput.disabled = false;
        }
      } else {
        if (objectTextarea) objectTextarea.classList.add('hidden');
        if (objectInput) {
          objectInput.classList.remove('hidden');
          // Transfer value if switching
          if (objectTextarea && objectTextarea.value) {
            objectInput.value = objectTextarea.value;
            this.fieldValues.object = objectTextarea.value;
          }
        }
      }
      
      // Handle QName/URI vs literal behavior
      const isQNameOrUri = newType === 'qname' || newType === 'uri';
      
      if (isQNameOrUri) {
        // Behave like Subject/Predicate
        if (languageInput) {
          languageInput.disabled = true;
          languageInput.value = '';
        }
        this.objectDatatype = '';
        this.objectLanguage = '';
      } else {
        // It's a literal type
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
    // Get the button element (not a child element that might have been clicked)
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
  
  handleFieldChange(e) {
    const field = e.target.dataset.field;
    const value = e.target.value;
    
    this.fieldValues[field] = value;
    
    // Emit field-changed event
    this.dispatchEvent(new CustomEvent('field-changed', {
      detail: { field, value },
      bubbles: true,
      composed: true
    }));
    
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
    const errors = [];
    
    if (!this.fieldValues.subject) errors.push('Subject is required');
    if (!this.fieldValues.predicate) errors.push('Predicate is required');
    if (!this.fieldValues.object) errors.push('Object is required');
    if (!this.fieldValues.graph) errors.push('Graph is required');
    
    const valid = errors.length === 0;
    
    // Update submit button
    const submitBtn = this.shadowRoot.getElementById('submit-btn');
    if (submitBtn) {
      submitBtn.disabled = !valid;
    }
    
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
    
    if (!this.validate()) {
      return;
    }
    
    // Check if we need to generate SNIP
    const objectValue = this.fieldValues.object;
    if (this.objectUsesTextarea && objectValue && objectValue.length > 50) {
      console.log('SNIP should be generated for long text:', {
        length: objectValue.length,
        preview: objectValue.substring(0, 50) + '...'
      });
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
        this.clear();
      } catch (err) {
        console.error('Failed to submit quad:', err);
        this.dispatchEvent(new CustomEvent('quad-error', {
          detail: { error: err },
          bubbles: true,
          composed: true
        }));
      }
    } else {
      // Clear form after event emission
      this.clear();
    }
  }
  
  expandQName(value) {
    if (!value || value.includes('://')) return value;
    
    const colonIndex = value.indexOf(':');
    if (colonIndex === -1) return value;
    
    const prefix = value.substring(0, colonIndex);
    const localPart = value.substring(colonIndex + 1);
    
    if (this._prefixes[prefix]) {
      return this._prefixes[prefix] + localPart;
    }
    
    return value;
  }
  
  contractUri(uri) {
    if (!uri || !uri.includes('://')) return uri;
    
    // Try to find a matching prefix
    for (const [prefix, expansion] of Object.entries(this._prefixes)) {
      if (uri.startsWith(expansion)) {
        return prefix + ':' + uri.substring(expansion.length);
      }
    }
    
    return uri;
  }
  
  updateAttribution() {
    const atValue = this.shadowRoot.getElementById('at-value');
    const byValue = this.shadowRoot.getElementById('by-value');
    
    if (atValue) {
      const now = new Date().toISOString();
      atValue.textContent = now;
      
      // Update every second
      setInterval(() => {
        atValue.textContent = new Date().toISOString();
      }, 1000);
    }
    
    if (byValue) {
      byValue.textContent = this._currentIdentity || 'not logged in';
    }
  }
  
  showPrefixes() {
    const overlay = this.shadowRoot.getElementById('prefixes-overlay');
    if (overlay) {
      overlay.classList.add('visible');
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
      // Update graph path input
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
    this.fieldValues = {
      subject: '',
      predicate: '',
      object: '',
      graph: this._defaultGraph
    };
    
    // Reset to default types
    this.fieldTypes = {
      subject: 'uri',
      predicate: 'qname',
      object: 'uri',
      graph: 'qname'
    };
    
    this.objectDatatype = '';
    this.objectLanguage = '';
    this.objectUsesTextarea = false;
    
    if (this.tinyMode) {
      // Just clear tiny inputs
      ['subject', 'predicate', 'object'].forEach(field => {
        const input = this.shadowRoot.getElementById(`tiny-${field}`);
        if (input) {
          input.value = '';
          input.style.backgroundColor = '';
        }
      });
      const langInput = this.shadowRoot.getElementById('tiny-lang');
      if (langInput) langInput.value = '';
    } else {
      // Clear full form inputs
      this.shadowRoot.querySelectorAll('.field-input').forEach(input => {
        input.value = '';
        input.style.backgroundColor = '';
      });
      
      this.shadowRoot.querySelectorAll('.field-select').forEach(select => {
        select.value = '';
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
      this.shadowRoot.querySelectorAll('.type-select-dropdown').forEach(select => {
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
    }
    
    this.validate();
  }
}

// Register the custom element
customElements.define('quad-form', QuadFormWC);

// Export for ES modules
export { QuadFormWC };
