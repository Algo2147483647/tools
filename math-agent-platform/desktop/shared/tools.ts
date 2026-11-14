import type { ContentEvent } from './run-state';
import type { View } from './contracts';
/** Parsed provider/worker JSON. Runtime schemas validate each tool boundary. */
export type JsonObject = Record<string, any>;
export interface ToolSchema {
    type: string;
    properties?: Record<string, ToolSchema>;
    required?: string[];
    additionalProperties?: boolean;
    items?: ToolSchema;
    enum?: unknown[];
    maxLength?: number;
    minLength?: number;
    minItems?: number;
    maxItems?: number;
    minimum?: number;
    maximum?: number;
}
export interface ToolContext {
    deadline?: number;
    callId?: string;
    signal: AbortSignal;
    progress: (stage: string, message: string) => void;
}
export interface ToolValue {
    result: unknown;
    views?: View[];
    assumptions?: string[];
    diagnostics?: Record<string, unknown>;
    verification?: {
        status: string;
        scope?: string;
        checks?: {
            name: string;
            passed: boolean;
            detail?: string;
        }[];
    };
    warnings?: string[];
    error?: {
        code: string;
        message: string;
    } | null;
}
export interface ToolDefinition {
    name: string;
    version: string;
    description: string;
    operation?: string;
    operations?: string[];
    timeoutMs: number;
    parameters: ToolSchema;
    execute: (args: JsonObject, context: ToolContext) => Promise<ToolValue>;
}
export interface ToolRequest {
    schemaVersion: number;
    runId: string;
    callId: string;
    tool: string;
    operation: string;
    arguments: unknown;
    limits?: {
        timeoutMs?: number;
        maxOutputBytes?: number;
    };
}
export interface RegistryContext {
    signal: AbortSignal;
    emit?: (event: ContentEvent) => void;
    redact?: (message: string) => string;
}
