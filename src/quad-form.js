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
  schema: 'http://schema.org/'
};

// Hardcoded properties for predicate picker (until datasource working)
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
    
    // Field modes: {curie|url|literal}
    this.fieldTypes = {
      subject: 'url',
      predicate: 'curie',
      object: 'url',
      graph: 'curie'
    };
    
    // Field control modes: {input|select}
    this.fieldControls = {
      subject: 'input',
      predicate: 'select',
      object: 'input',
      graph: 'input'
    };
    
    // Object metadata
    this.objectDatatype = '';
    this.objectLanguage = '';
    
    // Configuration
    this._mmmServer = null;
    this._prefixes = { ...COMMON_PREFIXES };
    this._currentIdentity = null;
    this._expandCuries = true;
    this._defaultGraph = 'mntl:publ/scratch';
    
    // Prefixes form state
    this.prefixesFormVisible = false;
  }
  
  // Properties
  get mmmServer() { return this._mmmServer; }
  set mmmServer(val) { this._mmmServer = val; }
  
  get prefixes() { return this._prefixes; }
  set prefixes(val) { 
    this._prefixes = { ...COMMON_PREFIXES, ...val };
    this.updatePrefixesInForm();
  }
  
  get currentIdentity() { return this._currentIdentity; }
  set currentIdentity(val) { 
    this._currentIdentity = val;
    this.updateAttribution();
  }
  
  get expandCuries() { return this._expandCuries; }
  set expandCuries(val) { this._expandCuries = val; }
  
  get defaultGraph() { return this._defaultGraph; }
  set defaultGraph(val) { 
    this._defaultGraph = val;
    if (!this.fieldValues.graph) {
      this.fieldValues.graph = val;
    }
  }
  
  connectedCallback() {
    this.render();
    this.attachEventListeners();
    
    // Set default graph
    if (!this.fieldValues.graph) {
      this.fieldValues.graph = this._defaultGraph;
      const graphInput = this.shadowRoot.querySelector('#graph-input');
      if (graphInput) graphInput.value = this._defaultGraph;
    }
  }
  
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: monospace;
          position: relative;
        }
        
        .quad-form {
          background: white;
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 20px;
          max-width: 600px;
        }
        
        .form-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #e0e0e0;
        }
        
        .form-header h3 {
          margin: 0;
          font-size: 1.1em;
        }
        
        .prefixes-btn {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 3px;
          cursor: pointer;
          font-family: monospace;
          font-size: 12px;
        }
        
        .prefixes-btn:hover {
          background: #45a049;
        }
        
        .field-group {
          margin-bottom: 15px;
        }
        
        .field-label {
          display: block;
          font-weight: bold;
          margin-bottom: 4px;
          font-size: 13px;
        }
        
        .field-controls {
          display: flex;
          gap: 8px;
          margin-bottom: 4px;
          align-items: center;
        }
        
        .type-select-dropdown {
          padding: 4px 8px;
          border: 1px solid #ccc;
          border-radius: 3px;
          font-family: monospace;
          font-size: 11px;
          background: white;
          cursor: pointer;
        }
        
        .control-toggle {
          background: #f0f0f0;
          border: 1px solid #ccc;
          padding: 4px 12px;
          cursor: pointer;
          font-family: monospace;
          font-size: 11px;
          border-radius: 3px;
          margin-left: auto;
        }
        
        .control-toggle:hover {
          background: #e0e0e0;
        }
        
        optgroup {
          font-style: normal;
          color: #999;
          font-weight: normal;
        }
        
        .field-input, .field-select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 3px;
          font-family: monospace;
          font-size: 13px;
          box-sizing: border-box;
        }
        
        .field-input:focus, .field-select:focus {
          outline: none;
          border-color: #2196F3;
        }
        
        .hidden {
          display: none !important;
        }
        
        .language-input {
          padding: 6px;
          border: 1px solid #ccc;
          border-radius: 3px;
          font-family: monospace;
          font-size: 12px;
        }
        
        .attribution {
          display: flex;
          gap: 20px;
          padding: 10px;
          background: #f9f9f9;
          border-radius: 3px;
          font-size: 12px;
          margin: 15px 0;
        }
        
        .attribution strong {
          color: #666;
        }
        
        .form-actions {
          display: flex;
          gap: 10px;
          margin-top: 15px;
        }
        
        .submit-btn, .clear-btn {
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
        
        .clear-btn {
          background: #f44336;
          color: white;
        }
        
        .clear-btn:hover {
          background: #da190b;
        }
        
        .prefixes-overlay {
          position: absolute;
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
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        
        .close-prefixes {
          float: right;
          background: #f44336;
          color: white;
          border: none;
          padding: 4px 12px;
          border-radius: 3px;
          cursor: pointer;
          font-family: monospace;
        }
      </style>
      
      <div class="quad-form">
        <div class="form-header">
          <h3>Create Quad</h3>
          <button class="prefixes-btn" id="prefixes-btn">Prefixes</button>
        </div>
        
        <form id="quad-form">
          ${this.renderField('subject', 'Subject')}
          ${this.renderField('predicate', 'Predicate')}
          ${this.renderField('object', 'Object')}
          ${this.renderField('graph', 'Graph')}
          
          <div class="attribution">
            <div><strong>at:</strong> <span id="at-value"></span></div>
            <div><strong>by:</strong> <span id="by-value">${this._currentIdentity || 'anonymous'}</span></div>
          </div>
          
          <div class="form-actions">
            <button type="button" class="clear-btn" id="clear-btn">Clear</button>
            <button type="submit" class="submit-btn" id="submit-btn">Submit Quad</button>
          </div>
        </form>
      </div>
      
      <div class="prefixes-overlay" id="prefixes-overlay">
        <div class="prefixes-container">
          <button class="close-prefixes" id="close-prefixes">✕</button>
          <div id="prefixes-form-container"></div>
        </div>
      </div>
    `;
    
    this.updateAttribution();
  }
  
  renderField(fieldName, label) {
    const fieldType = this.fieldTypes[fieldName];
    const controlType = this.fieldControls[fieldName];
    const isObject = fieldName === 'object';
    
    return `
      <div class="field-group">
        <label class="field-label">${label}</label>
        
        <div class="field-controls">
          <select class="type-select-dropdown" data-field="${fieldName}">
            ${isObject ? this.renderObjectTypeOptions(fieldType) : this.renderStandardTypeOptions(fieldType)}
          </select>
          
          <button type="button" class="control-toggle" data-field="${fieldName}">
            ${controlType === 'input' ? '▬' : '▼'} / ${controlType === 'input' ? '▼' : '▬'}
          </button>
        </div>
        
        <input type="text" 
               class="field-input ${controlType === 'select' ? 'hidden' : ''}" 
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
        
        ${isObject ? this.renderLanguageInput() : ''}
      </div>
    `;
  }
  
  renderStandardTypeOptions(currentType) {
    return `
      <option value="curie" ${currentType === 'curie' ? 'selected' : ''}>CURIE</option>
      <option value="url" ${currentType === 'url' ? 'selected' : ''}>URL</option>
    `;
  }
  
  renderObjectTypeOptions(currentType) {
    return `
      <option value="curie" ${currentType === 'curie' ? 'selected' : ''}>CURIE</option>
      <option value="url" ${currentType === 'url' ? 'selected' : ''}>URL</option>
      <optgroup label="literals">
        <option value="xsd:anyURI" ${currentType === 'xsd:anyURI' ? 'selected' : ''}>anyURI</option>
      </optgroup>
      <optgroup label="date/time">
        <option value="xsd:date" ${currentType === 'xsd:date' ? 'selected' : ''}>date</option>
        <option value="xsd:dateTime" ${currentType === 'xsd:dateTime' ? 'selected' : ''}>dateTime</option>
        <option value="xsd:duration" ${currentType === 'xsd:duration' ? 'selected' : ''}>duration</option>
        <option value="xsd:gYearMonth" ${currentType === 'xsd:gYearMonth' ? 'selected' : ''}>gYearMonth</option>
        <option value="xsd:gYear" ${currentType === 'xsd:gYear' ? 'selected' : ''}>gYear</option>
        <option value="xsd:gMonthDay" ${currentType === 'xsd:gMonthDay' ? 'selected' : ''}>gMonthDay</option>
        <option value="xsd:gDay" ${currentType === 'xsd:gDay' ? 'selected' : ''}>gDay</option>
        <option value="xsd:gMonth" ${currentType === 'xsd:gMonth' ? 'selected' : ''}>gMonth</option>
        <option value="xsd:time" ${currentType === 'xsd:time' ? 'selected' : ''}>time</option>
      </optgroup>
      <optgroup label="number">
        <option value="xsd:boolean" ${currentType === 'xsd:boolean' ? 'selected' : ''}>boolean</option>
        <option value="xsd:float" ${currentType === 'xsd:float' ? 'selected' : ''}>float</option>
        <option value="xsd:double" ${currentType === 'xsd:double' ? 'selected' : ''}>double</option>
        <option value="xsd:decimal" ${currentType === 'xsd:decimal' ? 'selected' : ''}>decimal</option>
        <option value="xsd:integer" ${currentType === 'xsd:integer' ? 'selected' : ''}>integer</option>
        <option value="xsd:base64Binary" ${currentType === 'xsd:base64Binary' ? 'selected' : ''}>base64Binary</option>
        <option value="xsd:hexBinary" ${currentType === 'xsd:hexBinary' ? 'selected' : ''}>hexBinary</option>
      </optgroup>
      <option value="xsd:string" ${currentType === 'xsd:string' ? 'selected' : ''}>string</option>
      <optgroup label="RDF types">
        <option value="rdf:HTML" ${currentType === 'rdf:HTML' ? 'selected' : ''}>rdf:HTML</option>
        <option value="rdf:XMLLiteral" ${currentType === 'rdf:XMLLiteral' ? 'selected' : ''}>rdf:XMLLiteral</option>
        <option value="rdf:JSON" ${currentType === 'rdf:JSON' ? 'selected' : ''}>rdf:JSON</option>
      </optgroup>
      <optgroup label="MMM types">
        <option value="mmmdt:markdown" ${currentType === 'mmmdt:markdown' ? 'selected' : ''}>mmmdt:markdown</option>
      </optgroup>
    `;
  }
  
  renderLanguageInput() {
    const isLiteral = this.fieldTypes.object !== 'curie' && this.fieldTypes.object !== 'url';
    return `
      <input type="text" 
             class="language-input ${isLiteral ? '' : 'hidden'}" 
             id="language-input"
             placeholder="@en"
             style="margin-top: 8px; width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 3px; font-family: monospace; font-size: 12px;">
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
        curie: 'ex:Alice',
        url: 'http://example.org/Alice'
      },
      predicate: {
        curie: 'foaf:knows',
        url: 'http://xmlns.com/foaf/0.1/knows'
      },
      object: {
        curie: 'ex:Bob',
        url: 'http://example.org/Bob'
      },
      graph: {
        curie: 'mntl:publ/scratch',
        url: 'http://example.org/graph'
      }
    };
    return placeholders[fieldName]?.[fieldType] || '';
  }
  
  attachEventListeners() {
    const form = this.shadowRoot.getElementById('quad-form');
    form.addEventListener('submit', this.handleSubmit.bind(this));
    
    // Clear button
    this.shadowRoot.getElementById('clear-btn')
      .addEventListener('click', () => this.clear());
    
    // Type select dropdowns
    this.shadowRoot.querySelectorAll('.type-select-dropdown').forEach(select => {
      select.addEventListener('change', this.handleTypeChange.bind(this));
    });
    
    // Control toggle buttons
    this.shadowRoot.querySelectorAll('.control-toggle').forEach(btn => {
      btn.addEventListener('click', this.handleControlToggle.bind(this));
    });
    
    // Field inputs
    this.shadowRoot.querySelectorAll('.field-input, .field-select').forEach(input => {
      input.addEventListener('input', this.handleFieldChange.bind(this));
      input.addEventListener('change', this.handleFieldChange.bind(this));
    });
    
    // Language input
    const languageInput = this.shadowRoot.getElementById('language-input');
    if (languageInput) {
      languageInput.addEventListener('input', (e) => {
        this.objectLanguage = e.target.value.replace(/^@/, '');
      });
    }
    
    // Prefixes button
    this.shadowRoot.getElementById('prefixes-btn')
      .addEventListener('click', () => this.showPrefixes());
    
    this.shadowRoot.getElementById('close-prefixes')
      .addEventListener('click', () => this.hidePrefixes());
    
    // Close overlay on backdrop click
    this.shadowRoot.getElementById('prefixes-overlay')
      .addEventListener('click', (e) => {
        if (e.target.id === 'prefixes-overlay') {
          this.hidePrefixes();
        }
      });
  }
  
  handleTypeChange(e) {
    const field = e.target.dataset.field;
    const type = e.target.value;
    
    this.fieldTypes[field] = type;
    
    // Update placeholder
    const input = this.shadowRoot.getElementById(`${field}-input`);
    if (input) {
      input.placeholder = this.getPlaceholder(field, type);
    }
    
    // Update object datatype and language input visibility if this is the object field
    if (field === 'object') {
      const languageInput = this.shadowRoot.getElementById('language-input');
      const isLiteral = type !== 'curie' && type !== 'url';
      
      if (languageInput) {
        if (isLiteral) {
          languageInput.classList.remove('hidden');
        } else {
          languageInput.classList.add('hidden');
        }
      }
      
      // Set datatype if it's a literal type
      if (isLiteral) {
        this.objectDatatype = type;
        this.updateObjectInputType();
      } else {
        this.objectDatatype = '';
      }
    }
    
    this.validate();
  }
  
  handleControlToggle(e) {
    const field = e.target.dataset.field;
    const currentControl = this.fieldControls[field];
    const newControl = currentControl === 'input' ? 'select' : 'input';
    
    this.fieldControls[field] = newControl;
    
    // Update button text
    e.target.textContent = newControl === 'input' ? '▬ / ▼' : '▼ / ▬';
    
    // Show/hide controls
    const input = this.shadowRoot.getElementById(`${field}-input`);
    const select = this.shadowRoot.getElementById(`${field}-select`);
    
    if (newControl === 'input') {
      input.classList.remove('hidden');
      select.classList.add('hidden');
    } else {
      input.classList.add('hidden');
      select.classList.remove('hidden');
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
    
    // Build quad in FLAT format
    const quad = {
      s: this.expandCuries ? this.expandCurie(this.fieldValues.subject) : this.fieldValues.subject,
      p: this.expandCuries ? this.expandCurie(this.fieldValues.predicate) : this.fieldValues.predicate,
      o: this.expandCuries ? this.expandCurie(this.fieldValues.object) : this.fieldValues.object,
      g: this.expandCuries ? this.expandCurie(this.fieldValues.graph) : this.fieldValues.graph,
      at: new Date().toISOString(),
      by: this._currentIdentity || 'mailto:anonymous@localhost'
    };
    
    // Add datatype if specified
    if (this.objectDatatype) {
      quad.d = this.objectDatatype;
    }
    
    // Add language if specified
    if (this.objectLanguage) {
      quad.l = this.objectLanguage;
    }
    
    // Try mmmServer first, fallback to event
    let success = false;
    
    if (this._mmmServer && typeof this._mmmServer.ingestFlat === 'function') {
      try {
        await this._mmmServer.ingestFlat(quad);
        success = true;
        console.log('Quad ingested via mmmServer:', quad);
      } catch (error) {
        console.error('Failed to ingest via mmmServer:', error);
      }
    }
    
    // Always emit event
    this.dispatchEvent(new CustomEvent('quad-submitted', {
      detail: quad,
      bubbles: true,
      composed: true
    }));
    
    if (success || !this._mmmServer) {
      // Clear form on success
      this.clear();
    }
  }
  
  expandCurie(value) {
    if (!value || value.includes('://')) {
      return value; // Already a full URI
    }
    
    const colonIndex = value.indexOf(':');
    if (colonIndex === -1) {
      return value; // Not a CURIE
    }
    
    const prefix = value.substring(0, colonIndex);
    const localPart = value.substring(colonIndex + 1);
    
    const expansion = this._prefixes[prefix];
    if (expansion) {
      return expansion + localPart;
    }
    
    return value; // Unknown prefix, return as-is
  }
  
  updateAttribution() {
    const atValue = this.shadowRoot.getElementById('at-value');
    const byValue = this.shadowRoot.getElementById('by-value');
    
    if (atValue) {
      atValue.textContent = new Date().toISOString();
    }
    
    if (byValue) {
      byValue.textContent = this._currentIdentity || 'anonymous';
    }
  }
  
  updatePrefixesInForm() {
    // TODO: Update prefix-form component if embedded
  }
  
  showPrefixes() {
    const overlay = this.shadowRoot.getElementById('prefixes-overlay');
    const container = this.shadowRoot.getElementById('prefixes-form-container');
    
    if (!this.prefixesFormVisible) {
      // Create prefixes-form dynamically
      container.innerHTML = '<prefixes-form></prefixes-form>';
      
      // TODO: Set prefixes from this._prefixes
      const prefixesForm = container.querySelector('prefixes-form');
      if (prefixesForm) {
        // Listen for prefix changes
        prefixesForm.addEventListener('prefix-enabled', (e) => {
          this._prefixes[e.detail.prefix] = e.detail.expansion;
        });
      }
    }
    
    overlay.classList.add('visible');
    this.prefixesFormVisible = true;
  }
  
  hidePrefixes() {
    const overlay = this.shadowRoot.getElementById('prefixes-overlay');
    overlay.classList.remove('visible');
  }
  
  // Public API methods
  setField(name, value) {
    this.fieldValues[name] = value;
    
    const input = this.shadowRoot.getElementById(`${name}-input`);
    const select = this.shadowRoot.getElementById(`${name}-select`);
    
    if (this.fieldControls[name] === 'input' && input) {
      input.value = value;
    } else if (this.fieldControls[name] === 'select' && select) {
      select.value = value;
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
      subject: 'url',
      predicate: 'curie',
      object: 'url',
      graph: 'curie'
    };
    
    this.objectDatatype = '';
    this.objectLanguage = '';
    
    // Clear inputs
    this.shadowRoot.querySelectorAll('.field-input').forEach(input => {
      if (input.id === 'graph-input') {
        input.value = this._defaultGraph;
      } else {
        input.value = '';
      }
    });
    
    this.shadowRoot.querySelectorAll('.field-select').forEach(select => {
      select.value = '';
    });
    
    // Reset type dropdowns
    this.shadowRoot.querySelectorAll('.type-select-dropdown').forEach(select => {
      const field = select.dataset.field;
      select.value = this.fieldTypes[field];
    });
    
    const languageInput = this.shadowRoot.getElementById('language-input');
    if (languageInput) languageInput.value = '';
    
    this.validate();
  }
}

// Register the custom element
customElements.define('quad-form', QuadFormWC);

// Export for ES modules
export { QuadFormWC };
