const assert = require('node:assert/strict');
const { describeStatus } = require('./refresh-status.js');
const base = { slate_date: '2026-10-09', published_slate_date: '2026-10-08', playable_games: 0 };
assert.equal(describeStatus({ ...base, state: 'NO_GAMES' }), 'No MLB games scheduled for Oct 9. Saved picks and results from Oct 8 remain available.');
assert.match(describeStatus({ ...base, state: 'FAILED' }), /did not finish/);
assert.match(describeStatus({ ...base, state: 'REFRESH_PENDING', playable_games: 2 }), /2 games awaiting updated Oct 9 predictions/);
assert.doesNotMatch(describeStatus({ ...base, state: 'SLATE_FINISHED' }), /No MLB games/);
assert.match(describeStatus({ ...base, state: 'UPDATED', published_slate_date: '2026-10-09', playable_games: 1 }), /1 game still playable/);
console.log('Five refresh display cases passed.');
