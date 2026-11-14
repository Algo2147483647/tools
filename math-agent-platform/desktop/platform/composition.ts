import fs from 'node:fs/promises';
import { RunService, type RunServiceOptions } from '../application/runs.js';
import type { ToolSession } from '../application/ports.js';
import type { Edit } from '../shared/contracts.js';
import { ArtifactStore } from '../tools/artifacts.js';
import { DatasetStore } from '../tools/datasets.js';
import { EditorDocument, editorDefinition } from '../tools/editor-document.js';
import { CodeWorkspace, workspaceDefinition } from '../tools/code-workspace.js';
import { LeanWorkspace, leanDefinitions } from '../tools/lean.js';
export function createToolSession(notifyEdit: (edit: Edit) => void = () => { }): ToolSession {
    const artifacts = new ArtifactStore(), datasets = new DatasetStore(), document = new EditorDocument(notifyEdit), workspace = new CodeWorkspace(), lean = new LeanWorkspace();
    const edit = editorDefinition(document), apply = edit.execute;
    edit.execute = async (args, context) => { if (args.file) {
        const file = await workspace.file(args.file, true);
        if ((await fs.stat(file)).size > 262144)
            throw Error('Editor file exceeds 256 KB.');
        args = { ...args, text: await fs.readFile(file, 'utf8') };
    } return apply(args, context); };
    return { artifacts, datasets, document, definitions: [workspaceDefinition(workspace), edit, ...leanDefinitions(lean)], clear: async () => { await Promise.all([workspace.clear(), lean.clear()]); } };
}
export function createRunService(options: Omit<RunServiceOptions, 'session'> & {
    notifyEdit?: (edit: Edit) => void;
} = {}) { return new RunService({ ...options, session: createToolSession(options.notifyEdit) }); }
