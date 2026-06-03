import { describe, it, expect } from 'vitest';
import { GLOBAL_MEMORY_TOOLS, shouldBypassApproval, MEMORY_TYPES } from '../memory';

describe('GLOBAL_MEMORY_TOOLS', () => {
  it('has exactly 2 entries', () => {
    expect(GLOBAL_MEMORY_TOOLS).toHaveLength(2);
  });

  it('has read_memory as the first tool', () => {
    expect(GLOBAL_MEMORY_TOOLS[0].name).toBe('read_memory');
  });

  it('has write_memory as the second tool', () => {
    expect(GLOBAL_MEMORY_TOOLS[1].name).toBe('write_memory');
  });

  it('read_memory has alwaysAllow === true', () => {
    expect(GLOBAL_MEMORY_TOOLS[0].alwaysAllow).toBe(true);
  });

  it('write_memory has alwaysAllow === true', () => {
    expect(GLOBAL_MEMORY_TOOLS[1].alwaysAllow).toBe(true);
  });

  describe('read_memory schema', () => {
    const tool = GLOBAL_MEMORY_TOOLS[0];
    const schema = tool.input_schema as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };

    it('has type object', () => {
      expect(schema.type).toBe('object');
    });

    it('requires topic', () => {
      expect(schema.required).toEqual(['topic']);
    });

    it('has topic property of type string', () => {
      expect((schema.properties.topic as { type: string }).type).toBe('string');
    });
  });

  describe('write_memory schema', () => {
    const tool = GLOBAL_MEMORY_TOOLS[1];
    const schema = tool.input_schema as {
      type: string;
      properties: Record<string, { type?: string; enum?: string[] }>;
      required: string[];
    };

    it('has type object', () => {
      expect(schema.type).toBe('object');
    });

    it('requires name, description, type, content', () => {
      expect(schema.required).toEqual(['name', 'description', 'type', 'content']);
    });

    it('type property has enum matching MEMORY_TYPES', () => {
      expect(schema.properties.type.enum).toEqual([...MEMORY_TYPES]);
    });

    it('name property is a string', () => {
      expect(schema.properties.name.type).toBe('string');
    });

    it('description property is a string', () => {
      expect(schema.properties.description.type).toBe('string');
    });

    it('content property is a string', () => {
      expect(schema.properties.content.type).toBe('string');
    });
  });
});

describe('shouldBypassApproval', () => {
  it('returns true for write_memory with alwaysAllow tool flag', () => {
    expect(shouldBypassApproval('write_memory', false, GLOBAL_MEMORY_TOOLS)).toBe(true);
  });

  it('returns true for read_memory with alwaysAllow tool flag', () => {
    expect(shouldBypassApproval('read_memory', false, GLOBAL_MEMORY_TOOLS)).toBe(true);
  });

  it('returns false for write_file (not in GLOBAL_MEMORY_TOOLS)', () => {
    expect(shouldBypassApproval('write_file', false, GLOBAL_MEMORY_TOOLS)).toBe(false);
  });

  it('returns true for write_file when viewAlwaysAllowed is true', () => {
    expect(shouldBypassApproval('write_file', true, GLOBAL_MEMORY_TOOLS)).toBe(true);
  });

  it('returns false for unknown_tool with empty tools list', () => {
    expect(shouldBypassApproval('unknown_tool', false, [])).toBe(false);
  });

  it('returns true for any tool when viewAlwaysAllowed is true', () => {
    expect(shouldBypassApproval('any_tool', true, [])).toBe(true);
  });
});
