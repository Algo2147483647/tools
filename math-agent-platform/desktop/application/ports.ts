import type { Artifact, Dataset, Edit } from '../shared/contracts.js';
import type { ToolDefinition } from '../shared/tools.js';
export interface ArtifactRepository {
    clear(): void;
    put(runId: string, value: unknown): Artifact;
    putView(runId: string, view: any): Artifact;
    get(runId: string, id: string): any;
}
export interface DatasetRepository {
    import(name: string, text: string): Dataset;
    describe(ids: string[]): Dataset[];
    get(id: string): {
        columns: string[];
        rows: (string | null)[][];
        descriptor: Dataset;
    };
    clear(): void;
}
export interface DocumentPort {
    update(text: string): {
        text: string;
        revision: number;
    };
    snapshot(): {
        text: string;
        revision: number;
    };
    acknowledge(value: {
        id: string;
        applied: boolean;
        text: string;
    }): void;
}
export interface ToolSession {
    artifacts: ArtifactRepository;
    datasets: DatasetRepository;
    document: DocumentPort;
    definitions: ToolDefinition[];
    clear(): Promise<void>;
}
