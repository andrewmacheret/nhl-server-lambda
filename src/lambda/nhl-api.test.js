const test = require('node:test');
const assert = require('node:assert');
const { api, handler } = require('./nhl-api');

// These call the real NHL API
test('away game', async () => {
  assert.deepStrictEqual(await api({ action: 'myTeamToday', team: 'sharks', date: '2017-02-11' }), {
    games: [{
      title: 'San Jose Sharks at Philadelphia Flyers',
      home: {
        id: 4,
        name: 'Philadelphia Flyers',
        logo: 'https://assets.nhle.com/logos/nhl/svg/PHI_19992000-20222023_light.svg',
        darkLogo: 'https://assets.nhle.com/logos/nhl/svg/PHI_19992000-20222023_dark.svg'
      },
      away: {
        id: 28,
        name: 'San Jose Sharks',
        logo: 'https://assets.nhle.com/logos/nhl/svg/SJS_20082009-20232024_light.svg',
        darkLogo: 'https://assets.nhle.com/logos/nhl/svg/SJS_20082009-20232024_dark.svg'
      },
      isHome: false,
      gameDate: '2017-02-11T18:00:00Z',
      broadcasts: ['NHLN-US', 'CSN-CA', 'CSN-PH']
    }]
  });
});

test('home game', async () => {
  const { games } = await api({ action: 'myTeamToday', team: 'sharks', date: '2016-11-21' });
  assert.strictEqual(games.length, 1);
  assert.strictEqual(games[0].title, 'San Jose Sharks vs New Jersey Devils');
  assert.strictEqual(games[0].isHome, true);
  assert.strictEqual(games[0].gameDate, '2016-11-22T03:30:00Z');
});

test('multi word team name', async () => {
  const { games } = await api({ action: 'myTeamToday', team: 'maple leafs', date: '2017-02-11' });
  assert.strictEqual(games.length, 1);
  assert.match(games[0].title, /Toronto Maple Leafs/);
});

test('no games', async () => {
  assert.deepStrictEqual(await api({ action: 'myTeamToday', team: 'sharks', date: '2017-07-15' }), { games: [] });
});

test('defaults to today', async () => {
  const { games } = await api({ action: 'myTeamToday', team: 'sharks' });
  assert.ok(Array.isArray(games));
});

const errorCases = [
  [{ action: 'myTeamToday' }, `'team' must be specified`],
  [{ action: 'myTeamToday', team: 'SHARKS' }, `team must be a lower case set of words, such as 'sharks' or 'maple leafs', was: 'SHARKS'`],
  [{ action: 'myTeamToday', team: 'this team doesnt exist' }, `team not found: 'this team doesnt exist'`],
  [{ action: 'myTeamToday', team: 'sharks', date: 'YYYYOURMOM' }, `date must be in format YYYY-MM-DD, was: 'YYYYOURMOM'`],
  [{}, `Unsupported or undefined action: undefined`]
];

for (const [event, message] of errorCases) {
  test(`error: ${message}`, async () => {
    await assert.rejects(api(event), { message });
  });
}

test('handler prefixes bad input with 400', async () => {
  await assert.rejects(handler({ action: 'myTeamToday', team: 'nope' }), { message: `400: team not found: 'nope'` });
});

test('handler prefixes NHL API failures with 502', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: false, status: 503 }));
  await assert.rejects(handler({ action: 'myTeamToday', team: 'sharks', date: '1999-01-01' }),
    { message: /^502: NHL API returned 503 for / });
});
