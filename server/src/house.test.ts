import { test } from "node:test";
import assert from "node:assert/strict";
import { HOUSE_TEMPLATES } from "./data/houses.js";
import { floorArea, openings, overlappingRooms, roomOpeningCounts } from "./shared/house.js";
import { estimateHouse } from "./lib/estimateProject.js";

test("every sample home is valid: no overlaps, every indoor room reachable, one front door", () => {
  for (const t of HOUSE_TEMPLATES) {
    const rooms = t.house.rooms;
    assert.deepEqual(overlappingRooms(rooms), [], `${t.id} has overlapping rooms`);
    const ops = openings(rooms);
    assert.equal(ops.filter((o) => o.kind === "front-door").length, 1, `${t.id} front door`);
    // Reachability from the front door through doors/openings.
    const front = ops.find((o) => o.kind === "front-door")!.roomId;
    const seen = new Set([front]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const o of ops) if (o.otherId && (o.kind === "door" || o.kind === "opening")) {
        if (seen.has(o.roomId) && !seen.has(o.otherId)) { seen.add(o.otherId); grew = true; }
        if (seen.has(o.otherId) && !seen.has(o.roomId)) { seen.add(o.roomId); grew = true; }
      }
    }
    for (const r of rooms) assert.ok(seen.has(r.id), `${t.id}: ${r.name} is not reachable`);
    for (const r of rooms.filter((x) => x.type === "Bedroom" || x.type === "Living room")) assert.ok(roomOpeningCounts(r, ops).windows >= 1, `${t.id}: ${r.name} has no window`);
  }
});

test("en-suite bathrooms open only into their bedroom", () => {
  const t = HOUSE_TEMPLATES.find((x) => x.id === "family-3bed")!;
  const ens = t.house.rooms.find((r) => r.ensuite)!;
  const doors = openings(t.house.rooms).filter((o) => (o.roomId === ens.id || o.otherId === ens.id) && o.kind === "door");
  assert.equal(doors.length, 1);
  const other = t.house.rooms.find((r) => r.id === (doors[0].roomId === ens.id ? doors[0].otherId : doors[0].roomId))!;
  assert.equal(other.type, "Bedroom");
});

test("whole-house estimate adds up per room and uses room overrides", () => {
  const t = HOUSE_TEMPLATES.find((x) => x.id === "family-3bed")!;
  const f = t.finishes as Record<string, string | number>;
  const e = estimateHouse({ ...t.house, items: [] }, {
    flooring: f.flooring as string, wall: f.wall as string, ceiling: f.ceiling as string, tiles: f.tiles as string, tiledArea: 6,
    countertop: f.countertop as string, countertopLength: 5, cabinetry: f.cabinetry as string, cabinetryLength: 6,
  }, { quality: "standard", province: "Gauteng", includeDemolition: false, electricalPoints: 0, plumbingPoints: 0, contingency: 0.1 });
  assert.equal(e.rooms!.length, t.house.rooms.length);
  const sum = e.rooms!.reduce((s, r) => s + r.total, 0);
  assert.ok(Math.abs(sum - e.totals.total) < 1);
  assert.ok(e.lines.some((l) => l.item.startsWith("Main bedroom: Engineered oak")), "bedroom floor override applied");
  assert.ok(e.lines.some((l) => l.item.startsWith("Kitchen & scullery: Engineered quartz")), "kitchen tops included");
  assert.ok(Math.abs(floorArea(t.house.rooms) - 163.2) < 0.1);
});
