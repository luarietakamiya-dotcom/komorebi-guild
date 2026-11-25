const assert = require("node:assert/strict");
const G = require("../engine.js");

// Isolate recruitment from random raids while the calendar advances normally.
module.exports = function waitForGuest(s,id) {
  const deadline = s.week + 120;
  s.raids.nextWeek = deadline + 1;
  while (!s.visitors.includes(id) && s.week < deadline) G.nextWeek(s,true);
  assert.ok(s.visitors.includes(id),id+" did not visit within 120 weeks");
};
