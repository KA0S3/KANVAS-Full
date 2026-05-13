import type { ExtendedAsset, CustomField, CustomFieldValue, GeneratorData } from '@/types/extendedAsset';
import { createId } from '@/utils/id';

export interface GeneratorMapping {
  [key: string]: {
    field: string;
    type: 'string' | 'number' | 'boolean' | 'array';
    showOnCanvas?: boolean;
  };
}

export const GENERATOR_MAPPINGS: Record<string, GeneratorMapping> = {
  character: {
    name: { field: 'name', type: 'string' },
    description: { field: 'description', type: 'string' },
    level: { field: 'level', type: 'number', showOnCanvas: true },
    class: { field: 'class', type: 'string', showOnCanvas: true },
    race: { field: 'race', type: 'string', showOnCanvas: true },
    background: { field: 'background', type: 'string' },
    subclass: { field: 'subclass', type: 'string', showOnCanvas: true },
    alignment: { field: 'alignment', type: 'string', showOnCanvas: true },
    armorClass: { field: 'armorClass', type: 'number', showOnCanvas: true },
    hitPoints: { field: 'hitPoints', type: 'number', showOnCanvas: true },
    speed: { field: 'speed', type: 'string', showOnCanvas: true },
    initiative: { field: 'initiative', type: 'string', showOnCanvas: true },
    proficiencyBonus: { field: 'proficiencyBonus', type: 'string', showOnCanvas: true },
    proficiencies: { field: 'proficiencies', type: 'string' },
    features: { field: 'features', type: 'string' },
    subclassFeatures: { field: 'subclassFeatures', type: 'string' },
    spells: { field: 'spells', type: 'string' },
    abilityScores: { field: 'abilityScores', type: 'string' },
    savingThrows: { field: 'savingThrows', type: 'string' },
    skills: { field: 'skills', type: 'string' },
    age: { field: 'age', type: 'number', showOnCanvas: true },
    abilities: { field: 'abilities', type: 'array' },
    equipment: { field: 'equipment', type: 'array' },
    personality: { field: 'personality', type: 'string' },
    appearance: { field: 'appearance', type: 'string' },
    deity: { field: 'deity', type: 'string', showOnCanvas: true },
  },
  city: {
    name: { field: 'name', type: 'string' },
    description: { field: 'description', type: 'string' },
    predominantRace: { field: 'predominantRace', type: 'string', showOnCanvas: true },
    government: { field: 'government', type: 'string', showOnCanvas: true },
    alignment: { field: 'alignment', type: 'string', showOnCanvas: true },
    population: { field: 'population', type: 'number', showOnCanvas: true },
    wealth: { field: 'wealth', type: 'string', showOnCanvas: true },
    influence: { field: 'influence', type: 'string' },
    districts: { field: 'districts', type: 'string' },
    keyBuildings: { field: 'keyBuildings', type: 'string' },
    notableFeatures: { field: 'notableFeatures', type: 'string' },
    keyNPCs: { field: 'keyNPCs', type: 'string' },
    aesthetics: { field: 'aesthetics', type: 'string' },
    ideals: { field: 'ideals', type: 'string' },
    bonds: { field: 'bonds', type: 'string' },
    flaws: { field: 'flaws', type: 'string' },
    mainFactions: { field: 'mainFactions', type: 'string' },
    allies: { field: 'allies', type: 'string' },
    enemies: { field: 'enemies', type: 'string' },
    dominionSize: { field: 'dominionSize', type: 'string', showOnCanvas: true },
    proficiencyBonus: { field: 'proficiencyBonus', type: 'string', showOnCanvas: true },
    abilityScores: { field: 'abilityScores', type: 'string' },
    economy: { field: 'economy', type: 'string' },
    landmarks: { field: 'landmarks', type: 'array' },
    history: { field: 'history', type: 'string' },
    culture: { field: 'culture', type: 'string' },
  },
  deity: {
    name: { field: 'name', type: 'string' },
    description: { field: 'description', type: 'string' },
    class: { field: 'class', type: 'string', showOnCanvas: true },
    race: { field: 'race', type: 'string', showOnCanvas: true },
    background: { field: 'background', type: 'string' },
    subclass: { field: 'subclass', type: 'string', showOnCanvas: true },
    alignment: { field: 'alignment', type: 'string', showOnCanvas: true },
    domains: { field: 'domains', type: 'array' },
    symbol: { field: 'symbol', type: 'string' },
    animal: { field: 'animal', type: 'string' },
    weapon: { field: 'weapon', type: 'string' },
    colour: { field: 'colour', type: 'string' },
    tenets: { field: 'tenets', type: 'string' },
    deity: { field: 'deity', type: 'string', showOnCanvas: true },
  },
  item: {
    name: { field: 'name', type: 'string' },
    description: { field: 'description', type: 'string' },
    type: { field: 'type', type: 'string', showOnCanvas: true },
    rarity: { field: 'rarity', type: 'string', showOnCanvas: true },
    properties: { field: 'properties', type: 'array' },
    value: { field: 'value', type: 'number' },
    weight: { field: 'weight', type: 'number' },
    requirements: { field: 'requirements', type: 'array' },
  },
  location: {
    name: { field: 'name', type: 'string' },
    description: { field: 'description', type: 'string' },
    type: { field: 'type', type: 'string', showOnCanvas: true },
    size: { field: 'size', type: 'string' },
    climate: { field: 'climate', type: 'string' },
    inhabitants: { field: 'inhabitants', type: 'array' },
    resources: { field: 'resources', type: 'array' },
    dangers: { field: 'dangers', type: 'array' },
  },
};

