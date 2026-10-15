export class QuadFormWC extends HTMLElement {
  // Properties
  mmmServer: any;
  prefixes: Record<string, string>;
  currentIdentity: string | null;
  expandCuries: boolean;
  defaultGraph: string;
  /** What goes in the object for a predicate; null means nothing decided. */
  objectGuide: ((predicate: string) => ObjectGuide | null | Promise<ObjectGuide | null>) | null;

  // Methods
  setField(name: string, value: string): void;
  getField(name: string): string;
  populateFromEntity(entity: string, role: string, mode: string): void;
  clear(): void;
  
  // Events
  addEventListener(type: 'quad-submitted', listener: (e: CustomEvent<{s: string, p: string, o: string, g: string, at: string, by: string, d?: string, l?: string}>) => void): void;
  addEventListener(type: 'field-changed', listener: (e: CustomEvent<{field: string, value: string}>) => void): void;
  addEventListener(type: 'validation-changed', listener: (e: CustomEvent<{valid: boolean, errors: string[]}>) => void): void;
  addEventListener(type: 'object-guided', listener: (e: CustomEvent<{predicate: string, type: string | null, applied: boolean}>) => void): void;
}

export interface ObjectGuide {
  /** 'qname' for an entity slot, else an XSD/RDF datatype CURIE such as 'xsd:date'. */
  type: string;
  /** The ontology decided it (a declared range), rather than a presumption. */
  decided: boolean;
  entity?: boolean;
  options?: Array<string | { value: string; label?: string; group?: string }> | null;
}

declare global {
  interface HTMLElementTagNameMap {
    'quad-form': QuadFormWC;
  }
}
