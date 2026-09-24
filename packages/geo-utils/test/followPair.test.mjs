import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/followPair.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { fitFollowPair } = await import(`data:text/javascript;base64,${Buffer.from(compiled, 'utf8').toString('base64')}`);

// Independently project the returned camera and markers into actual screen positions.
function screen(point, camera, w, h, heading) {
  const y = (lat) => -Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
  const scale = 256 * 2 ** camera.zoom;
  const dx = ((point.lng - camera.lng + 540) % 360 - 180) / 360 * scale;
  const dy = (y(point.lat) - y(camera.lat)) * scale;
  const angle = heading * Math.PI / 180;
  return [w / 2 + dx * Math.cos(angle) + dy * Math.sin(angle),
    h / 2 - dx * Math.sin(angle) + dy * Math.cos(angle)];
}
const scenarios = [
  [{ lat: 35.68, lng: 139.76 }, { lat: 35.681, lng: 139.77 }],
  [{ lat: 35.68, lng: 139.76 }, { lat: 36.3, lng: 140.8 }],
  [{ lat: 35, lng: 179.99 }, { lat: 35.01, lng: -179.99 }],
  [{ lat: 78, lng: 15 }, { lat: 79, lng: 17 }],
];

test('both markers remain inside padded viewport at every heading and screen size', () => {
  for (const [w, h] of [[390, 844], [844, 390], [320, 480]]) {
    for (const [self, target] of scenarios) {
      for (let heading = 0; heading < 360; heading += 15) {
        const camera = fitFollowPair(self, target, w, h, heading);
        for (const point of [self, target]) {
          const [x, y] = screen(point, camera, w, h, heading);
          const side = Math.min(40, w * 0.1);
          assert.ok(x >= side - 1e-6 && x <= w - side + 1e-6, `x=${x}, heading=${heading}`);
          assert.ok(y >= Math.min(170, h * 0.28) - 1e-6 && y <= h - Math.min(220, h * 0.32) + 1e-6,
            `y=${y}, heading=${heading}`);
        }
      }
    }
  }
});

test('distant pair can zoom below street level and dateline takes shortest span', () => {
  assert.ok(fitFollowPair(...scenarios[1], 390, 844, 0).zoom < 13);
  assert.ok(fitFollowPair(...scenarios[2], 390, 844, 0).zoom > 10);
});

test('coincident positions stay finite and inward smoothing keeps the pair visible', () => {
  const self = scenarios[0][0];
  const camera = fitFollowPair(self, self, 390, 844, 123);
  assert.equal(camera.zoom, 17.5);
  assert.ok(Number.isFinite(camera.lat) && Number.isFinite(camera.lng));
  const fit = fitFollowPair(...scenarios[0], 390, 844, 91, 10);
  assert.equal(fit.zoom, 10);
  for (const point of scenarios[0]) {
    const [x, y] = screen(point, fit, 390, 844, 91);
    assert.ok(x > 40 && x < 350 && y > 170 && y < 624);
  }
});
