export class QuadFormWC extends HTMLElement {
  // Properties
  mmmServer: any;
  prefixes: Record<string, string>;
  currentIdentity: string | null;
  expandCuries: boolean;
  defaultGraph: string;
  
  // Methods
  setField(name: string, value: string): void;
  getField(name: string): string;
  populateFromEntity(entity: string, role: string, mode: string): void;
  clear(): void;
  
  // Events
  addEventListener(type: 'quad-submitted', listener: (e: CustomEvent<{s: string, p: string, o: string, g: string, at: string, by: string, d?: string, l?: string}>) => void): void;
  addEventListener(type: 'field-changed', listener: (e: CustomEvent<{field: string, value: string}>) => void): void;
  addEventListener(type: 'validation-changed', listener: (e: CustomEvent<{valid: boolean, errors: string[]}>) => void): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'quad-form': QuadFormWC;
  }
}
