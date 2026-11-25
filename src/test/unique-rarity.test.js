const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../engine.js");

const reload = s => G.restore(JSON.parse(JSON.stringify(s)));
const specialGuests = s => s.visitors.filter(id => G.uniqueGuests[id]);

function quietTown(fame) {
  const s = G.initial();
  s.metrics[0] = fame;
  s.raids.nextWeek = 1000;
  G.setYearLength(s,52);
  return s;
}

test("全員が候補でも12週に最大1人。初対面を一巡してから再訪し、一般客は毎週来る", () => {
  let s = quietTown(100);
  const ids = Object.keys(G.uniqueGuests);
  const arrivals = [];
  const endWeek = 12 * ids.length * 2;
  let regularCount = 0;
  while (s.week < endWeek) {
    G.nextWeek(s,true);
    const guests = specialGuests(s);
    assert.ok(guests.length <= 1);
    assert.equal(s.visitors.length - guests.length,13);
    regularCount += s.visitors.length - guests.length;
    const letters = s.morningMail.filter(m => m.specialVisit && m.week === s.week);
    assert.deepEqual(letters.map(m => m.specialVisit),guests);
    if (!guests.length) continue;
    assert.ok(s.week - (arrivals.at(-1)?.week || 0) >= 12);
    const id = guests[0];
    if (arrivals.some(a => a.id === id)) assert.match(letters[0].message,/再び/);
    else assert.equal(letters[0].message,G.uniqueGuests[id].letter);
    arrivals.push({week:s.week,id});
    const saved = reload(s);
    assert.deepEqual(specialGuests(saved),guests);
    assert.deepEqual(saved.morningMail,s.morningMail);
    s = saved;
  }
  assert.equal(arrivals.length,2 * ids.length);
  assert.ok(regularCount >= 10 * arrivals.length);
  for (const batch of [arrivals.slice(0,ids.length),arrivals.slice(ids.length)]) {
    assert.deepEqual(new Set(batch.map(a => a.id)),new Set(ids));
  }
  for (const id of ids) assert.equal(s.registry.find(p => p.id === id).career.filter(e => e.firstVisit).length,1);
});

test("名声未達なら来訪枠が空いても現れず、契約して再開しても次の来訪は早まらない", () => {
  let s = quietTown(9);
  while (s.week < 14) {
    G.nextWeek(s,true);
    assert.deepEqual(specialGuests(s),[]);
  }
  G.build(s,"west","inn");
  s.metrics[0] = 10;
  G.nextWeek(s,true);
  assert.deepEqual(specialGuests(s),["goto"]);
  assert.ok(G.scout(s,"goto","premium"));
  s = reload(s);
  s.metrics[0] = 100;
  for (let i=1; i<12; i++) {
    G.nextWeek(s,true);
    assert.deepEqual(specialGuests(s),[]);
  }
  G.nextWeek(s,true);
  assert.equal(specialGuests(s).length,1);
  assert.ok(!s.visitors.includes("goto") && G.person(s,"goto"));
});

test("旧セーブに滞在中の複数の来訪者と加入済みの仲間を保ち、読込時に伝書を再送しない", () => {
  const old = quietTown(100);
  old.week = 24;
  old.gold = 1000;
  G.build(old,"west","inn");
  old.visitors.push("goto","shusai","riina");
  assert.ok(G.scout(old,"goto","premium"));
  const p = old.registry.find(p => p.id === "riina");
  const message = G.uniqueGuests.riina.letter;
  p.career.push({week:18,firstVisit:true,message});
  old.morningMail.push({week:18,sender:p.name,message});
  delete old.uniqueVisitWeeks;
  const s = reload(old);
  assert.deepEqual(s.visitors,old.visitors);
  assert.deepEqual(s.morningMail,old.morningMail);
  assert.deepEqual(s.roster,old.roster);
  assert.deepEqual(s.uniqueVisitWeeks,{goto:24,shusai:24,riina:24});
  assert.deepEqual(reload(s),s);
  for (let i=1; i<12; i++) {
    G.nextWeek(s,true);
    assert.deepEqual(specialGuests(s),[]);
  }
  G.nextWeek(s,true);
  assert.equal(specialGuests(s).length,1);
  assert.ok(!["shusai","riina","goto"].includes(specialGuests(s)[0]));
});
