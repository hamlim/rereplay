import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export class PersistentMap<K, V> {
  private name: string;
  private cacheDir: string;
  private staleAfter: number;
  private map: Map<
    K,
    { value: V; createdAt: Date; metadata: Record<string, any> }
  >;
  private filePath: string;

  constructor({
    name,
    staleAfter,
    cacheDir,
  }: {
    name: string;
    staleAfter?: number;
    cacheDir: string;
  }) {
    this.name = name;
    this.cacheDir = cacheDir;
    this.filePath = join(this.cacheDir, `.${this.name}.rereplay.json`);
    this.staleAfter = staleAfter || 7 * 24 * 60 * 60 * 1000;
    this.map = new Map<
      K,
      { value: V; createdAt: Date; metadata: Record<string, any> }
    >();

    this.load();
  }

  public setCacheFile(scope: string) {
    this.filePath = join(this.cacheDir, `.${scope}.rereplay.json`);
    this.load();
  }

  private load() {
    try {
      const data = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(data);
      this.map = new Map(parsed);

      // Iterate through the map and delete old entries to keep things clean
      for (const [key, entry] of this.map.entries()) {
        const staleAfter = new Date(Date.now() - this.staleAfter);
        if (entry.createdAt < staleAfter) {
          this.delete(key);
        }
      }
    } catch (error) {
      // If the file exists but is invalid, delete it
      if (existsSync(this.filePath)) {
        try {
          unlinkSync(this.filePath);
          console.warn(`Invalid file at ${this.filePath} has been deleted.`);
        } catch (unlinkError) {
          console.error(
            `Failed to delete invalid file at ${this.filePath}:`,
            unlinkError,
          );
        }
      }
    }
  }

  private save() {
    const data = JSON.stringify(Array.from(this.map.entries()));
    writeFileSync(this.filePath, data);
  }

  set(key: K, value: V, metadata: Record<string, any> = {}): this {
    this.map.set(key, {
      value,
      createdAt: new Date(),
      metadata,
    });
    this.save();
    return this;
  }

  get(key: K): V | undefined {
    const result = this.map.get(key);
    if (result?.createdAt) {
      const staleAfter = new Date(Date.now() - this.staleAfter);
      if (result.createdAt < staleAfter) {
        this.map.delete(key);
        return undefined;
      }
      return result.value;
    }
    return undefined;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    const result = this.map.delete(key);
    if (result) {
      this.save();
    }
    return result;
  }

  clear(): void {
    this.map.clear();
    this.save();
  }

  entries(): IterableIterator<[K, V]> {
    return Array.from(this.map.entries())
      .map(([key, entry]) => [key, entry.value] as [K, V])
      [Symbol.iterator]();
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return Array.from(this.map.values())
      .map((entry) => entry.value)
      [Symbol.iterator]();
  }
  forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any,
  ): void {
    this.map.forEach(
      (entry, key) =>
        callbackfn(entry.value, key, this as unknown as Map<K, V>),
      thisArg,
    );
  }

  get size(): number {
    return this.map.size;
  }
}

type SerializedResponse = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string | null;
  bodyType: "text" | "json" | "stream" | "file";
  fileName?: string;
  fileType?: string;
};

// export async function serializeResponse(response: Response): Promise<string> {
//   const serialized: SerializedResponse = {
//     status: response.status,
//     statusText: response.statusText,
//     headers: Array.from(response.headers.entries()),
//     body: null,
//     bodyType: 'text',
//   };

//   if (response.headers.get('content-type')?.includes('text/event-stream')) {
//     serialized.bodyType = 'stream';

//     const reader = response.body!.getReader();
//     const chunks: string[] = [];
//     while (true) {
//       const { done, value } = await reader!.read();
//       if (done) break;

//       chunks.push(value.toString());
//     }
//     serialized.body = chunks.join(CHUNK_SPLITTER);
//   } else {
//     const clone = response.clone();
//     try {
//       const blob = await response.blob();

//       if (blob.type.includes('application/json')) {
//         serialized.bodyType = 'json';
//         serialized.body = await response.text();
//       } else if (!blob.type.includes('text/event-stream') && !blob.type.includes('text/plain')) {
//         // Assume it's a file
//         serialized.bodyType = 'file';
//         serialized.fileType = blob.type;
//         serialized.body = await blobToBase64(blob);
//       } else {
//         serialized.bodyType = 'text';
//         serialized.body = await response.text();
//       }
//     } catch {
//       serialized.bodyType = 'text';
//       serialized.body = await clone.text();
//     }
//   }

//   return JSON.stringify(serialized);
// }

// export function deserializeResponse(serializedString: string): Response {
//   const serialized: SerializedResponse = JSON.parse(serializedString);
//   let body: BodyInit | null = null;

