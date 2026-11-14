export const commandNames = ['copyAnswer', 'exportRun', 'bootstrap', 'importDataset', 'get', 'artifact', 'start', 'cancel', 'configure', 'models', 'test', 'clear', 'editorSync', 'editorAck'] as const;
export type CommandName = typeof commandNames[number];
export type CommandResponse<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
    };
};
