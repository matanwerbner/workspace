import type { ComponentType, ReactNode } from 'react';

export interface ViewInstance<TConfig = unknown> {
  id: string;
  typeId: string;
  name: string;
  config: TConfig;
}

export interface ViewTypeDefinition<TConfig = unknown> {
  typeId: string;
  label: string;
  description: string;
  icon: ReactNode;
  createConfig: () => Promise<{ name: string; config: TConfig } | null>;
  Component: ComponentType<{ instance: ViewInstance<TConfig> }>;
}

export interface RegisteredViewType {
  typeId: string;
  label: string;
  description: string;
  icon: ReactNode;
  createConfig: () => Promise<{ name: string; config: unknown } | null>;
  render: (instance: ViewInstance) => ReactNode;
}
