export const projectJsonSchema = {
  type: 'object',
  required: ['schemaVersion', 'projectId', 'projectName', 'createdAt', 'updatedAt', 'settings', 'canvases', 'assets', 'tags'],
  additionalProperties: false,
  properties: {
    schemaVersion: { const: 1 },
    projectId: { type: 'string', minLength: 1 },
    projectName: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    createdAt: { type: 'string', minLength: 1 },
    updatedAt: { type: 'string', minLength: 1 },
    appVersion: { type: 'string' },
    settings: { type: 'object' },
    canvases: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'rootAssetIds'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1 },
          rootAssetIds: { type: 'array', items: { type: 'string', minLength: 1 } },
        },
      },
    },
    assets: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'projectId', 'layout', 'content', 'style', 'behavior', 'metadata'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1 },
          projectId: { type: 'string', minLength: 1 },
          parentId: { type: 'string', minLength: 1 },
          layout: { type: 'object' },
          content: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              text: { type: 'string' },
              imageRef: { type: 'string' },
              customFields: { type: 'object' },
            },
          },
          style: { type: 'object' },
          behavior: { type: 'object' },
          metadata: {
            type: 'object',
            required: ['createdAt', 'updatedAt', 'version'],
            properties: {
              tags: { type: 'array', items: { type: 'string' } },
              createdAt: { type: 'string', minLength: 1 },
              updatedAt: { type: 'string', minLength: 1 },
              version: { type: 'number' },
            },
          },
        },
      },
    },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'scope', 'createdAt', 'updatedAt'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1 },
          projectId: { type: 'string' },
          name: { type: 'string', minLength: 1 },
          color: { type: 'string' },
          scope: { enum: ['project', 'global'] },
          createdAt: { type: 'string', minLength: 1 },
          updatedAt: { type: 'string', minLength: 1 },
        },
      },
    },
  },
} as const;
