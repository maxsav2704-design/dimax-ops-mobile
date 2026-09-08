import assert from "node:assert/strict";
import { test } from "node:test";
import uri from "fast-uri";

test("rejects malformed IPv6 hosts instead of normalizing them to private addresses", () => {
  // GHSA-f65p-4m7j-42xc: normalization must not silently replace an invalid host.
  for (const host of ["::not-valid", "fc00::not-hex", "fe80::not-hex"]) {
    assert.ok(uri.parse(`http://[${host}]/private`).error, host);
  }
});

test("preserves valid URLs used by the existing toolchain", () => {
  const parsed = uri.parse("https://example.com/doors");
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.host, "example.com");
  assert.equal(parsed.scheme, "https");
  assert.equal(parsed.path, "/doors");
  assert.equal(uri.parse("http://[::1]/doors").error, undefined);
});
