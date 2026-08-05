export interface SecretaryModel {
  bindTools(tools: unknown[]): unknown;
}

export interface SecretaryDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
}

export type SecretaryHeadersInit =
  | Headers
  | Record<string, string>
  | Iterable<readonly [string, string]>;

export interface SecretaryAIOptions {
  mcpServerUrl: string | URL;
  serverName: string;
  model: SecretaryModel;
  db?: SecretaryDatabase;
  timeZone?: string;
  systemPrompt?: string;
}

export interface SecretaryConfigurable {
  thread_id: string;
  checkpoint_ns?: string;
  checkpoint_id?: string;
  [key: string]: unknown;
}

export interface SecretaryChatConfig {
  configurable: SecretaryConfigurable;
  headers?: SecretaryHeadersInit;
  metadata?: Record<string, unknown>;
  recursionLimit?: number;
}

export interface SecretaryContentBlock {
  type: string;
  [key: string]: unknown;
}

export interface SecretaryChatResult {
  content: SecretaryContentBlock[];
  artifact: unknown[];
}

declare class SecretaryAI {
  constructor(options: SecretaryAIOptions);

  get isConnected(): boolean;

  connect(headers?: SecretaryHeadersInit): Promise<void>;
  close(): Promise<void>;
  clear(threadId: string): Promise<void>;
  chat(query: string, config: SecretaryChatConfig): Promise<SecretaryChatResult>;
}

export {SecretaryAI};
export default SecretaryAI;
