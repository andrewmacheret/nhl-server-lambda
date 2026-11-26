const nhlApiUrl = 'https://api-web.nhle.com/v1';

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;

const cache = {};

// Errors caused by bad input, sent back as a 400 instead of a 502
class BadRequestError extends Error {}

// transform shrinks the NHL response before it goes in the cache
async function callNhlApi(path, ttlMs, transform = (data) => data) {
  const cached = cache[path];
  if (cached && Date.now() - cached.time < ttlMs) return cached.data;

  const url = nhlApiUrl + path;
  console.log(`calling url: ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) {
    throw new Error(`NHL API returned ${response.status} for ${path}`);
  }
  const data = transform(await response.json());
  // Every past date gets its own entry, so start over once there are too many
  if (Object.keys(cache).length >= 100) {
    for (const key in cache) delete cache[key];
  }
  cache[path] = { time: Date.now(), data };
  return data;
}

// 'Montréal' -> 'montreal', 'St. Louis' -> 'st louis'
function normalizeName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

function todayInLA() {
  // en-CA formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}

// Seasons start in the fall, so '2017-02-11' is in season '20162017'
function seasonStartYear(date) {
  const [year, month] = date.split('-').map(Number);
  return month >= 7 ? year : year - 1;
}

function seasonId(startYear) {
  return `${startYear}${startYear + 1}`;
}

// Standings as of a past date, or 'now'
async function loadStandings(day, ttlMs = day === 'now' ? hourMs : 24 * hourMs) {
  return callNhlApi(`/standings/${day}`, ttlMs,
    (standings) => standings.standings.map((team) => ({
      id: normalizeName(team.teamCommonName.default),
      abbrev: team.teamAbbrev.default,
      name: team.teamName.default,
      // Any of these work as ?team=, like 'sharks', 'sjs', 'san jose' or 'san jose sharks'
      keys: [team.teamCommonName.default, team.teamAbbrev.default, team.placeName.default, team.teamName.default]
        .map(normalizeName),
      record: `${team.wins}-${team.losses}-${team.otLosses}`,
      points: team.points,
      streak: team.streakCode ? `${team.streakCode}${team.streakCount}` : null
    })));
}

async function loadTeams() {
  return loadStandings('now');
}

async function findTeam(team) {
  if (!team) {
    throw new BadRequestError(`'team' must be specified`);
  }
  const key = normalizeName(team);
  if (!key.match(/^[a-z ]+$/)) {
    throw new BadRequestError(`team must be a team name, city or abbreviation, such as 'sharks', 'maple leafs' or 'sjs', was: '${team}'`);
  }
  const teams = await loadTeams();
  const found = teams.find((t) => t.keys.includes(key));
  if (!found) {
    throw new BadRequestError(`team not found: '${team}'`);
  }
  return { found, teams };
}

// The record as of a past date, or today's for today and later
async function loadRecord(abbrev, date) {
  const standings = await loadStandings(date < todayInLA() ? date : 'now').catch((err) => {
    console.log(`no standings for ${date}:`, err.message);
    return [];
  });
  const team = standings.find((t) => t.abbrev === abbrev);
  return team ? { record: team.record, points: team.points, streak: team.streak } : { record: null, points: null, streak: null };
}

// Today's games can be live, so keep the cache short for them
async function loadGames(date, ttlMs = date === todayInLA() ? minuteMs : 10 * minuteMs) {
  return callNhlApi(`/schedule/${date}`, ttlMs, (schedule) => {
    const day = schedule.gameWeek.find((d) => d.date === date);
    return day ? day.games : [];
  });
}

// Missing seasons, like next season before it's announced, count as no games
async function loadSeason(abbrev, startYear) {
  try {
    return await callNhlApi(`/club-schedule-season/${abbrev}/${seasonId(startYear)}`, 10 * minuteMs,
      (schedule) => schedule.games);
  } catch (err) {
    console.log(`no ${seasonId(startYear)} schedule for ${abbrev}:`, err.message);
    return [];
  }
}

async function loadNextGame(abbrev, date) {
  const startYear = seasonStartYear(date);
  for (const year of [startYear, startYear + 1]) {
    const game = (await loadSeason(abbrev, year))
      .find((g) => g.gameDate > date && g.gameScheduleState !== 'CNCL');
    if (game) return toGame(game, abbrev, game.gameDate);
  }
  return null;
}

function toTeam(team) {
  return {
    id: team.id,
    abbrev: team.abbrev,
    name: `${team.placeName.default} ${team.commonName.default}`,
    shortName: team.commonName.default,
    logo: team.logo,
    darkLogo: team.darkLogo
  };
}

const gameStates = { FUT: 'upcoming', PRE: 'upcoming', LIVE: 'live', CRIT: 'live', FINAL: 'final', OFF: 'final' };

function toState(game) {
  if (game.gameScheduleState === 'PPD') return 'postponed';
  if (game.gameScheduleState === 'CNCL') return 'cancelled';
  return gameStates[game.gameState] || 'upcoming';
}

// 'P2', 'OT', '2OT' (playoffs) or 'SO'
function periodLabel(period) {
  if (!period) return null;
  if (period.periodType === 'SO') return 'SO';
  if (period.periodType === 'OT') {
    const overtime = period.number - (period.maxRegulationPeriods || 3);
    return overtime > 1 ? `${overtime}OT` : 'OT';
  }
  return `P${period.number}`;
}

function toGame(game, abbrev, date) {
  const home = toTeam(game.homeTeam);
  const away = toTeam(game.awayTeam);
  const isHome = game.homeTeam.abbrev === abbrev;
  const state = toState(game);
  const started = state === 'live' || state === 'final';
  return {
    id: game.id,
    title: isHome ? `${home.name} vs ${away.name}` : `${away.name} at ${home.name}`,
    home,
    away,
    isHome,
    date,
    gameDate: game.startTimeUTC,
    state,
    score: started ? { home: game.homeTeam.score, away: game.awayTeam.score } : null,
    period: state === 'live' ? periodLabel(game.periodDescriptor) : null,
    endedIn: state === 'final' && game.gameOutcome ? game.gameOutcome.lastPeriodType : null,
    venue: game.venue ? game.venue.default : null,
    gameCenterUrl: game.gameCenterLink ? `https://www.nhl.com${game.gameCenterLink}` : null,
    broadcasts: (game.tvBroadcasts || []).map((broadcast) => broadcast.network)
  };
}

