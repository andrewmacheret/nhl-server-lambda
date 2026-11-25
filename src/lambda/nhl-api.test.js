const test = require('node:test');
const assert = require('node:assert');
const { api, handler } = require('./nhl-api');

// These call the real NHL API
test('away game', async () => {
  const { team, games } = await api({ action: 'myTeamToday', team: 'sharks', date: '2017-02-11' });
  assert.deepStrictEqual(team, {
    id: 'sharks', abbrev: 'SJS', name: 'San Jose Sharks', record: '33-18-5', points: 71, streak: 'OT1'
  });
  assert.deepStrictEqual(games, [{
    id: 2016020817,
    title: 'San Jose Sharks at Philadelphia Flyers',
    home: {
      id: 4,
      abbrev: 'PHI',
      name: 'Philadelphia Flyers',
      shortName: 'Flyers',
      logo: 'https://assets.nhle.com/logos/nhl/svg/PHI_19992000-20222023_light.svg',
      darkLogo: 'https://assets.nhle.com/logos/nhl/svg/PHI_19992000-20222023_dark.svg'
    },
    away: {
      id: 28,
      abbrev: 'SJS',
      name: 'San Jose Sharks',
      shortName: 'Sharks',
      logo: 'https://assets.nhle.com/logos/nhl/svg/SJS_20082009-20232024_light.svg',
      darkLogo: 'https://assets.nhle.com/logos/nhl/svg/SJS_20082009-20232024_dark.svg'
    },
    isHome: false,
    date: '2017-02-11',
    gameDate: '2017-02-11T18:00:00Z',
    state: 'final',
    score: { home: 2, away: 1 },
    period: null,
    endedIn: 'OT',
    venue: 'Wells Fargo Center',
    gameCenterUrl: 'https://www.nhl.com/gamecenter/sjs-vs-phi/2017/02/11/2016020817',
    broadcasts: ['NHLN-US', 'CSN-CA', 'CSN-PH']
  }]);
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

for (const name of ['SJS', 'San Jose', 'san jose sharks', 'Sharks']) {
  test(`finds the sharks by '${name}'`, async () => {
    const { team } = await api({ action: 'myTeamToday', team: name, date: '2017-02-11' });
    assert.strictEqual(team.abbrev, 'SJS');
  });
}

test('finds teams with accents and periods in their names', async () => {
  assert.strictEqual((await api({ action: 'myTeamToday', team: 'montreal', date: '2017-02-11' })).team.abbrev, 'MTL');
  assert.strictEqual((await api({ action: 'myTeamToday', team: 'st louis', date: '2017-02-11' })).team.abbrev, 'STL');
});

test('no games, next game is in the next season', async () => {
  const { games, next } = await api({ action: 'myTeamToday', team: 'sharks', date: '2017-07-15' });
  assert.deepStrictEqual(games, []);
  assert.strictEqual(next.date, '2017-09-19');
});

test('next game is after the date', async () => {
  const { next } = await api({ action: 'myTeamToday', team: 'sharks', date: '2017-02-11' });
  assert.strictEqual(next.date, '2017-02-12');
  assert.strictEqual(next.title, 'San Jose Sharks at New Jersey Devils');
});

test('lists every team for the team picker', async () => {
  const { teams } = await api({ action: 'myTeamToday', team: 'sharks', date: '2017-02-11' });
  assert.strictEqual(teams.length, 32);
  assert.ok(teams.some((t) => t.id === 'maple leafs' && t.name === 'Toronto Maple Leafs'));
});

test('defaults to today', async () => {
  const { games } = await api({ action: 'myTeamToday', team: 'sharks' });
  assert.ok(Array.isArray(games));
});

test('calendar', async () => {
  const ics = await api({ action: 'calendar', team: 'sharks' });
  const lines = ics.split('\r\n');
  assert.strictEqual(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(lines.includes('X-WR-CALNAME:San Jose Sharks'));
  assert.ok(lines.filter((line) => line === 'BEGIN:VEVENT').length > 80);
  assert.ok(lines.every((line) => Buffer.byteLength(line) <= 75));
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends with CRLF');
});

test('calendar through API Gateway', async () => {
  const response = await handler({ requestContext: {}, resource: '/calendar', queryStringParameters: { team: 'sharks' } });
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.headers['Content-Type'], 'text/calendar; charset=utf-8');
  assert.match(response.body, /^BEGIN:VCALENDAR/);
});

test('calendar through API Gateway with a bad team', async () => {
  const response = await handler({ requestContext: {}, resource: '/calendar', queryStringParameters: { team: 'nope' } });
  assert.strictEqual(response.statusCode, 400);
  assert.strictEqual(response.body, `team not found: 'nope'\n`);
});

test('healthcheck', async () => {
  const response = await handler({ requestContext: {}, resource: '/healthcheck' });
  assert.strictEqual(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.status, 'ok');
  assert.deepStrictEqual(body.checks.map((c) => c.name), ['NHL standings', 'NHL schedule']);
});

test('healthcheck says which NHL API call is broken', async (t) => {
  const realFetch = global.fetch;
  t.mock.method(global, 'fetch', async (url, options) => {
    if (url.includes('/schedule/')) return { ok: false, status: 503 };
    return realFetch(url, options);
  });
  const response = await handler({ requestContext: {}, resource: '/healthcheck' });
  assert.strictEqual(response.statusCode, 503);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.status, 'fail');
  assert.deepStrictEqual(body.checks.map((c) => c.ok), [true, false]);
  assert.match(body.checks[1].detail, /^NHL API returned 503 for \/schedule\//);
});

const errorCases = [
  [{ action: 'myTeamToday' }, `'team' must be specified`],
  [{ action: 'myTeamToday', team: 'sharks!' }, `team must be a team name, city or abbreviation, such as 'sharks', 'maple leafs' or 'sjs', was: 'sharks!'`],
  [{ action: 'myTeamToday', team: 'this team doesnt exist' }, `team not found: 'this team doesnt exist'`],
  [{ action: 'myTeamToday', team: 'sharks', date: 'YYYYOURMOM' }, `date must be in format YYYY-MM-DD, was: 'YYYYOURMOM'`],
  [{ action: 'calendar' }, `'team' must be specified`],
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

test('live game shows the score and period', async (t) => {
  const team = (abbrev, commonName, score) => ({
    id: 1, abbrev, commonName: { default: commonName }, placeName: { default: 'Somewhere' }, logo: '', darkLogo: '', score
  });
  const realFetch = global.fetch;
  t.mock.method(global, 'fetch', async (url, options) => {
    if (!url.includes('/schedule/1999-02-01')) return realFetch(url, options);
    return {
      ok: true,
      json: async () => ({
        gameWeek: [{
          date: '1999-02-01',
          games: [{
            id: 1, gameState: 'LIVE', gameScheduleState: 'OK', startTimeUTC: '1999-02-02T03:00:00Z',
            periodDescriptor: { number: 4, periodType: 'OT', maxRegulationPeriods: 3 },
            homeTeam: team('SJS', 'Sharks', 2), awayTeam: team('LAK', 'Kings', 2)
          }]
        }]
      })
    };
  });
  const { games } = await api({ action: 'myTeamToday', team: 'sharks', date: '1999-02-01' });
  assert.strictEqual(games[0].state, 'live');
  assert.strictEqual(games[0].period, 'OT');
  assert.deepStrictEqual(games[0].score, { home: 2, away: 2 });
});
