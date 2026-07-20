import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalMooJson,
  mooSha256Hex,
  sealMooLocateProof,
  validateMooLocateProof,
} from "../app/moo-contract.ts";

test("canonical JSON is key-order independent and SHA-256 matches the published abc vector", () => {
  assert.equal(canonicalMooJson({ z: 1, a: { y: true, x: null } }), '{"a":{"x":null,"y":true},"z":1}');
  assert.equal(mooSha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("locate evidence is immutable and bound to account, quantity, availability, and validity", () => {
  const proof = sealMooLocateProof({
    schemaVersion: "moo-locate-proof-v1",
    broker: "fixture",
    accountAlias: "Account short",
    symbol: "NVDA",
    targetSession: "2026-07-20",
    quantity: 10,
    locateId: "locate-1",
    availableAt: 100,
    validUntil: 200,
    guaranteed: true,
  });
  assert.equal(validateMooLocateProof(proof, {
    accountAlias: "account SHORT", targetSession: "2026-07-20", quantity: 10, availableBy: 100, validThrough: 200,
  }).valid, true);
  assert.equal(Object.isFrozen(proof), true);
  assert.throws(() => { proof.quantity = 1; }, TypeError);

  assert.ok(validateMooLocateProof(proof, {
    accountAlias: "other", targetSession: "2026-07-21", quantity: 11, availableBy: 99, validThrough: 201,
  }).errors.includes("LOCATE_ACCOUNT_MISMATCH"));
});

test("locate digest detects substitution even when the outer object is reserialized", () => {
  const proof = structuredClone(sealMooLocateProof({
    schemaVersion: "moo-locate-proof-v1",
    broker: "fixture",
    accountAlias: "Account short",
    symbol: "NVDA",
    targetSession: "2026-07-20",
    quantity: 10,
    locateId: "locate-1",
    availableAt: 100,
    validUntil: 200,
    guaranteed: true,
  }));
  proof.locateId = "substituted";
  assert.ok(validateMooLocateProof(proof).errors.includes("LOCATE_CONTENT_HASH_MISMATCH"));
});