function checkDate(date) {
  if (!date.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)) {
    throw new BadRequestError(`date must be in format YYYY-MM-DD, was: '${date}'`);
  }
}

async function myTeamToday(team, date) {
  const { found, teams } = await findTeam(team);
  date = date || todayInLA();
  checkDate(date);

  const [dayGames, record, next] = await Promise.all([
    loadGames(date),
    loadRecord(found.abbrev, date),
    loadNextGame(found.abbrev, date)
  ]);
  const games = dayGames
    .filter((game) => game.homeTeam.abbrev === found.abbrev || game.awayTeam.abbrev === found.abbrev)
    .map((game) => toGame(game, found.abbrev, date));

  return {
    team: { id: found.id, abbrev: found.abbrev, name: found.name, ...record },
    games,
    next,
    // For the team picker
    teams: teams.map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name))
  };
}

// Calendar text needs \ , ; and newlines escaped
function icsText(text) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Calendar lines can be at most 75 bytes, so longer ones wrap onto lines starting with a space
function foldLine(line) {
  const lines = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (bytes + size > 75) {
      lines.push(current);
      current = ' ';
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}

function calendarEvent(game, now) {
  const me = game.isHome ? game.home : game.away;
  const them = game.isHome ? game.away : game.home;
  let summary = `${me.shortName} ${game.isHome ? 'vs' : 'at'} ${them.shortName}`;
  if (game.state === 'final' && game.score) {
    const mine = game.isHome ? game.score.home : game.score.away;
    const theirs = game.isHome ? game.score.away : game.score.home;
    const overtime = game.endedIn && game.endedIn !== 'REG' ? ` ${game.endedIn}` : '';
    summary += ` (${mine > theirs ? 'W' : 'L'} ${mine}-${theirs}${overtime})`;
  } else if (game.state === 'postponed' || game.state === 'cancelled') {
    summary += ` (${game.state})`;
  }

  const start = new Date(game.gameDate);
  const end = new Date(start.getTime() + 3 * hourMs);
  const description = [
    game.broadcasts.length ? `TV: ${game.broadcasts.join(', ')}` : null,
    game.gameCenterUrl
  ].filter(Boolean).join('\n');

  return [
    'BEGIN:VEVENT',
    `UID:${game.id}@nhl.andrewmacheret.com`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(summary)}`,
    game.venue ? `LOCATION:${icsText(game.venue)}` : null,
    description ? `DESCRIPTION:${icsText(description)}` : null,
    game.gameCenterUrl ? `URL:${game.gameCenterUrl}` : null,
    `STATUS:${{ cancelled: 'CANCELLED', postponed: 'TENTATIVE' }[game.state] || 'CONFIRMED'}`,
    ...(game.state === 'upcoming' ? [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(summary)}`,
      'TRIGGER:-PT30M',
      'END:VALARM'
    ] : []),
    'END:VEVENT'
  ].filter(Boolean);
}

