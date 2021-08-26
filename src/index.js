const { BaseKonnector, log } = require('cozy-konnector-libs')

module.exports = new BaseKonnector(start)

async function start() {
  log('info', 'Authenticating ...')
}
