require('dotenv').config();
const { google } = require('googleapis');

const { OAuth2 } = google.auth;

// Replace with your client ID, client secret, and redirect URL
const CLIENT_ID = ''
const CLIENT_SECRET = ''
const REDIRECT_URL = ''
//console.log(CLIENT_ID)
const oauth2Client = new OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL
);

// Generate a URL that allows users to grant access to your app
const scopes = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.file'
];

function getAuthUrl() {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
  return url;
}

async function setCredentials(code) {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

//    console.log('Access Token:', tokens.access_token);
  //  console.log('Tokens:', tokens); // Debugging output
    return tokens;
  } catch (error) {
    console.error('Failed to get tokens:', error);
    throw error;
  }
}


module.exports = {
    setCredentials,
    getAuthUrl,
    oauth2Client
}
