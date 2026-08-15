import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const mobileRoot = path.resolve(path.dirname(scriptPath), "..");
const packageRoot = path.join(mobileRoot, "node_modules", "image-size");
const expectedVersion = "1.2.1";

const patches = [
  {
    label: "ISO box minimum size",
    file: path.join(packageRoot, "dist", "types", "utils.js"),
    expectedCount: 1,
    before: [
      "    const boxSize = (0, exports.readUInt32BE)(input, offset);",
      "    if (input.length - offset < boxSize)",
      "        return;",
    ].join("\n"),
    after: [
      "    const boxSize = (0, exports.readUInt32BE)(input, offset);",
      "    if (boxSize < 8)",
      "        return;",
      "    if (input.length - offset < boxSize)",
      "        return;",
    ].join("\n"),
  },
  {
    label: "ICNS entry minimum size",
    file: path.join(packageRoot, "dist", "types", "icns.js"),
    expectedCount: 2,
    before: "        imageOffset += imageHeader[1];",
    after: [
      "        if (imageHeader[1] < SIZE_HEADER)",
      "            throw new TypeError('Invalid ICNS entry length');",
      "        imageOffset += imageHeader[1];",
    ].join("\n"),
  },
];

function countOccurrences(content, fragment) {
  return content.split(fragment).length - 1;
}

function readPackageVersion() {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return packageJson.version;
}

function assertSupportedVersion() {
  const installedVersion = readPackageVersion();
  if (installedVersion !== expectedVersion) {
    throw new Error(
      `image-size ${installedVersion} is not covered by the DIMAX security patch; expected ${expectedVersion}`,
    );
  }
}

function applyPatches() {
  assertSupportedVersion();
  for (const patch of patches) {
    const content = readFileSync(patch.file, "utf8");
    const beforeCount = countOccurrences(content, patch.before);
    const afterCount = countOccurrences(content, patch.after);

    if (afterCount === patch.expectedCount) {
      continue;
    }
    if (beforeCount !== patch.expectedCount || afterCount !== 0) {
      throw new Error(
        `${patch.label} patch context changed: before=${beforeCount}, after=${afterCount}`,
      );
    }

    writeFileSync(patch.file, content.split(patch.before).join(patch.after), "utf8");
  }
  verifyPatches();
}

function verifyPatches() {
  assertSupportedVersion();
  for (const patch of patches) {
    const content = readFileSync(patch.file, "utf8");
    const afterCount = countOccurrences(content, patch.after);
    if (afterCount !== patch.expectedCount) {
      throw new Error(
        `${patch.label} patch is missing: after=${afterCount}, expected=${patch.expectedCount}`,
      );
    }
  }
}

function runProbe() {
  verifyPatches();
  const require = createRequire(import.meta.url);
  const getImageSize = require(path.join(packageRoot, "dist", "index.js"));
  const { findBox } = require(path.join(packageRoot, "dist", "types", "utils.js"));

  const malformedIcns = Buffer.alloc(16);
  malformedIcns.write("icns", 0, "ascii");
  malformedIcns.writeUInt32BE(16, 4);
  malformedIcns.write("ic07", 8, "ascii");
  malformedIcns.writeUInt32BE(0, 12);
  assert.throws(() => getImageSize(malformedIcns), /Invalid ICNS entry length/);

  const zeroLengthBox = Buffer.alloc(8);
  zeroLengthBox.writeUInt32BE(0, 0);
  zeroLengthBox.write("jxlp", 4, "ascii");
  assert.equal(findBox(zeroLengthBox, "jxlp", 0), undefined);

  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  assert.deepEqual(getImageSize(onePixelPng), { height: 1, type: "png", width: 1 });
}

function runSelfTest() {
  verifyPatches();
  const probe = spawnSync(process.execPath, [scriptPath, "--probe"], {
    encoding: "utf8",
    timeout: 3_000,
  });
  if (probe.error) {
    throw probe.error;
  }
  if (probe.status !== 0) {
    throw new Error((probe.stderr || probe.stdout || "image-size probe failed").trim());
  }
  process.stdout.write("image-size security patch verified (ICNS, JXL/HEIF box, PNG regression).\n");
}

const mode = process.argv[2];
if (mode === "--apply") {
  applyPatches();
  process.stdout.write(`image-size ${expectedVersion} security patch applied.\n`);
} else if (mode === "--verify") {
  verifyPatches();
  process.stdout.write(`image-size ${expectedVersion} security patch is present.\n`);
} else if (mode === "--self-test") {
  runSelfTest();
} else if (mode === "--probe") {
  runProbe();
} else {
  throw new Error("Usage: patch-image-size.mjs --apply|--verify|--self-test");
}
