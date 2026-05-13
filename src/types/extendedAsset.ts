export type CustomFieldType = 'text' | 'image';

export interface CustomField {
  id: string;
  label: string;
  name?: string;
  type: CustomFieldType;
  displayInViewport?: boolean;
  isGlobal?: boolean;
  color?: string;
  required?: boolean;
  options?: string[];
}

export interface CustomFieldValue {
  fieldId: string;
  value: any;
}

export interface ViewportDisplaySettings {
  name: boolean;
  description: boolean;
  thumbnail: boolean;
  portraitBlur: number;
}

export interface GlobalCustomField extends CustomField {}

export interface GeneratorData {
  [key: string]: any;
}

export interface ExtendedAsset {
  name?: string;
  description?: string;
  customFields?: CustomField[];
  customFieldValues?: CustomFieldValue[];
  [key: string]: any;
}
