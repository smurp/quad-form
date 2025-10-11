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
          gap: 4px;
          margin-bottom: 4px;
        }
        
        .type-toggle, .control-toggle {
          background: #f0f0f0;
          border: 1px solid #ccc;
          padding: 4px 8px;
          cursor: pointer;
          font-family: monospace;
          font-size: 11px;
          border-radius: 3px;
        }
        
        .type-toggle.active, .control-toggle.active {
          background: #2196F3;
          color: white;
          border-color: #2196F3;
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
        
        .object-metadata {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }
        
        .datatype-select, .language-input {
          padding: 6px;
          border: 1px solid #ccc;
          border-radius: 3px;
          font-family: monospace;
          font-size: 12px;
        }
        
        .datatype-select {
          flex: 1;
        }
        
        .language-input {
          width: 80px;
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
          <button type="button" class="type-toggle ${fieldType === 'curie' ? 'active' : ''}" 
                  data-field="${fieldName}" data-type="curie">CURIE</button>
          <button type="button" class="type-toggle ${fieldType === 'url' ? 'active' : ''}" 
                  data-field="${fieldName}" data-type="url">URL</button>
          ${isObject ? `<button type="button" class="type-toggle ${fieldType === 'literal' ? 'active' : ''}" 
                  data-field="${fieldName}" data-type="literal">Literal</button>` : ''}
          
          <button type="button" class="control-toggle ${controlType === 'input' ? 'active' : ''}" 
                  data-field="${fieldName}" data-control="input">▬</button>
          <button type="button" class="control-toggle ${controlType === 'select' ? 'active' : ''}" 
                  data-field="${fieldName}" data-control="select">▼</button>
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
        
        ${isObject ? this.renderObjectMetadata() : ''}
      </div>
    `;
  }
  
  renderObjectMetadata() {
    return `
      <div class="object-metadata" id="object-metadata">
        <select class="datatype-select" id="datatype-select">
          <option value="">Plain Literal</option>
          <optgroup label="XSD Types">
            <option value="xsd:string">xsd:string</option>
            <option value="xsd:integer">xsd:integer</option>
            <option value="xsd:decimal">xsd:decimal</option>
            <option value="xsd:float">xsd:float</option>
            <option value="xsd:double">xsd:double</option>
            <option value="xsd:boolean">xsd:boolean</option>
            <option value="xsd:date">xsd:date</option>
            <option value="xsd:dateTime">xsd:dateTime</option>
            <option value="xsd:time">xsd:time</option>
            <option value="xsd:gYear">xsd:gYear</option>
            <option value="xsd:duration">xsd:duration</option>
            <option value="xsd:anyURI">xsd:anyURI</option>
            <option value="xsd:base64Binary">xsd:base64Binary</option>
            <option value="xsd:hexBinary">xsd:hexBinary</option>
          </optgroup>
          <optgroup label="RDF Types">
            <option value="rdf:HTML">rdf:HTML</option>
            <option value="rdf:XMLLiteral">rdf:XMLLiteral</option>
            <option value="rdf:JSON">rdf:JSON</option>
          </optgroup>
          <optgroup label="MMM Types">
            <option value="mmmdt:markdown">mmmdt:markdown</option>
          </optgroup>
        </select>
        <input type="text" 
               class="language-input ${this.fieldTypes.object === 'literal' ? '' : 'hidden'}" 
               id="language-input"
               placeholder="@en">
      </div>
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
    const placeholders = {
      subject: {
        curie: 'ex:Alice',
        url: 'http://example.org/Alice',
        literal: 'text value'
      },
      predicate: {
        curie: 'foaf:knows',
        url: 'http://xmlns.com/foaf/0.1/knows',
        literal: 'text value'
      },
      object: {
        curie: 'ex:Bob',
        url: 'http://example.org/Bob',
        literal: 'text value'
      },
      graph: {
        curie: 'mntl:publ/scratch',
        url: 'http://example.org/graph',
        literal: 'text value'
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
    
    // Type toggles
    this.shadowRoot.querySelectorAll('.type-toggle').forEach(btn => {
      btn.addEventListener('click', this.handleTypeToggle.bind(this));
    });
    
    // Control toggles
    this.shadowRoot.querySelectorAll('.control-toggle').forEach(btn => {
      btn.addEventListener('click', this.handleControlToggle.bind(this));
    });
    
    // Field inputs
    this.shadowRoot.querySelectorAll('.field-input, .field-select').forEach(input => {
      input.addEventListener('input', this.handleFieldChange.bind(this));
      input.addEventListener('change', this.handleFieldChange.bind(this));
    });
    
    // Datatype select
    const datatypeSelect = this.shadowRoot.getElementById('datatype-select');
    if (datatypeSelect) {
      datatypeSelect.addEventListener('change', (e) => {
        this.objectDatatype = e.target.value;
        this.updateObjectInputType();
      });
    }
    
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
  
  handleTypeToggle(e) {
    const field = e.target.dataset.field;
    const type = e.target.dataset.type;
    
    this.fieldTypes[field] = type;
    
    // Update button states
    this.shadowRoot.querySelectorAll(`[data-field="${field}"].type-toggle`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    // Update placeholder
    const input = this.shadowRoot.getElementById(`${field}-input`);
    if (input) {
      input.placeholder = this.getPlaceholder(field, type);
    }
    
    // Show/hide language input for object literals
    if (field === 'object') {
      const languageInput = this.shadowRoot.getElementById('language-input');
      if (languageInput) {
        languageInput.classList.toggle('hidden', type !== 'literal');
      }
      this.updateObjectInputType();
    }
    
    this.validate();
  }
  
  handleControlToggle(e) {
    const field = e.target.dataset.field;
    const control = e.target.dataset.control;
    
    this.fieldControls[field] = control;
    
    // Update button states
    this.shadowRoot.querySelectorAll(`[data-field="${field}"].control-toggle`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.control === control);
    });
    
    // Show/hide controls
    const input = this.shadowRoot.getElementById(`${field}-input`);
    const select = this.shadowRoot.getElementById(`${field}-select`);
    
    if (control === 'input') {
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
    
    const datatypeSelect = this.shadowRoot.getElementById('datatype-select');
    if (datatypeSelect) datatypeSelect.value = '';
    
    const languageInput = this.shadowRoot.getElementById('language-input');
    if (languageInput) languageInput.value = '';
    
    this.validate();
  }
}

// Register the custom element
customElements.define('quad-form', QuadFormWC);

// Export for ES modules
export { QuadFormWC };