export const DEFAULT_TAGS: Record<string, string[]> = {
  character: ['NPC', 'Character'],
  city: ['Location', 'Settlement'],
  item: ['Item', 'Equipment'],
  location: ['Location', 'Place'],
};

export class GeneratorParser {
  static parseGeneratorData(generatorData: GeneratorData): Omit<ExtendedAsset, 'id' | 'x' | 'y' | 'parentId' | 'children'> {
    const { type, data } = generatorData;
    const mapping = GENERATOR_MAPPINGS[type];
    const defaultTags = DEFAULT_TAGS[type] || [];

    if (!mapping) {
      throw new Error(`Unsupported generator type: ${type}`);
    }

    const asset: Partial<ExtendedAsset> = {
      type: 'card', // Default type for generated assets
      customFields: [],
      tags: defaultTags,
    };

    // Map standard fields
    if (data.name) asset.name = String(data.name);
    if (data.description) asset.description = String(data.description);

    // Create custom fields from mapped data
    const customFields: CustomField[] = [];
    const customFieldValues: CustomFieldValue[] = [];

    Object.entries(mapping).forEach(([key, config]) => {
      const value = data[config.field];
      
      if (value !== undefined && value !== null) {
        let processedValue: string;

        switch (typeof value) {
          case 'string':
            processedValue = value;
            break;
          case 'number':
            processedValue = String(value);
            break;
          default:
            processedValue = String(value);
        }

        const fieldId = createId();
        customFields.push({
          id: fieldId,
          label: key,
          type: 'text',
          displayInViewport: config.showOnCanvas || false,
        });
        
        customFieldValues.push({
          fieldId: fieldId,
          value: processedValue,
        });
      }
    });

    // Add any additional fields not in mapping as custom fields
    Object.entries(data).forEach(([key, value]) => {
      const isMapped = Object.values(mapping).some(config => config.field === key);
      const isStandardField = ['name', 'description'].includes(key);

      if (!isMapped && !isStandardField && value !== undefined && value !== null) {
        let processedValue: string;

        if (Array.isArray(value)) {
          processedValue = value.join(', ');
        } else if (typeof value === 'object') {
          processedValue = JSON.stringify(value);
        } else {
          processedValue = String(value);
        }

        const fieldId = createId();
        customFields.push({
          id: fieldId,
          label: key,
          type: 'text',
          displayInViewport: false,
        });
        
        customFieldValues.push({
          fieldId: fieldId,
          value: processedValue,
        });
      }
    });

    asset.customFields = customFields;
    asset.customFieldValues = customFieldValues;

    return asset as Omit<ExtendedAsset, 'id' | 'x' | 'y' | 'parentId' | 'children'>;
  }

  static validateGeneratorData(generatorData: any): generatorData is GeneratorData {
    return (
      generatorData &&
      typeof generatorData === 'object' &&
      typeof generatorData.type === 'string' &&
      ['character', 'city', 'item', 'location'].includes(generatorData.type) &&
      generatorData.data &&
      typeof generatorData.data === 'object'
    );
  }

  static getSupportedTypes(): string[] {
    return Object.keys(GENERATOR_MAPPINGS);
  }

  static getMappingForType(type: string): GeneratorMapping | null {
    return GENERATOR_MAPPINGS[type] || null;
  }
}

// Example generator data for testing
export const EXAMPLE_GENERATOR_DATA = {
  character: {
    type: 'character',
    data: {
      name: 'Aldric Stormwind',
      description: 'A brave warrior from the northern mountains',
      age: 35,
      class: 'Fighter',
      race: 'Human',
      background: 'Former soldier turned adventurer',
      abilities: ['Sword Mastery', 'Shield Wall', 'Battle Cry'],
      equipment: ['Longsword', 'Shield', 'Chain Mail'],
      personality: 'Brave, loyal, and protective',
      appearance: 'Tall with broad shoulders and weathered face',
    },
  },
  city: {
    type: 'city',
    data: {
      name: 'Silverhaven',
      description: 'A bustling port city on the western coast',
      population: 50000,
      government: 'Merchant Council',
      economy: 'Trade and fishing',
      landmarks: ['Grand Harbor', 'Merchant Quarter', 'Temple of the Sea'],
      districts: ['Harbor District', 'Market District', 'Noble Quarter'],
      history: 'Founded 200 years ago as a trading post',
      culture: 'Maritime traditions and merchant values',
    },
  },
};
