/* exported gapiLoaded */
/* exported gisLoaded */
/* exported handleAuthClick */
/* exported handleSignoutClick */

// Both below do not need to be protected. Restrictions were made in Google API config to allow requests from my domain only
// Used for authenticating users
const CLIENT_ID = '835802431834-kbd98p5r7bd28uajbondol3up4b673sm.apps.googleusercontent.com';
// Used for identifying the API that is requesting public Google resources
const API_KEY = 'AIzaSyA_LT1DlQ_iArm1fGqxIK-YpjAOUSoZgZo';

// Discovery doc URL for APIs used by the quickstart
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
const SCOPES = 'https://www.googleapis.com/auth/calendar';

let tokenClient;
let gapiInited = false;
let gisInited = false;

document.getElementById('authorize_button').style.visibility = 'hidden';
document.getElementById('signout_button').style.visibility = 'hidden';

/**
 * Callback after api.js is loaded.
 */
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

/**
 * Callback after the API client is loaded. Loads the
 * discovery doc to initialize the API.
 */
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    maybeEnableButtons();
}

/**
 * Callback after Google Identity Services are loaded.
 */
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '',
    });
    gisInited = true;
    maybeEnableButtons();
}

/**
 * Enables user interaction after all libraries are loaded.
 */
function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('authorize_button').style.visibility = 'visible';
    }
}

/**
 *  Sign in the user upon button click.
 */
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        document.getElementById('signout_button').style.visibility = 'visible';
        await insertEvent();
    };

    if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data
        // when establishing a new session.
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        // Skip display of account chooser and consent dialog for an existing session.
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

/**
 *  Sign out the user upon button click.
 */
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('content').innerText = '';
        document.getElementById('signout_button').style.visibility = 'hidden';
    }
}

/**
 *   Converts a datetimeLocal value to RFC3339 format timestamp, required by Google.
 *   Consider that toISOString converts the datetimeLocal's timezone to ISO.
 */
function getRFC3339(datetimeLocal) {
    const date = new Date(datetimeLocal);
    const rfc3339 = date.toISOString();
    const rfc3339WithoutZ = rfc3339.replace("Z", "");
    return rfc3339WithoutZ;
}

/**
 *   Submits the form data and creates the event in Google Calendar.
 */
async function insertEvent() {
    let form = document.getElementById('eventForm');

    try {
        const event = {
            'summary': form.elements['summary'].value,
            'location': form.elements['location'].value,
            'description': form.elements['description'].value,
            'start': {
                'dateTime': getRFC3339(form.elements['startDateTime'].value),
                'timeZone': 'UTC'
            },
            'end': {
                'dateTime': form.elements['endDateTime'].value,
                'timeZone': 'UTC'
            },
        };

        var request = gapi.client.calendar.events.insert({
            'calendarId': 'primary',
            'resource': event
        });

        request.execute(function (event) {
            if (event.htmlLink)
                document.getElementById('content').innerText = 'Evento criado com sucesso: ' + event.htmlLink;
            else
                document.getElementById('content').innerText = 'Erro. Código: ' + event.code + ' Mensagem: ' + event.message;
        });

    } catch (err) {
        document.getElementById('content').innerText = err.message;
    }
}