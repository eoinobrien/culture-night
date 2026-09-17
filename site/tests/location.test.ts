import assert from "node:assert/strict";
import { test } from "node:test";
import { LocationDataError, locationErrorMessage, readLocation } from "../src/lib/location";

test("location coordinates retain their supplied accuracy without collecting other sensor data", () => {
  assert.deepEqual(readLocation({ latitude: 53.3498, longitude: -6.2603, accuracy: 25 }),
    { lat: 53.3498, lng: -6.2603, accuracy: 25 });
  assert.deepEqual(readLocation({ latitude: 0, longitude: 0, accuracy: 0 }), { lat: 0, lng: 0, accuracy: 0 });
});

test("invalid location coordinates and accuracy fail explicitly", () => {
  const valid = { latitude: 53.3498, longitude: -6.2603, accuracy: 25 };
  for (const latitude of [NaN, Infinity, -91, 91]) {
    assert.throws(() => readLocation({ ...valid, latitude }), LocationDataError);
  }
  for (const longitude of [NaN, Infinity, -181, 181]) {
    assert.throws(() => readLocation({ ...valid, longitude }), LocationDataError);
  }
  for (const accuracy of [NaN, Infinity, -1]) {
    assert.throws(() => readLocation({ ...valid, accuracy }), LocationDataError);
  }
});

test("location errors explain denied permission, timeout and unavailable position", () => {
  assert.match(locationErrorMessage(1), /permission was denied/i);
  assert.match(locationErrorMessage(3), /timed out/i);
  assert.match(locationErrorMessage(2), /could not be found/i);
  assert.match(locationErrorMessage(99), /could not be found/i);
  for (const code of [1, 2, 3]) assert.match(locationErrorMessage(code), /search by town/i);
});
