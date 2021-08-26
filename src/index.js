const {
  BaseKonnector,
  requestFactory,
  saveBills,
  saveFiles,
  log,
  errors,
  cozyClient
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

// Import des modèles pour la qualification des factures
const models = cozyClient.new.models
const { Qualification } = models.document

// Variables du site web
const VENDOR = 'SYMAMOBILE'
const baseUrl = 'https://mysyma.symamobile.com/my-syma.html#loginpage'
const baseApiUrl = 'https://api.symamobile.com/fr/user/'
const loginUrl = baseApiUrl + 'login'
const listefacturesUrl = baseApiUrl + 'account'

// Type de facture
const FACTURE_SIMPLE = 0
const FACTURE_DETAIL = 1
const FACTURE_AUTRE = 2

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

  // Récupération des factures simples
  await getFactures(fields, FACTURE_SIMPLE)

  // Récupération des factures détaillées
  await getFactures(fields, FACTURE_DETAIL)

  // Récupération des factures autres
  await getFactures(fields, FACTURE_AUTRE)
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

// Import des Factures
async function getFactures(fields, bFacture_Detail) {
  // Récupération de la liste des factures
  log('info', 'Récupération de la liste complète de factures liées au compte')
  let liste_factures = await requestJson(`${listefacturesUrl}?facturelist=yes`)

  if (bFacture_Detail == FACTURE_SIMPLE) {
    log('info', 'Traitement des factures simples ...')
    liste_factures = liste_factures.factures.data
  } else if (bFacture_Detail == FACTURE_DETAIL) {
    log('info', 'Traitement des factures détaillées ...')
    liste_factures = liste_factures.factures.data
  } else if (bFacture_Detail == FACTURE_AUTRE) {
    log('info', 'Traitement des factures autre ...')
    liste_factures = liste_factures.factures_other.data
  }

  // Conversion du JSON pour les factures
  log('info', 'Mise en forme des factures')
  let factures = liste_factures.map(facture => ({
    vendor: VENDOR,
    date: new Date(facture.bill_date),
    amount: new Number(facture.amount),
    currency: 'EUR',
    vendorRef: facture.nFacture,
    filename: formaliseNomfacture(
      facture.bill_date,
      facture.amount,
      facture.bill_month,
      facture.bill_year,
      facture.nFacture,
      bFacture_Detail
    ),
    fileurl:
      bFacture_Detail == FACTURE_DETAIL
        ? facture.call_list_pdf
        : facture.facture_pdf
  }))

  if (bFacture_Detail == FACTURE_SIMPLE) {
    // Import des factures dans COZY
    log('info', 'Sauvegarde des factures dans Cozy')
    await saveBills(factures, fields, {
      subPath: '',
      identifiers: ['vendor'],
      sourceAccount: fields.login,
      sourceAccountIdentifier: fields.login,
      fileAttributes: {
        metadata: {
          importDate: new Date(),
          contentAuthor: 'symamobile',
          version: 1,
          isSubscription: true,
          carbonCopy: true,
          qualification: Qualification.getByLabel('phone_invoice')
        }
      }
    })
  } else {
    await saveFiles(factures, fields, {
      identifiers: ['vendor'],
      sourceAccount: fields.login,
      sourceAccountIdentifier: fields.login,
      fileAttributes: {
        metadata: {
          importDate: new Date(),
          contentAuthor: 'symamobile',
          version: 1,
          isSubscription: true,
          carbonCopy: true
        }
      }
    })
  }
}

// Convert a Date object to a ISO date string
function formatDate(date) {
  let year = date.getFullYear()
  let month = date.getMonth() + 1
  let day = date.getDate()
  if (month < 10) {
    month = '0' + month
  }

  if (day < 10) {
    day = '0' + day
  }

  return `${year}-${month}-${day}`
}

// Fonction permettant de traduire le mois anglais en francais sans accent
function traductionMois(sMois) {
  const mois_anglais = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december'
  ]
  const mois_francais = [
    'Janvier',
    'Fevrier',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Aout',
    'Septembre',
    'Octobre',
    'Novembre',
    'Decembre'
  ]

  return mois_francais[mois_anglais.indexOf(sMois.toLowerCase())]
}

// Formalise le nom des factures
function formaliseNomfacture(
  dDate,
  mMontant,
  sPeriode_Mois,
  sPeriode_Annee,
  sReference,
  bDetail
) {
  let periode = traductionMois(sPeriode_Mois) + '_' + sPeriode_Annee
  let detail = bDetail == true ? '_detail' : ''
  let date = new Date(dDate)
  let montant = new Number(mMontant)

  if (bDetail == FACTURE_SIMPLE) detail = ''
  else if (bDetail == FACTURE_DETAIL) detail = '_detail'
  else if (bDetail == FACTURE_AUTRE) detail = '_autre'

  return (
    formatDate(date) +
    '_' +
    VENDOR +
    '_' +
    montant.toFixed(2) +
    'EUR' +
    '_' +
    periode +
    '_' +
    sReference +
    detail +
    '.pdf'
  )
}
