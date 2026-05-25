import { createElement } from 'react';
import type { RegisteredViewType, ViewInstance, ViewTypeDefinition } from './types';

const registry = new Map<string, RegisteredViewType>();

export function registerView<TConfig>(def: ViewTypeDefinition<TConfig>): void {
  registry.set(def.typeId, {
    typeId: def.typeId,
    label: def.label,
    description: def.description,
    icon: def.icon,
    createConfig: def.createConfig,
    render: (instance: ViewInstance) =>
      createElement(def.Component, {
        instance: instance as ViewInstance<TConfig>,
      }),
  });
}

export function getViewType(typeId: string): RegisteredViewType | undefined {
  return registry.get(typeId);
}

export function listViewTypes(): RegisteredViewType[] {
  return Array.from(registry.values());
}
