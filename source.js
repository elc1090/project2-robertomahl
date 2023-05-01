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
const DISCOVERY_DOC_CALENDAR = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const DISCOVERY_DOC_SHEETS = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited = false;
let gisInited = false;

const SPREADSHEET_NAME = "Minhas Despesas";

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
        discoveryDocs: [DISCOVERY_DOC_CALENDAR, DISCOVERY_DOC_SHEETS],
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
        await insertExpenseRecord();
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
                'dateTime': getRFC3339(form.elements['endDateTime'].value),
                'timeZone': 'UTC'
            },
        };

        var request = gapi.client.calendar.events.insert({
            'calendarId': 'primary',
            'resource': event
        });

        request.execute(function (event) {
            if (event.htmlLink) {
                addTextMessage('Evento criado com sucesso: <a href="' + event.htmlLink + '" target="_blank">Ver na agenda</a>');
            } else {
                addTextMessage('Erro na inserção de evento. Código: ' + event.code + '. Mensagem: ' + event.message);
            }
        });
    } catch (err) {
        addTextMessage('Erro na inserção de evento. Mensagem: ' + err.message);
    }
}

async function insertExpenseRecord() {
    let form = document.getElementById('eventForm');

    // If no cost has been informed for the event, stops the expense recording
    let expenseAmount = form.elements['expenseAmount'].value;
    if (expenseAmount === undefined || expenseAmount === '') {
        return;
    }

    // If no spreadsheet ID was loaded/informed, creates the spreadsheet
    let spreadsheetId = form.elements['spreadsheetId'].value;
    if (spreadsheetId === undefined || spreadsheetId === '') {
        spreadsheetId = await createSpreadsheet(SPREADSHEET_NAME);
    }

    // If something went wrong with the spreadsheet search/creation, stops the expense recording
    if (spreadsheetId === undefined || spreadsheetId === '') {
        return;
    }

    let endDateTime = form.elements['endDateTime'].value;
    if (! await correspondentSheetExists(endDateTime)) {
        await createSheet(spreadsheetId, endDateTime);
    }

    var batchUpdateSpreadsheetRequestBody = {
        'requests': [
            {
                'appendCells': {
                    'sheetId': getYearMonthAsId(endDateTime),
                    'fields': '*',
                    'rows': [
                        {
                            'values': [
                                {
                                    'userEnteredValue': {
                                        'stringValue': endDateTime
                                    }
                                },
                                {
                                    'userEnteredValue': {
                                        'numberValue': expenseAmount
                                    }
                                },
                                {
                                    'userEnteredValue': {
                                        'stringValue': form.elements['summary'].value
                                    }
                                }
                            ]
                        }
                    ]
                }
            }
        ]
    };

    await batchUpdateSpreadsheet(spreadsheetId, batchUpdateSpreadsheetRequestBody);
}

async function correspondentSheetExists(endDateTime) {
    return false;
}

async function createSheet(spreadsheetId, datetimeLocal) {

    var batchUpdateSpreadsheetRequestBody = {
        'requests': [
            {
                'addSheet': {
                    'properties': {
                        'sheetId': getYearMonthAsId(datetimeLocal),
                        'title': getYearMonthAsName(datetimeLocal)
                    }
                }
            }
        ]
    };

    await batchUpdateSpreadsheet(spreadsheetId, batchUpdateSpreadsheetRequestBody);
}

//TODO: think about making the call synchronous
async function batchUpdateSpreadsheet(spreadsheetId, batchUpdateSpreadsheetRequestBody) {

    var params = { 'spreadsheetId': spreadsheetId };

    try {
        // A list of updates to apply to the spreadsheet.
        // Requests will be applied in the order they are specified.
        // If any request is not valid, no requests will be applied.
        var response = await gapi.client.sheets.spreadsheets.batchUpdate(params, batchUpdateSpreadsheetRequestBody);
        addTextMessage('Atualização da tabela efetuada com sucesso.');
    } catch (err) {
        addTextMessage('Erro na atualização da tabela. Código: ' + err.result.error.code + '. Mensagem: ' + err.result.error.message);
    }
}

//TODO: to be called upon page load
function loadSpreadsheetId() {
    //TODO: set cookie value in the field
}

function storeSpreadsheetId(id) {
    document.getElementById('eventForm').elements['spreadsheetId'].value = id;
    //TODO: store in cookies
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

function getYearMonthAsId(datetimeLocal) {
    const date = new Date(datetimeLocal);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Add 1 to adjust for 0-based indexing
    const yearMonth = `${year}${month}`;
    return parseInt(yearMonth);
}

function getYearMonthAsName(datetimeLocal) {
    const date = new Date(datetimeLocal);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Add 1 to adjust for 0-based indexing
    const yearMonth = `${year}${'-'}${month < 10 ? '0' : ''}${month}`; // pad month with leading zero if necessary
    return yearMonth;
}

async function createSpreadsheet(spreadsheetName) {
    try {
        const response = await gapi.client.sheets.spreadsheets.create({
            properties: {
                title: spreadsheetName,
            },
        });
        const spreadsheetId = response.result.spreadsheetId;

        storeSpreadsheetId(spreadsheetId);

        addTextMessage('Spreadsheet criada com successo. ID: ' + spreadsheetId);
        return spreadsheetId;
    } catch (err) {
        addTextMessage('Erro na criação da spreadsheet. Mensagem: ' + err.message)
        return '';
    }
}

function addTextMessage(content) {
    document.getElementById('content').insertAdjacentHTML('beforeend', wrapContentInParagraph(content));
}

function wrapContentInParagraph(content) {
    return "<p>" + content + "</p>"
}
