const moment = require('moment-timezone');
const request = require('request-promise-native');
const nhlCssLink = require('./nhl-css-link');

const nhlApiUrl = 'https://statsapi.web.nhl.com/api/v1';

let cacheTeams = null;
const cacheSchedules = {};



const callNhlApi = (path) => new Promise((resolve, reject) => {
  const url = nhlApiUrl + path;
  console.log(`calling url: ${url}`);
  return request({uri: url, json: true})
    .then(resolve)
    .catch(reject);
});

const loadTeams = () => new Promise((resolve, reject) => {
  if (cacheTeams) return resolve(cacheTeams);

  callNhlApi('/teams')
    .then((data) => resolve(cacheTeams = data))
    .catch(reject);
});

const loadSchedule = (date, teamId, callback) => new Promise((resolve, reject) => {
  if (!cacheSchedules[date]) cacheSchedules[date] = {};
  if (cacheSchedules[date][teamId]) resolve(cacheSchedules[date][teamId]);

  const url = `/schedule?site=en_nhl&expand=schedule.broadcasts.all&startDate=${date}&endDate=${date}&teamId=${teamId}`;
  callNhlApi(url)
    .then((data) => resolve(cacheSchedules[date][teamId] = data))
    .catch(reject);
});

const myTeamToday = (team, date) => new Promise((resolve, reject) => {
  if (!team) {
    return reject('team must be specified');
  }
  if (!team.match(/^[a-z\ ]+$/)) {
    return reject(`team must be a lower case set of words, such as "sharks" or "maple leafs", was: "${teamId}"`);
  }
  
  if (!date) {
    // TODO: determine time zone based on which team was chosen?
    date = moment.tz('America/Los_Angeles').format('YYYY-MM-DD');
  }
  if (!date.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)) {
    return reject(`date must be in format YYYY-MM-DD: "${date}"`);
  }

  console.log('load teams ...');
  loadTeams().then((nhlTeams) => {

      const nhlTeamNameToId = Object.assign({}, ...nhlTeams.teams.map((nhlTeam) => ({
        [ nhlTeam.teamName.toLowerCase() ]: nhlTeam.id
      })));
      const nhlTeamIdToFullTeamName = Object.assign({}, ...nhlTeams.teams.map((nhlTeam) => ({
        [ nhlTeam.id ]: nhlTeam.name
      })));

      const teamId = nhlTeamNameToId[team];
      if (!teamId) {
        return reject(`team not found: "${team}"`);
      }

      console.log(`load schedule for date=${date} teamId=${teamId} ...`);
      loadSchedule(date, teamId)
        .then((nhlSchedule) => {

          const games = ((nhlSchedule.dates[0] || {}).games || []).map((item) => {
            const {
              teams: {
                home: {
                  team: {
                    id: homeId,
                    name: homeName
                  }
                },
                away: {
                  team: {
                    id: awayId,
                    name: awayName
                  }
                }
              }
            } = item;
            const isHome = homeId === teamId;

            return {
              title: isHome ? `${homeName} vs ${awayName}` : `${awayName} at ${homeName}`,
              home: {id: homeId, name: homeName},
              away: {id: awayId, name: awayName},
              isHome: isHome,
              gameDate: item.gameDate,
              broadcasts: item.broadcasts ? item.broadcasts.map((broadcast) => broadcast.name) : []
            };
          });
          return resolve({games});

        }).catch(reject);
    }).catch(reject);
});

const apiWrapper = (fn, args) => new Promise((resolve, reject) => {
  fn(...args)
    .then(resolve)
    .catch(reject);
});

exports.handler = (event, context, callback) => {
  console.log('called with event:', event);

  const resolve = (data) => {
    console.log('RESOLVE:', data);
    callback(null, data);
  };
  const reject = (err) => {
    console.log('REJECT:', err);
    callback(JSON.stringify(err));
  };

  const apis = {
    myTeamToday: () => apiWrapper(myTeamToday, [event.team, event.date]),
    cssLink: () => apiWrapper(nhlCssLink.loadCssUrl, [])
  };
  const apiNotFound = () => { throw `Unsupported or undefined action: ${event.action}` };

  try {
    (apis[event.action] || apiNotFound)()
      .then(resolve)
      .catch(reject);
  } catch(err) {
    console.log('unexpected exception', err);
    reject(err);
  }
};

