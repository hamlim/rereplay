# Rereplay 🔂

> A native `fetch`-caching solution for idempotent network requests!

`rereplay` allows you to cache and persist network requests for easy replayability and consistency without needing to change your code!

Example within a unit test:

```ts
import {setup, Replayer} from 'rereplay';

let {configure} = setup({
  cacheDir: process.cwd()
});

let defaultReplayer = new Replayer();

test('API properly responds with well-formed request', async () => {
  configure(defaultReplayer);

  // `makeAPICall` could be any number of layers of abstraction on top of
  // `fetch` call(s), the defaultReplayer used above will cache those on 
  // the first time they are made, and replay them from a persistent cache
  // on subsequent calls!
  let response = await makeAPICall()

  // ✨ Magic ✨
  // Assert on the response as if it's totally stable, even though it
  // may not always be!!!
  expect(await response.json()).toEqual({/* expected response */});
})
```

While `rereplay` is mainly designed for use within automated testing environments, you could also adopt it wherever you want to cache and replay network requests (e.g. a development environment where you cache production network requests and replay them locally)!

## About:

How often have you written a unit test for part of your application - only to realize that a dependency of that code being tested involves a network request?

While you could reach for dependency injecting the network request, or mocking it out entirely, this can be a bit of a pain - especially if you're trying to test more than simple units.

Or maybe your code entirely depends on making requests to other services (e.g. an API Gateway or reverse proxy)!

Rereplay is a solution to this problem - it allows you to cache network requests and responses in a way that is transparent to your code.

## Getting Started:

Install `rereplay` using your favorite package manager:

```sh
bun add -D rereplay
```

Import the `setup` function and `Replayer` class from `rereplay` within your test:

```ts
import {setup, Replayer} from 'rereplay';
```

Use the `setup` function to configure a persistent cache location (we recommend checking in the cache so it's shared across developers and used within CI):

```ts
let {configure} = setup({
  // Store within a local `./cache` dir next to the current test
  cacheDir: path.join(process.cwd(), 'cache')
})
```

Create a new `Replayer` instance and pass it to `configure`:

```ts
let defaultReplayer = new Replayer();

configure(defaultReplayer);
```

Now, any network requests made using `globalThis.fetch` will be cached and replayed on subsequent calls!

## Limitations:

As with most things - `rereplay` has some limitations:

This library will not work with alternative request implementations (e.g. `XMLHttpRequest`, `http.request`, etc), it _only_ works with `globalThis.fetch` (it does so by monkey patching fetch).

Additionally, this library only handles `fetch` calls within the _current realm_ (it will not proxy/cache requests made from another process or worker). If you need support for that functionality - consider an alternative library like [`jambox`](https://github.com/ballercat/jambox).

## Inspiration:

This library took a lot of inspiration (and code/implementation) from the following projects/people:

- [`jambox`](https://github.com/ballercat/jambox) by [Arthur Buldauskas](https://github.com/ballercat)
- [`slapshot`](https://github.com/mattapperson/slapshot) by [Matt Apperson](https://github.com/mattapperson)
- [`data-snapshot`](https://github.com/wayfair/data-snapshot) by [Nick Dreckshage](https://github.com/ndreckshage)


## Docs:

### Exports:

This library exports the following interfaces:

#### `setup`:

```tsx
export declare function setup({ name, cacheDir, staleAfter, }: {
  name?: string;
  cacheDir: string;
  staleAfter?: number;
}): {
  configure(replayer: Replayer): void;
  restore(): void;
};
```

#### `Replayer`:

```tsx
export declare class Replayer {
  fetch(
    input: RequestInfo | URL | string,
    init?: RequestInit
  ): Promise<Response>;
  requestToKey(
    input: RequestInfo | URL | string,
    init?: RequestInit
  ): Promise<{
    key: string;
    requestString: string;
  }>;
  serializeResponse(response: Response): Promise<string>;
  deserializeResponse(serializedString: string): Response;
}
```

#### `originalFetch`:

```tsx
export declare let originalFetch: typeof globalThis.fetch;
```

#### `rereplayCache`:

```tsx
export declare let rereplayCache: PersistentMap<string, string>;
```

#### `PersistentMap`:

```tsx
export declare class PersistentMap<K, V> {
  constructor({ name, staleAfter, cacheDir, }: {
    name: string;
    staleAfter?: number;
    cacheDir: string;
  });
  setCacheFile(scope: string): void;
  set(key: K, value: V, metadata?: Record<string, any>): this;
  get(key: K): V | undefined;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  entries(): IterableIterator<[K, V]>;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void;
  get size(): number;
}
```

### `Replayer`s

This library is meant to be pretty flexible for most use cases - the main way to customize the bevaior is to provide a custom `Replayer`.

It's recommended to extend the base `Replayer`:

```tsx
class CustomReplayer extends Replayer {
  // Override one of the default methods from the Replayer as needed
}
```