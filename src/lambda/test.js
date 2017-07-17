const sys = require('process');
const index = require('./nhl-api');

class Test {
  constructor(args, expected) {
    this._args = args;
    this._expected = expected;
    Test.incTestCount();
  }

  run() {
    let expected = this._expected;
    this.fn()(...this._args, (error, actual) => {
      if (error) {
        console.log('ERROR:', error);
        return;
      }

      if (!this.test(expected, actual)) {
        console.log('FAILURE:', this.failureMessage(expected, actual));
        return;
      }

      Test.incSuccessCount();
    });
  }

  fn() {
    throw 'method not implemented';
  }
  
  test(expected, actual) {
    throw 'method not implemented';
  }

  failureMessage(expected, actual) {
    throw 'method not implemented';
  }

  static incTestCount() {
    Test._testCount = Test.testCount + 1;
  }

  static incSuccessCount() {
    Test._successCount = Test.successCount + 1;
  }

  static get testCount() { return Test._testCount || 0; }

  static get successCount() { return Test._successCount || 0; }
}

class MyTeamTodayTest extends Test {
  constructor(args, expected) {
    super(args, expected);
  }

  fn() {
    return index.handler;
  }

  test(expected, actual) {
    return JSON.stringify(expected) === JSON.stringify(actual)
  }

  failureMessage(expected, actual) {
    return `
  expected: ${JSON.stringify(expected)}
  !==
  actual:   ${JSON.stringify(actual)}
`
  }
}

class CssTest extends Test {
  constructor(args, expected) {
    super(args, expected);
  }

  fn() {
    return index.handler;
  }

  test(expected, actual) {
    console.log(expected, actual, JSON.stringify(actual), expected.test(JSON.stringify(actual)));
    return expected.test(JSON.stringify(actual))
  }

  failureMessage(expected, actual) {
    return `
  expected: ${expected}
  !~=
  actual:   ${JSON.stringify(actual)}
`
  }
}

const tests = [
  new MyTeamTodayTest(
    [ { action: 'myTeamToday', team: 'sharks', date: '2017-02-11' }, {} ],
    { games: [
      { title: 'San Jose Sharks at Philadelphia Flyers',
        home: { id: 4, name: 'Philadelphia Flyers' },
        away: { id: 28, name: 'San Jose Sharks' },
        isHome: false,
        gameDate: '2017-02-11T18:00:00Z',
        broadcasts: ['NHLN-US','CSN-PH','CSN-CA'] } ] }
  ),
  new MyTeamTodayTest(
    [ { action: 'myTeamToday', team: 'sharks', date: '2016-11-21' }, {} ],
    { games: [
      { title: 'San Jose Sharks vs New Jersey Devils',
        home: { id: 28, name: 'San Jose Sharks' },
        away: { id: 1, name: 'New Jersey Devils' },
        isHome: true,
        gameDate: '2016-11-22T03:30:00Z',
        broadcasts: ['CSN-CA','MSG+'] } ] }
  ),
  new CssTest(
    [ { action: 'cssLink' }, {} ],
    /^ ?\{ ?"cssUrl": ?"https:\/\/www-league\.nhlstatic\.com\/builds\/site-core\/[a-z0-9]{40}_[0-9]+\/styles\/nhl-logos\.css\.gz" ?\} ?$/
  )
];

tests.forEach((test) => test.run());

process.on('exit', () => {
  console.log(`${Test.successCount} of ${Test.testCount} tests passed`);
  process.exit(Test.successCount !== Test.testCount ? 1 : 0);
});
