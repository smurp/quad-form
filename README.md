# quad-form

A standalone web component for creating RDF quads with full CURIE support, XSD datatypes, and MMM integration. Drop-in replacement for QuadForm.js.

![npm version](https://img.shields.io/npm/v/@mmmlib/quad-form.svg)
![license](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)

## Features

- 🎯 **Drop-in replacement** for QuadForm.js
- 📦 **Zero framework dependencies** - Pure web component
- 🔄 **CURIE expansion** - Full prefix support with embedded prefixes-form
- 📊 **XSD datatypes** - Complete XSD type support + RDF types
- 🎨 **Smart input modes** - Toggle between CURIE/URL and pick/input
- 🌐 **MMM integration** - Works with MMMServer or events
- 🎛️ **mntl: URN support** - Full mental space hierarchy
- ✨ **Language tags** - Support for @en, @fr, etc.

## Installation

```bash
npm install @mmmlib/quad-form
```

Or use directly from CDN:

```html
<script type="module" src="https://unpkg.com/@mmmlib/quad-form/dist/quad-form.min.js"></script>
```

## Usage

### Basic Usage

```html
<!DOCTYPE html>
<html>
<head>
    <script type="module" src="path/to/quad-form.js"></script>
</head>
<body>
    <quad-form></quad-form>
</body>
</html>
```

### With MMM Server

```javascript
import { createMMMServer } from '@mmmlib/mmmlib';

const mmmServer = await createMMMServer({ rootDir: '.mmm' });
const quadForm = document.querySelector('quad-form');

quadForm.mmmServer = mmmServer;
quadForm.currentIdentity = 'mailto:alice@example.com';
quadForm.defaultGraph = 'mntl:open/alice/notes';
```

### Event-Based Integration

```javascript
const quadForm = document.querySelector('quad-form');

quadForm.addEventListener('quad-submitted', (e) => {
  const { s, p, o, g, at, by, d, l } = e.detail;
  console.log('Quad submitted:', e.detail);
  // Handle the quad
});

quadForm.addEventListener('field-changed', (e) => {
  console.log(`Field ${e.detail.field} changed to:`, e.detail.value);
});
```

### Programmatic Control

```javascript
const quadForm = document.querySelector('quad-form');

// Set field values
quadForm.setField('subject', 'ex:Alice');
quadForm.setField('predicate', 'foaf:knows');
quadForm.setField('object', 'ex:Bob');
quadForm.setField('graph', 'mntl:open/social');

// Get field values
const subject = quadForm.getField('subject');

// Populate from entity (for [s][p][o][g] buttons)
quadForm.populateFromEntity('ex:Alice', 'subject', 'reuse');

// Clear form
quadForm.clear();
```

### With Custom Prefixes

```javascript
quadForm.prefixes = {
  foaf: 'http://xmlns.com/foaf/0.1/',
  dc: 'http://purl.org/dc/elements/1.1/',
  ex: 'http://example.org/'
};
```

## Attributes

- **`expand-curies`** - Expand CURIEs to full URIs (default: true)
- **`default-graph`** - Default graph URI (default: 'mntl:publ/scratch')
- **`current-identity`** - Current user identity for attribution

## API Reference

### Properties

- **`mmmServer`** - MMMServer instance for direct submission
- **`prefixes`** - Object mapping prefixes to IRIs
- **`currentIdentity`** - User identity for `by` field
- **`expandCuries`** - Boolean, expand CURIEs before submission
- **`defaultGraph`** - Default graph for new quads

### Methods

- **`setField(name, value)`** - Set a field value (subject/predicate/object/graph)
- **`getField(name)`** - Get current field value
- **`populateFromEntity(entity, role, mode)`** - Populate from entity button
- **`clear()`** - Clear all fields

### Events

All events bubble and are composed (cross shadow DOM boundaries).

- **`quad-submitted`** - Fired when quad is submitted
  ```javascript
  {detail: {s, p, o, g, at, by, d?, l?}}
  ```

- **`field-changed`** - Fired when field value changes
  ```javascript
  {detail: {field: 'subject', value: 'ex:Alice'}}
  ```

- **`validation-changed`** - Fired when form validation state changes
  ```javascript
  {detail: {valid: true, errors: []}}
  ```

## Datatypes Supported

### XSD Types
- xsd:string, xsd:integer, xsd:decimal, xsd:float, xsd:double
- xsd:boolean, xsd:date, xsd:dateTime, xsd:time
- xsd:gYear, xsd:duration
- xsd:anyURI, xsd:base64Binary, xsd:hexBinary

### RDF Types
- rdf:HTML
- rdf:XMLLiteral
- rdf:JSON

### MMM Types
- mmmdt:markdown

## Mental Space URNs

The graph field supports the full mntl: hierarchy:

```
mntl:lock/{identity}/  - Personal encrypted vault
mntl:open/{identity}/  - Public read, signed writes
mntl:publ/            - Public commons
```

## Browser Compatibility

- Chrome/Edge 80+
- Firefox 75+
- Safari 13.1+

## Development

```bash
npm install
npm run dev
# Visit http://localhost:8001/example/
```

## License

AGPL-3.0-or-later