// Last season and this season, so past results stay on the calendar
async function calendar(team) {
  const { found } = await findTeam(team);
  const startYear = seasonStartYear(todayInLA());
  const seasons = await Promise.all([startYear - 1, startYear].map((year) => loadSeason(found.abbrev, year)));
  const now = new Date();
  const events = seasons.flat().flatMap((game) => calendarEvent(toGame(game, found.abbrev, game.gameDate), now));

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//andrewmacheret.com//NHL Today//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(found.name)}`,
    `X-WR-CALDESC:${icsText(`${found.name} games from NHL Today`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    ...events,
    'END:VCALENDAR'
  ].map(foldLine).join('\r\n') + '\r\n';
}

exports.api = async (event) => {
  console.log('called with event:', event);

  const apis = {
    myTeamToday: () => myTeamToday(event.team, event.date),
    calendar: () => calendar(event.team)
  };
  const api = apis[event.action];
  if (!api) {
    throw new BadRequestError(`Unsupported or undefined action: ${event.action}`);
  }

  try {
    const data = await api();
    console.log('RESOLVE:', typeof data === 'string' ? `${data.length} characters` : JSON.stringify(data));
    return data;
  } catch (err) {
    console.log('REJECT:', err);
    throw err;
  }
};

// Keeps Google from listing the API in search results
// API Gateway adds it for / and /games, which don't use the proxy integration
const NOINDEX = { 'X-Robots-Tag': 'noindex' };

// Routes that API Gateway passes through whole (Lambda proxy integration)
const proxyActions = { '/calendar': 'calendar' };

async function proxyHandler(event) {
  try {
    const body = await exports.api({ ...event.queryStringParameters, action: proxyActions[event.resource] });
    return {
      statusCode: 200,
      headers: { ...NOINDEX, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
      body
    };
  } catch (err) {
    return {
      statusCode: err instanceof BadRequestError ? 400 : 502,
      headers: { ...NOINDEX, 'Content-Type': 'text/plain; charset=utf-8' },
      body: `${err.message}\n`
    };
  }
}

async function runCheck(name, check) {
  try {
    return { name, ok: true, detail: await check() };
  } catch (err) {
    return { name, ok: false, detail: err.message };
  }
}

// GET /healthcheck, for the daily canary (github.com/andrewmacheret/canary)
// It skips the cache so it always asks the NHL API right now
async function healthcheck() {
  const checks = await Promise.all([
    runCheck('NHL standings', async () => {
      const teams = await loadStandings('now', 0);
      if (!teams.length) throw new Error('no teams in the standings');
      return `${teams.length} teams`;
    }),
    runCheck('NHL schedule', async () => `${(await loadGames(todayInLA(), 0)).length} games today`)
  ]);
  const ok = checks.every((c) => c.ok);
  return {
    statusCode: ok ? 200 : 503,
    headers: {
      ...NOINDEX,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'https://andrewmacheret.com'
    },
    body: JSON.stringify({ status: ok ? 'ok' : 'fail', checks })
  };
}

// API Gateway picks the HTTP status from the "400: " or "502: " prefix
// and sends back only the message, without the stack trace
exports.handler = async (event) => {
  if (event.resource === '/healthcheck') return healthcheck();
  if (event.requestContext) return proxyHandler(event);
  try {
    return await exports.api(event);
  } catch (err) {
    const status = err instanceof BadRequestError ? 400 : 502;
    throw new Error(`${status}: ${err.message}`);
  }
};
