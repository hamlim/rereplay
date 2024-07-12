import { test, expect } from "bun:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { setup, Replayer, rereplayCache } from "../index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let { configure } = setup({
  cacheDir: join(__dirname, "cache"),
});

let defaultReplayer = new Replayer();

test("some operations", async () => {
  configure(defaultReplayer);

  let input = "https://icanhazdadjoke.com/";
  let init = {
    method: "GET",
    headers: new Headers({
      Accept: "text/plain",
    }),
  };

  let res = await fetch(input, init);

  let content = await res.text();

  expect(content).toBe(
    "What do you do when your bunny gets wet? You get your hare dryer.",
  );

  let { key } = await defaultReplayer.requestToKey(input, init);

  expect(rereplayCache.has(key)).toBe(true);
});

class StubbedReplayer extends Replayer {
  async fetch(input: RequestInfo | URL | string, init?: RequestInit) {
    return new Response("Yo");
  }
}

test("custom replayer", async () => {
  let { configure, restore } = setup({
    name: "custom-replayer",
    cacheDir: join(__dirname, "cache"),
  });
  configure(new StubbedReplayer());

  let input = "http://127.0.0.1/";
  let init = {
    method: "GET",
    headers: new Headers({
      Accept: "text/plain",
    }),
  };

  await fetch(input, init);

  let { key } = await defaultReplayer.requestToKey(input, init);

  // never fill the cache
  expect(rereplayCache.has(key)).toBe(false);

  restore();
});

class CustomReplayer extends Replayer {
  async fetch(input: RequestInfo | URL | string, init?: RequestInit) {
    if (process.env.REREPLAY_ONLINE) {
      return new Response("Yo", {
        headers: {
          "Content-Type": "text/plain",
        },
      });
    }

    let { key, requestString } = await this.requestToKey(input, init);

    if (!rereplayCache.has(key)) {
      let response = new Response("Yo", {
        headers: {
          "Content-Type": "text/plain",
        },
      });
      let serializedResponse = await this.serializeResponse(response);
      rereplayCache.set(key, serializedResponse, { requestString });

      return this.deserializeResponse(serializedResponse);
    }

    return this.deserializeResponse(rereplayCache.get(key)!);
  }
}

test("scoped cache", async () => {
  configure(new CustomReplayer());

  rereplayCache.setCacheFile("scoped-cache");

  rereplayCache.clear();

  let input = "https://icanhazdadjoke.com/";
  let init = {
    method: "GET",
    headers: new Headers({
      Accept: "text/plain",
    }),
  };
  let { key } = await defaultReplayer.requestToKey(input, init);

  // Doesn't exist - since we're using a different cache file
  expect(rereplayCache.has(key)).toBe(false);

  await fetch(input, init);

  // now it should be in the cache
  expect(rereplayCache.has(key)).toBe(true);
});
