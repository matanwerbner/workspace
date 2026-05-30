import type { ComponentType, ReactNode } from 'react';

export interface ViewInstance<TConfig = unknown> {
  id: string;
  typeId: string;
  name: string;
  config: TConfig;
}

export interface AiTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ViewTypeDefinition<TConfig = unknown> {
  typeId: string;
  label: string;
  description: string;
  icon: ReactNode;
  createConfig: () => Promise<{ name: string; config: TConfig } | null>;
  Component: ComponentType<{ instance: ViewInstance<TConfig> }>;
  tools?: AiTool[];
  executeTool?: (
    name: string,
    input: Record<string, unknown>,
    instance: ViewInstance<TConfig>,
  ) => Promise<unknown>;
  getContext?: (instance: ViewInstance<TConfig>) => string;
}

export interface RegisteredViewType {
  typeId: string;
  label: string;
  description: string;
  icon: ReactNode;
  createConfig: () => Promise<{ name: string; config: unknown } | null>;
  render: (instance: ViewInstance) => ReactNode;
  tools?: AiTool[];
  executeTool?: (
    name: string,
    input: Record<string, unknown>,
    instance: ViewInstance,
  ) => Promise<unknown>;
  getContext?: (instance: ViewInstance) => string;
}
