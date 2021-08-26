const {
  BaseKonnector,
  requestFactory,
  log,
  errors
} = require('cozy-konnector-libs')

// Initialisation d'une variable pour le partage des cookies entre instances
const request = requestFactory()
const j = request.jar()

// Instance pour la récupération de réponse HTML
const requestHtml = requestFactory({
  debug: false,
  followAllRedirects: true,
  cheerio: false,
  json: false,
  jar: j
})

// Instance pour la récupération de réponse JSON
let requestJson

// Variables du site web
const VENDOR = 'SYMAMOBILE'
const baseUrl = 'https://mysyma.symamobile.com/my-syma.html#loginpage'
const loginUrl = 'https://api.symamobile.com/fr/user/login'

// Initialisation du konnector
module.exports = new BaseKonnector(start)

// Fonction permettant d'initialiser les requests avec le token Authorization
function init_request(token) {
  requestJson = requestFactory({
    debug: false,
    cheerio: false,
    json: true,
    jar: j,
    headers: {
      Authorization: token,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
    }
  })
}

async function start(fields) {
  // Initialisation de la request Json avec un Token Nul
  init_request('null')

  // Authentification
  log('info', 'Authentification ...')
  await this.deactivateAutoSuccessfulLogin()
  await authenticate.bind(this)(fields.login, fields.password)
  await this.notifySuccessfulLogin()
  log('info', 'Correctement authentifié')
}

// Fonction d'authentification au site
function authenticate(username, password) {
  // Authentification et récupération du token
  return requestHtml(`${baseUrl}`)
    .then(() => {
      return requestJson({
        uri: `${loginUrl}`,
        method: 'POST',
        form: {
          login: username,
          password: password,
          lang: 'fr'
        },
        transform: (body, response) => [response.statusCode, body]
      })
    })
    .catch(err => {
      if (err.statusCode == 401) {
        throw new Error(errors.LOGIN_FAILED)
      } else {
        throw err
      }
    })
    .then(([statusCode, body]) => {
      if (statusCode === 200) {
        // On réinitialise les requests avec le token
        init_request(body.token)

        return body
      } else {
        throw new Error(errors.VENDOR_DOWN)
      }
    })
}