//   if (serialized.bodyType === 'stream' && serialized.body) {
//     const chunks = serialized.body.split(CHUNK_SPLITTER).map((chunk) => new Uint8Array(chunk.split(',').map(Number)));
//     body = new ReadableStream({
//       start(controller) {
//         chunks.forEach((chunk) => controller.enqueue(chunk));
//         controller.close();
//       },
//     });
//   } else if (serialized.bodyType === 'file' && serialized.body) {
//     body = base64ToBlob(serialized.body);
//   } else if (serialized.body) {
//     body = serialized.body;
//   }

//   return new Response(body, {
//     status: serialized.status,
//     statusText: serialized.statusText,
//     headers: new Headers(serialized.headers),
//   });
// }

export async function blobToBase64(blob: Blob): Promise<string> {
  return JSON.stringify({
    type: blob.type,
    data: await blob
      .arrayBuffer()
      .then((buffer) => Buffer.from(buffer).toString("base64")),
  });
}

export function base64ToBlob(serializedString: string): Blob {
  const { type, data } = JSON.parse(serializedString);
  const buffer = Buffer.from(data, "base64");
  return new Blob([buffer], { type });
}

// export function removeDatesFromHeaders(headers: [string, string][]): [string, string][] {
//   return headers.map(([key, value]) => [key, value.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\b/, '')]);
// }

// export function hashString(input: string): string {
//   return createHash('sha256').update(input).digest('hex');
// }

// export function cleanRequest<T extends Request | RequestInit>(request: T): T {
//   const headers = new Headers(request.headers);
//   if (headers.has('Authorization')) {
//     headers.set('Authorization', `hashed_${hashString(headers.get('Authorization')!)}`);
//   }
//   if (headers.has('x-api-key')) {
//     headers.set('x-api-key', `hashed_${hashString(headers.get('x-api-key')!)}`);
//   }
//   if (request instanceof Request) {
//     return new Request(request.url, {
//       method: request.method,
//       headers: headers,
//       body: request.body,
//     }) as T;
//   }
//   return {
//     method: request.method,
//     headers: headers,
//     body: request.body,
//   } as T;
// }

// export async function requestToKey(
//   input: RequestInfo | URL,
//   init?: RequestInit,
// ): Promise<{ key: string; requestString: string }> {
//   const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
//   const method = init?.method || (input instanceof Request ? input.method : 'GET');

//   const headers = init?.headers
//     ? typeof init?.headers === 'string'
//       ? JSON.parse(init.headers)
//       : init.headers
//     : input instanceof Request
//       ? Object.fromEntries(input.headers)
//       : {};
//   const body = init?.body || (input instanceof Request ? input.body : '');
//   const contentType = headers['content-type'];
//   let bodyString =
//     body instanceof Blob ? await body.text() : body instanceof FormData ? body.toString() : (body as string);

//   // because multipart/form-data boundries include a hashed timestamp as a key frame
//   // we need to remove the boundary from the body string to make it deterministic
//   if (bodyString && contentType?.includes('multipart/form-data')) {
//     headers['content-type'] = 'multipart/form-data';
//     bodyString = bodyString.replace(/--+[a-zA-Z0-9]+/g, '').trim();
//   }

//   if (headers['authorization']) {
//     delete headers['authorization'];
//   }

//   const dataToHash = `${url}|${method}|${JSON.stringify(headers)}|${bodyString}`;
//   if (dataToHash.includes('[object ')) {
//     console.log(dataToHash);
//     throw new Error('Invalid data to hash, an object was not correctly stringified');
//   }
//   const hash = createHash('sha256').update(dataToHash).digest('base64');

//   return { key: hash.slice(0, 20), requestString: dataToHash };
// }

// Core

export let originalFetch: typeof globalThis.fetch;
export let rereplayCache: PersistentMap<string, string>;

let CHUNK_SPLITTER = "||==chunk==||";

