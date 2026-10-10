const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('player-props.html', 'utf8');
const context = {};
vm.createContext(context);
for (const name of ['esc', 'odds', 'name', 'modelTarget', 'targetText', 'sourceText', 'result', 'card', 'hero']) {
  const line = html.split('\n').find(line => line.startsWith('function ' + name + '('));
  assert.ok(line, 'Missing rendering helper: ' + name);
  vm.runInContext(line, context);
}
const model = {player: 'Test, Hitter', decision: 'PLAY', book: 'LAUNCHPOINT',
  target: 1, line: 1, side: '1+', odds: null, category: 'HITS', projection: 1.3};
const hero = context.hero(model);
assert.match(hero, /MODEL TARGET/);
assert.match(hero, /LAUNCHPOINT MODEL TARGET/);
assert.doesNotMatch(hero, /SPORTSBOOK|1\+ 1/);
assert.match(context.card(model), /TARGET/);
const historical = {...model, book: 'fanduel', target: undefined, odds: 120, line: 0.5, side: 'OVER'};
assert.match(context.hero(historical), /SPORTSBOOK/);
assert.match(context.hero(historical), /\+120/);
assert.match(context.hero(historical), /OVER 0.5/);
console.log('Model targets and historical sportsbook cards render with distinct labels.');
