export interface Settings {
    provider: string;
    baseUrl: string;
    model: string;
    maxTokens: number;
    hasKey?: boolean;
    apiKey?: string;
    keepApiKey?: boolean;
}
export interface Dataset {
    id: string;
    name: string;
    rows: number;
    columns: {
        name: string;
    }[];
    sha256: string;
}
export interface Artifact {
    id: string;
    kind: string;
    title?: string;
}
export interface ToolOutput {
    schemaVersion?: number;
    callId?: string;
    tool?: string;
    operation?: string;
    status: string;
    result: unknown;
    diagnostics: Record<string, unknown>;
    verification: {
        status: string;
        scope?: string;
        checks?: {
            name: string;
            passed: boolean;
        }[];
    };
    artifacts: Artifact[];
    assumptions: string[];
    warnings: string[];
    error?: {
        code: string;
        message: string;
    } | null;
}
export interface Block {
    id: string;
    kind: 'text' | 'tool';
    text?: string;
    name?: string;
    operation?: string;
    input?: unknown;
    status: string;
    startedAt: string;
    finishedAt?: string;
    compatibility?: string;
    usage?: Record<string, number>;
    limits?: {
        timeoutMs: number;
    };
    output?: ToolOutput;
    progressEvents?: {
        timestamp: string;
        message: string;
        stage: string;
    }[];
}
export interface Run {
    id: string;
    input: string;
    settings: Settings;
    status: string;
    createdAt: string;
    finishedAt?: string | null;
    revision: number;
    events: {
        timestamp: string;
        stage: string;
        message: string;
        runId?: string;
        sequence?: number;
    }[];
    blocks: Block[];
    datasets: Dataset[];
    textBytes: number;
    error?: {
        code?: string;
        message: string;
    } | null;
    result?: {
        truncated?: boolean;
        markdown?: string;
    } | null;
}
export interface Patch {
    runId: string;
    revision: number;
    event: Record<string, unknown>;
}
export interface Edit {
    id: string;
    baseText: string;
    text: string;
}
export interface LeanReport {
    status: string;
    source: string;
    hash: string;
    version: string;
    attempt: number;
    exitCode: number | null;
    trust: string;
    diagnostics: {
        severity: string;
        message: string;
        line: number | null;
        column: number | null;
    }[];
    rawOutput?: string;
}
export interface View extends Partial<LeanReport> {
    kind: string;
    title: string;
    data?: string;
    latex?: string;
    columns?: string[];
    rows?: (string | number | null)[][];
    totalRows?: number;
}
export interface Bootstrap {
    presets: Record<string, {
        label: string;
        baseUrl: string;
    }>;
    settings: Settings | null;
    runs: Run[];
    cachedModels?: string[];
    settingsError?: string;
}
export interface EditorApi {
    getMarkdown(): string;
    setMarkdown(text: string): void;
    destroy(): void;
    focus(): void;
    on(event: string, callback: () => void): void;
    moveCursorToEnd(): void;
    insertText(text: string): void;
}
export interface RunRecord extends Run {
    schemaVersion: number;
    parentId: string | null;
    inputHash: string;
    datasetIds: string[];
    contentEvents: number;
}
