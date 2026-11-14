import type { ToolDefinition, ToolSchema } from '../shared/tools.js';
import { mathCatalogue } from './math-contracts.generated.js';
import { executeMath } from './math-client.js';
export function mathDefinitions(datasets: any, allowedDatasetIds: string[] = []): ToolDefinition[] {
    return mathCatalogue.map(item => {
        const descriptor = item as unknown as Omit<ToolDefinition, 'execute'>;
        return {...descriptor, parameters: descriptor.parameters as ToolSchema,
            async execute(args, {signal, progress}) {
                let dataset;
                if (item.name === 'analyze_data' || (item.name === 'plot_math' && args.operation !== 'function')) {
                    if (!args.datasetId || !allowedDatasetIds.includes(args.datasetId))
                        throw Object.assign(Error('Dataset is not attached to this run.'), {code:'DATASET_REQUIRED'});
                    const data = datasets.get(args.datasetId);
                    dataset = {columns:data.columns, rows:data.rows};
                }
                return executeMath({schemaVersion:2, tool:item.name, arguments:args, ...(dataset ? {dataset} : {})}, signal, progress);
            }};
    });
}
