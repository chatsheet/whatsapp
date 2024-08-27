require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = ''
const CLIENT_SECRET = ''
const REDIRECT_URL = ''
console.log(REDIRECT_URL)
console.log(CLIENT_ID)
console.log(REDIRECT_URL)
// Create a new instance of the OAuth2Client with the stored token
function createDriveInstance(email, userToken) {
  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URL
  );

  // Debugging: Log the user tokens
  console.log('User Tokens:', userToken);

  if (userToken) {
    oauth2Client.setCredentials(userToken);
  } else {
    throw new Error('User tokens are undefined or invalid.');
  }

  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function findOrCreateFolder(email, userToken, parentId, folderName) {
  try {
    // Create the Google Drive instance
    const drive = createDriveInstance(email, userToken);

    // Define the parent folder name and ID
  //  const parentId = 'root'; // Assuming you want to create/find a folder in the root directory
//    const folderName = 'whatsapp-archiver'; // Replace with your desired folder name

    // Search for the folder
    const res = await drive.files.list({
      q:` name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder'`,
      fields: 'files(id, name)',
    });

    const folders = res.data.files;
    if (folders.length > 0) {
      // Folder exists
      console.log(`Folder '${folderName}' found: ${folders[0].id}`);
      return folders[0].id;
    } else {
      // Folder does not exist, create it
      const createRes = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        },
        fields: 'id',
      });
      console.log(`Folder '${folderName}' created: ${createRes.data.id}`);
      return createRes.data.id;
    }
  } catch (error) {
    console.error('Error finding or creating folder:', error);
    throw error;
  }
}


async function uploadFile(email, filePath, mimeType, userToken, folderId) {

  const drive = createDriveInstance(email, userToken);

  const fileMetadata = {
    name: path.basename(filePath),
    parents: [folderId],  // Specify the folder ID here
  };

  const media = {
    mimeType: mimeType,
    body: fs.createReadStream(filePath),
  };

  try {
    const res = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name',
    });
    console.log(`File uploaded: ${res.data.name} (ID: ${res.data.id})`);
    return res.data.id;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

module.exports = {
  uploadFile,
  createDriveInstance,
  findOrCreateFolder // Exporting the findOrCreateFolder function
};
