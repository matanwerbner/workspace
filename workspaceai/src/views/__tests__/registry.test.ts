import { describe, expect, it, vi } from 'vitest';
import { getViewType, listViewTypes, registerView } from '../registry';

// The registry is a module-level Map singleton. Each test registers under a
// unique typeId so tests don't interfere with each other.
let seq = 0;
function nextTypeId() {
  return `__test_view_${++seq}__`;
}

function minimalDef(typeId: string) {
  return {
    typeId,
    label: 'Test',
    description: 'A test view',
    icon: null as unknown as React.ReactNode,
    createConfig: async () => null,
    Component: () => null,
  };
}

describe('getViewType', () => {
  it('returns undefined for an unregistered typeId', () => {
    expect(getViewType('__definitely_not_registered__')).toBeUndefined();
  });

  it('returns the entry after registerView', () => {
    const typeId = nextTypeId();
    registerView(minimalDef(typeId));
    const entry = getViewType(typeId);
    expect(entry).toBeDefined();
    expect(entry!.typeId).toBe(typeId);
    expect(entry!.label).toBe('Test');
    expect(entry!.description).toBe('A test view');
  });
});

describe('listViewTypes', () => {
  it('includes every registered typeId', () => {
    const a = nextTypeId();
    const b = nextTypeId();
    registerView(minimalDef(a));
    registerView(minimalDef(b));
    const ids = listViewTypes().map((t) => t.typeId);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
  });
});

describe('registerView — render wrapper', () => {
  it('render returns a React element whose type is the Component', () => {
    const typeId = nextTypeId();
    const Component = vi.fn(() => null) as unknown as React.ComponentType<{
      instance: unknown;
    }>;
    registerView({ ...minimalDef(typeId), Component });

    const instance = { id: 'v1', typeId, name: 'my view', config: {} };
    const element = getViewType(typeId)!.render(instance);
    expect(element).toBeDefined();
    // React.createElement returns { type, props, ... }
    expect((element as { type: unknown }).type).toBe(Component);
    expect((element as { props: { instance: unknown } }).props.instance).toBe(instance);
  });
});

describe('registerView — executeTool wrapper', () => {
  it('is undefined when the definition omits executeTool', () => {
    const typeId = nextTypeId();
    registerView(minimalDef(typeId));
    expect(getViewType(typeId)!.executeTool).toBeUndefined();
  });

  it('delegates to the original executeTool with the same arguments', async () => {
    const typeId = nextTypeId();
    const handler = vi.fn().mockResolvedValue('result-42');
    registerView({ ...minimalDef(typeId), executeTool: handler });

    const instance = { id: 'v1', typeId, name: 'v', config: {} };
    const result = await getViewType(typeId)!.executeTool!(
      'my_tool',
      { key: 'value' },
      instance,
    );
    expect(result).toBe('result-42');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('my_tool', { key: 'value' }, instance);
  });
});

describe('registerView — getContext wrapper', () => {
  it('is undefined when the definition omits getContext', () => {
    const typeId = nextTypeId();
    registerView(minimalDef(typeId));
    expect(getViewType(typeId)!.getContext).toBeUndefined();
  });

  it('delegates to the original getContext and returns its value', () => {
    const typeId = nextTypeId();
    const getContext = vi.fn().mockReturnValue('file: foo.ts');
    registerView({ ...minimalDef(typeId), getContext });

    const instance = { id: 'v1', typeId, name: 'v', config: {} };
    const ctx = getViewType(typeId)!.getContext!(instance);
    expect(ctx).toBe('file: foo.ts');
    expect(getContext).toHaveBeenCalledWith(instance);
  });
});

describe('registerView — tools', () => {
  it('passes the tools array through unchanged', () => {
    const typeId = nextTypeId();
    const tools = [
      { name: 'read_file', description: 'reads a file', input_schema: { type: 'object' } },
    ];
    registerView({ ...minimalDef(typeId), tools });
    expect(getViewType(typeId)!.tools).toEqual(tools);
  });

  it('tools is undefined when not provided', () => {
    const typeId = nextTypeId();
    registerView(minimalDef(typeId));
    expect(getViewType(typeId)!.tools).toBeUndefined();
  });
});
