const nhlApiUrl = 'https://api-web.nhle.com/v1';

const teamsTtlMs = 24 * 60 * 60 * 1000;
const scheduleTtlMs = 10 * 60 * 1000;

const cache = {};

async function callNhlApi(path, ttlMs) {
  const cached = cache[path];
  if (cached && Date.now() - cached.time < ttlMs) return cached.data;

  const url = nhlApiUrl + path;
  console.log(`calling url: ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) {
    throw new Error(`NHL API returned ${response.status} for ${path}`);
  }
  const data = await response.json();
  cache[path] = { time: Date.now(), data };
  return data;
}

// Maps lower case team names like 'maple leafs' to abbreviations like 'TOR'
async function loadTeams() {
  const standings = await callNhlApi('/standings/now', teamsTtlMs);
  return Object.fromEntries(standings.standings.map((team) => [
    team.teamCommonName.default.toLowerCase(),
    team.teamAbbrev.default
  ]));
}

async function loadGames(date) {
  const schedule = await callNhlApi(`/schedule/${date}`, scheduleTtlMs);
  const day = schedule.gameWeek.find((d) => d.date === date);
  return day ? day.games : [];
}

function toTeam(team) {
  return {
    id: team.id,
    name: `${team.placeName.default} ${team.commonName.default}`,
    logo: team.logo
  };
}

async function myTeamToday(team, date) {
  if (!team) {
    throw new Error(`'team' must be specified`);
  }
  if (!team.match(/^[a-z ]+$/)) {
    throw new Error(`team must be a lower case set of words, such as 'sharks' or 'maple leafs', was: '${team}'`);
  }

  if (!date) {
    // en-CA formats dates as YYYY-MM-DD
    date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
  }
  if (!date.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)) {
    throw new Error(`date must be in format YYYY-MM-DD, was: '${date}'`);
  }

  const teams = await loadTeams();
  const abbrev = teams[team];
  if (!abbrev) {
    throw new Error(`team not found: '${team}'`);
  }

  const games = (await loadGames(date))
    .filter((game) => game.homeTeam.abbrev === abbrev || game.awayTeam.abbrev === abbrev)
    .map((game) => {
      const home = toTeam(game.homeTeam);
      const away = toTeam(game.awayTeam);
      const isHome = game.homeTeam.abbrev === abbrev;
      return {
        title: isHome ? `${home.name} vs ${away.name}` : `${away.name} at ${home.name}`,
        home,
        away,
        isHome,
        gameDate: game.startTimeUTC,
        broadcasts: (game.tvBroadcasts || []).map((broadcast) => broadcast.network)
      };
    });
  return { games };
}

exports.api = async (event) => {
  console.log('called with event:', event);

  const apis = {
    myTeamToday: () => myTeamToday(event.team, event.date)
  };
  const api = apis[event.action];
  if (!api) {
    throw new Error(`Unsupported or undefined action: ${event.action}`);
  }

  try {
    const data = await api();
    console.log('RESOLVE:', JSON.stringify(data));
    return data;
  } catch (err) {
    console.log('REJECT:', err);
    throw err;
  }
};

exports.handler = exports.api;