export function setup({
  name,
  cacheDir,
  staleAfter,
}: { name?: string; cacheDir: string; staleAfter?: number }) {
  mkdirSync(cacheDir, { recursive: true });

  rereplayCache = new PersistentMap<string, string>({
    name: name || "rereplay",
    cacheDir,
    staleAfter,
  });

  return {
    configure(replayer: Replayer) {
      if (typeof originalFetch === "undefined") {
        originalFetch = globalThis.fetch;
      }
      globalThis.fetch = replayer.fetch.bind(replayer);
    },
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

// export async function replayer(input: RequestInfo | URL | string, init?: RequestInit): Promise<Response> {
//   if (process.env.REREPLAY_ONLINE) {
//     return await originalFetch(input, init);
//   }

//   let { key, requestString } = await requestToKey(input, init);

//   if (!rereplayCache.has(key)) {
//     let response = await originalFetch(input, init);
//     let serializedResponse = await serializeResponse(response);
//     rereplayCache.set(key, serializedResponse, { requestString });

//     return deserializeResponse(serializedResponse);
//   }

//   return deserializeResponse(rereplayCache.get(key)!)
// }

export class Replayer {
  async fetch(
    input: RequestInfo | URL | string,
    init?: RequestInit,
  ): Promise<Response> {
    if (process.env.REREPLAY_ONLINE) {
      return await originalFetch(input, init);
    }

    let { key, requestString } = await this.requestToKey(input, init);

    if (!rereplayCache.has(key)) {
      let response = await originalFetch(input, init);
      let serializedResponse = await this.serializeResponse(response);
      rereplayCache.set(key, serializedResponse, { requestString });

      return this.deserializeResponse(serializedResponse);
    }

    return this.deserializeResponse(rereplayCache.get(key)!);
  }

  async requestToKey(
    input: RequestInfo | URL | string,
    init?: RequestInit,
  ): Promise<{ key: string; requestString: string }> {
    let url =
      input instanceof URL
        ? input.href
        : typeof input === "string"
          ? input
          : input.url;
    let method =
      init?.method || (input instanceof Request ? input.method : "GET");

    let headers = init?.headers
      ? typeof init?.headers === "string"
        ? JSON.parse(init.headers)
        : init.headers
      : input instanceof Request
        ? input.headers.toJSON()
        : {};
    let body = init?.body || (input instanceof Request ? input.body : "");
    let contentType = headers["content-type"];
    let bodyString =
      body instanceof Blob
        ? await body.text()
        : body instanceof FormData
          ? body.toString()
          : (body as string);

    // because multipart/form-data boundaries include a hashed timestamp as a key frame
    // we need to remove the boundary from the body string to make it deterministic
    if (bodyString && contentType?.includes("multipart/form-data")) {
      headers["content-type"] = "multipart/form-data";
      bodyString = bodyString.replace(/--+[a-zA-Z0-9]+/g, "").trim();
    }

    if (headers.authorization) {
      // biome-ignore lint/performance/noDelete: we want to remove the field from the cached entry
      delete headers.authorization;
    }

    let dataToHash = `${url}|${method}|${JSON.stringify(headers)}|${bodyString}`;
    if (dataToHash.includes("[object ")) {
      console.log(dataToHash);
      throw new Error(
        "Invalid data to hash, an object was not correctly stringified",
      );
    }
    let hash = createHash("sha256").update(dataToHash).digest("base64");

    return { key: hash.slice(0, 20), requestString: dataToHash };
  }

  async serializeResponse(response: Response): Promise<string> {
    let serialized: SerializedResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(Object.entries(response.headers.toJSON())),
      body: null,
      bodyType: "text",
    };

    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      serialized.bodyType = "stream";

      let reader = response.body!.getReader();
      let chunks: string[] = [];
      while (true) {
        let { done, value } = await reader!.read();
        if (done) break;

        chunks.push(value!.toString());
      }
      serialized.body = chunks.join(CHUNK_SPLITTER);
    } else {
      let clone = response.clone();
      try {
        let blob = await response.blob();

        if (blob.type.includes("application/json")) {
          serialized.bodyType = "json";
          serialized.body = await response.text();
        } else if (
          !blob.type.includes("text/event-stream") &&
          !blob.type.includes("text/plain")
        ) {
          // Assume it's a file
          serialized.bodyType = "file";
          serialized.fileType = blob.type;
          serialized.body = await blobToBase64(blob);
        } else {
          serialized.bodyType = "text";
          serialized.body = await response.text();
        }
      } catch {
        serialized.bodyType = "text";
        serialized.body = await clone.text();
      }
    }

    return JSON.stringify(serialized);
  }

  deserializeResponse(serializedString: string): Response {
    let serialized: SerializedResponse = JSON.parse(serializedString);
    let body: BodyInit | null = null;

    if (serialized.bodyType === "stream" && serialized.body) {
      let chunks = serialized.body
        .split(CHUNK_SPLITTER)
        .map((chunk) => new Uint8Array(chunk.split(",").map(Number)));
      body = new ReadableStream({
        start(controller) {
          for (let chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
    } else if (serialized.bodyType === "file" && serialized.body) {
      body = base64ToBlob(serialized.body);
    } else if (serialized.body) {
      body = serialized.body;
    }

    return new Response(body, {
      status: serialized.status,
      statusText: serialized.statusText,
      headers: new Headers(serialized.headers),
    });
  }
}
