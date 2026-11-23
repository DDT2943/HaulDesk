import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampOutfitPercentage,
  clampOutfitScale,
  computeFlatlayPlacements,
} from './outfitLayout.ts';

test('computeFlatlayPlacements assigns stacked top-to-bottom coordinates by garment category', () => {
  const placements = computeFlatlayPlacements([
    'Cappellini',
    'Giubbini',
    'Pantaloni',
    'Scarpe',
  ]);

  assert.equal(placements.length, 4);
  assert.ok(placements[0].yPct < placements[1].yPct);
  assert.ok(placements[1].yPct < placements[2].yPct);
  assert.ok(placements[2].yPct < placements[3].yPct);
});

test('computeFlatlayPlacements separates multiple garments sharing the top slot', () => {
  const placements = computeFlatlayPlacements(['Giubbini', 'Maglietta']);
  assert.equal(placements.length, 2);
  assert.notEqual(placements[0].xPct, placements[1].xPct);
  assert.ok(placements[0].xPct < placements[1].xPct);
});

test('clampOutfitPercentage and clampOutfitScale keep coordinates inside safe bounds', () => {
  assert.equal(clampOutfitPercentage(-20), 8);
  assert.equal(clampOutfitPercentage(120), 92);
  assert.equal(clampOutfitScale(0.1), 0.4);
  assert.equal(clampOutfitScale(3.5), 1.65);
});
