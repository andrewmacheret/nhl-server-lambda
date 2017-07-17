const request = require('request-promise-native');
const cheerio = require('cheerio');

const nhlScheduleUrl = 'https://www.nhl.com/sharks/schedule';

exports.loadCssUrl = () => new Promise((resolve, reject) => {
  console.log(`parsing page for css url: ${nhlScheduleUrl}`);
  request({uri: nhlScheduleUrl, transform: (body) => cheerio.load(body)})
    .then(($) => {
      const siteCoreBuildPath = $(`meta[name='siteCoreBuildPath']`).attr('content');
      const siteCoreBuildVersionDirectory = $(`meta[name='siteCoreBuildVersionDirectory']`).attr('content');
      
      const cssUrl = `https:${siteCoreBuildPath}/site-core/${siteCoreBuildVersionDirectory}styles/nhl-logos.css.gz`;
      //console.log(`found url: ${cssUrl}`);
      resolve({cssUrl});

    }).catch(reject);
});
