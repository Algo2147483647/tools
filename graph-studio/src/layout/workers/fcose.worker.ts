import { solveFcose } from "../compound/fcose/solver";
import { handleLayoutWorker, type FcoseWorkerInput } from "./protocol";
handleLayoutWorker(self, (input: FcoseWorkerInput) => solveFcose(input.problem), "fCoSE layout failed.");
