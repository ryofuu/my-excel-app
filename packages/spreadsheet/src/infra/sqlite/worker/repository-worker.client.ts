import type {
  RepositoryCommand,
  RepositoryCommandResult,
  RepositoryWorkerRequest,
  RepositoryWorkerResponse,
} from "./repository-worker.protocol";

export type RepositoryWorker = Readonly<{
  postMessage: (message: RepositoryWorkerRequest) => void;
  addEventListener: (
    type: "message" | "error",
    listener: (event: MessageEvent<RepositoryWorkerResponse> | Event) => void,
  ) => void;
  removeEventListener: (
    type: "message" | "error",
    listener: (event: MessageEvent<RepositoryWorkerResponse> | Event) => void,
  ) => void;
  terminate?: () => void;
}>;

export type RepositoryWorkerClient = Readonly<{
  execute: (command: RepositoryCommand) => Promise<RepositoryCommandResult>;
  dispose: () => void;
}>;

type Deferred = Readonly<{
  resolve: (result: RepositoryCommandResult) => void;
  reject: (error: Error) => void;
}>;

/** Maps request/response messages without letting Entity instances cross Worker. */
export const createRepositoryWorkerClient = (
  worker: RepositoryWorker,
): RepositoryWorkerClient => {
  let nextRequestId = 0;
  const pending = new Map<string, Deferred>();

  const rejectAll = (error: Error): void => {
    for (const deferred of pending.values()) {
      deferred.reject(error);
    }
    pending.clear();
  };

  const onMessage = (event: MessageEvent<RepositoryWorkerResponse> | Event): void => {
    if (!("data" in event)) {
      return;
    }
    const response = event.data;
    const deferred = pending.get(response.requestId);
    if (!deferred) {
      return;
    }
    pending.delete(response.requestId);
    if (response.ok) {
      deferred.resolve(response.result);
    } else {
      deferred.reject(new Error(response.error.message));
    }
  };
  const onError = (): void => {
    rejectAll(new Error("The SQLite repository worker stopped unexpectedly."));
  };

  worker.addEventListener("message", onMessage);
  worker.addEventListener("error", onError);

  return {
    execute: (command) =>
      new Promise<RepositoryCommandResult>((resolve, reject) => {
        const requestId = `repository-${nextRequestId}`;
        nextRequestId += 1;
        pending.set(requestId, { resolve, reject });
        worker.postMessage({ requestId, command });
      }),
    dispose: () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      rejectAll(new Error("The SQLite repository worker was disposed."));
      worker.terminate?.();
    },
  };
};

export const createSqliteWorkerClient = (): RepositoryWorkerClient => {
  const worker = new Worker(new URL("./repository.worker.ts", import.meta.url), {
    type: "module",
  });
  return createRepositoryWorkerClient(worker);
};
