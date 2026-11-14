import {executeMath} from './math-client.js';
export async function compute(input: string, signal: AbortSignal, emit: (stage:string,message:string)=>void = () => {}, _timeoutMs = 30000): Promise<any> {
    const output = await executeMath({schemaVersion:2,tool:'exact_math',arguments:{expression:input}},signal,emit);
    return output.result;
}
