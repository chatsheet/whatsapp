require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const qrcode = require('qrcode');
const { Client } = require('whatsapp-web.js');
const path = require('path');
const session = require('express-session'); // Add this line
const store = new session.MemoryStore();

const { getAuthUrl, setCredentials } = require('./auth.js');
const { uploadFile, createDriveInstance, findOrCreateFolder } = require('./upload.js');
const jwt = require('jsonwebtoken');
const { createZipFile } = require('./createZipFile.js'); // Add this line
const moment = require("moment");
const tz = require("moment-timezone");
const { handle_message } = require('./handle_message');
const { createExcelFile } = require('./createExcelFile');


const app = express();
const ORIGIN = process.env.FRONTEND_URL;
//console.log(ORIGIN)
app.use(express.json());
app.use(cors({
    origin: '', // Your frontend URL
    credentials: true // Allow cookies and credentials
}));
// Adjust origin to your frontend URL

// Initialize express-session
app.use(session({
// store: new RedisStore({ client : redisClient }),
  secret: 'your-session-secret', // Replace with a strong secret
  resave: false,
  saveUninitialized: true,
  store
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
app.get('/',(req,res)=>{
        res.send("NODE SERVER IS LIVE");
})
const clients = {};
const isReady = {};
const isAvailable = {};
const phoneNumbers = {};
const userTokens = {};
const folderIDs = {};
// Handle timestamps for message processing
let start = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
let end = Math.floor(Date.now() / 1000);

app.get('/auth', (req, res) => {
  const url = getAuthUrl();
//console.log('url is --- ', url)
  res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
//	console.log('url in oauth2 : ', req.originalUrl);
  try {
    const tokens = await setCredentials(code);

     // Decode the id_token to get user info
     const decodedToken = jwt.decode(tokens.id_token);

     if (decodedToken && decodedToken.email) {
       const userEmail = decodedToken.email;
       console.log(`User Email: ${userEmail}`);
       userTokens[userEmail] = tokens;
  //     console.log('userToken in oauth2callback',userTokens[userEmail]);
 
       // Here, you might want to store userEmail in a session or database
       // For example, if using sessions:
       req.session.userEmail = userEmail;
	console.log('session id in /oauth2callback',req.sessionID)
	console.log('req.session.userEmail in oauth2callback ',req.session.userEmail);

      } else {
        res.status(400).send('Invalid ID token');
      }

    res.redirect(''); // Redirect to a page where you can display user info
  } catch (error) {
    res.status(500).send('Authentication failed.');
  }
});

//app.use((req, res, next) => {  
//	console.log('Session id is :::', req.sessionID);
//	next();
//})
app.get('/checksession', (req, res) => {
	console.log('session in check-',req.sessionID);
	res.json({email: req.session.userEmail});
})

app.get('/user-info', (req, res) => {
	console.log('url in user-info', req.originalUrl);
	console.log('user email in /user-info --- --- :',req.session.userEmail);
	console.log('Session in /user-info:', req.session); // Debugging line
	console.log('Session ID in /user-info:', req.sessionID); 
  if (req.session.userEmail) {
    res.json({ email: req.session.userEmail });
  } else {
    res.status(401).send('Unauthorized');
  }
});


// Initialize WhatsApp client
const initializeClient = (email) => {
  clients[email] = new Client({
    puppeteer: {
	product: "chrome", 
	executablePath: "/usr/bin/chromium-browser"
  //    headless: true,
//      args: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    bypassCSP: true,
    restartOnAuthFail: true,
    webVersionCache: {
      type: 'none',
    }
  });
  console.log(userTokens[email]);
  clients[email].initialize();
//  makeUserFolder(email, );
  clients[email].on('ready', async () => {
    console.log(`Client ${email} is ready`);
    isReady[email] = true;
    phoneNumbers[email] = (await clients[email].info.wid)._serialized.replace('@c.us', '');
    console.log(`Phone for ${email}: ${phoneNumbers[email]}`);
await makeFile(email, clients[email], start, end);
  });

  
  clients[email].on('qr', async (qr) => {
    const qrCodeImage = await qrcode.toDataURL(qr);
    const base64Data = qrCodeImage.replace(/^data:image\/png;base64,/, '');
    const imagePath = path.join(__dirname, `${email}.png`);
    fs.writeFileSync(imagePath, base64Data, 'base64');
    console.log(`QR Code for ${email} updated and saved as ${imagePath}`);
  });
};

// Handle client disconnection
app.post('/disconnect/:email', (req, res) => {
  const email = req.params.email;
  handleClientDisconnection(email); // Assuming you have a function to handle disconnection
  res.send({ message: 'Client disconnected' });
});

// Update handleClientDisconnection function to delete the user's folder and other resources
const handleClientDisconnection = (email) => {
  console.log(`Client ${email} is disconnected`);

  const qrImagePath = path.join(__dirname, `${email}.png`);
  if (fs.existsSync(qrImagePath)) {
    fs.unlinkSync(qrImagePath);
    console.log(`Deleted QR code image for ${email}: ${qrImagePath}`);
  }
const userFolderPath = path.join(__dirname, `${email}.xlsx`);
  if (fs.existsSync(userFolderPath)) {
    fs.rmdirSync(userFolderPath, { recursive: true });
    console.log(`Deleted user folder for ${email}: ${userFolderPath}`);
  }

  isReady[email] = false;
  isAvailable[email] = false;
};

// Initialize WhatsApp client
app.post('/initialize', (req, res) => {
  const { email} = req.body;
  if (!clients[email]) {
    
    initializeClient(email);
    res.send({ message: 'Client initialized' });
  } else {
    res.send({ message: 'Client already initialized' });
  }
});

// Get client status
app.get('/status/:email', (req, res) => {
  const email = req.params.email;
  if (isReady[email]) {
    res.status(200).send('ready');
  } else {
    res.status(503).send('not ready');

 }
});

// Get QR code
app.get('/qr/:email', (req, res) => {
  const email = req.params.email;
  const imagePath = path.join(__dirname, `${email}.png`);
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).send('QR code not found');
  }
});




app.post('/timestamps/:email', (req, res) => {
  const email = req.params.email;
  const { startTimestamp, endTimestamp } = req.body;
  if (startTimestamp && endTimestamp) {
    start = startTimestamp;
    end = endTimestamp;
    console.log(`Start Unix Timestamp for ${email}: ${start}`);
    console.log(`End Unix Timestamp for ${email}: ${end}`);
    res.send({ message: 'Timestamps updated successfully' });
  } else {
    res.status(400).send({ message: 'Invalid timestamps' });
  }
});
app.get('/download/:email', (req, res) => {
  const email = req.params.email;
  const userFolderPath = path.join(__dirname, email);
  const filePath = path.join(userFolderPath, `${email}.xlsx`);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, (err) => {
      if (err) {
        console.error(`Error downloading file for ${email}:`, err);
        res.status(500).send('Error downloading file');
      } else {
        console.log('downloading...');
      }
    });
  } else {
    res.status(404).send('Excel file not found');
  }
});

// Optionally update /file-status route
app.get('/file-status/:email', (req, res) => {
  const email = req.params.email;
  if (isAvailable[email]) {
    res.status(200).send('available');
  } else {
    res.status(503).send('not available'); // or some other status code indicating not ready
  }
});
//app.post('/upload/:email', async (req, res) => {
//  const email = req.params.email;
  //const filePath = path.join(__dirname, `${email}.xlsx`);

//  try {
    // Upload the file
//    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
//    const fileId = await uploadFile(email, filePath, mimeType, userTokens[email]);

//    res.send({ message: 'File uploaded successfully', fileId });
//  } catch (error) {
//    console.error('Error uploading file:', error);
  //  res.status(500).send('Error uploading file');
//  }
//});

async function makeFile(email, client, start, end){
  const parentId = 'root'; // Assuming you want to create/find a folder in the root directory
  const folderName = 'whatsapp-archiver'; // Replace with your desired folder name
  const folder = findOrCreateFolder(email, userTokens[email], parentId, folderName);
  folderIDs[email] = folder;
  const messageQueue = [];
  const fileName = `${email}.xlsx`;
  const filePath = path.join(__dirname, fileName);

  const processReaction = async (message) => {
    const reactions = await message.getReactions();
    for (const reaction of reactions) {
      for (const sender of reaction.senders) {
        const messageTimestampUnix = sender.timestamp;
        if (messageTimestampUnix > start && messageTimestampUnix < end) {
          let messagebody = `${sender.reaction}:${message.body}`;
          messagebody = messagebody.replace(/[\u2019]/g, "'");
          let to = "";
          let type = `Reaction`;
          let from = sender.senderId.replace("@c.us", "");
          let message_code = message.id.id;
          const timedate = moment(messageTimestampUnix * 1000).tz("Asia/Kolkata").format("DD-MM-YYYY HH:mm:ss");
          messageQueue.push({ messageTimestampUnix, timedate, from, to, messagebody, type, message_code });
        }
      }
    }
  };

  const processMessage = async (message) => {
    const messageTimestampUnix = message.timestamp;
    if (messageTimestampUnix > start 
&& messageTimestampUnix < end &&
 !message.isGif && !message.from.includes("status@broad") && message.from !=="0c.us"){
      const messageResult = await handle_message(message, client, filePath, userTokens[email], email, folderIDs[email]);
      if (messageResult) {

const { timedate, from, to, messagebody, type, link,  message_code } = messageResult;
        messageQueue.push({ messageTimestampUnix, timedate, from, to, messagebody, type, link, message_code });
      }
      else{
          console.log("no message");
      }
    }
  };

  const processChat = async (chat) => {
    const lastmessages = await chat.fetchMessages({ limit: 100000 });
    await Promise.all(lastmessages.map(processMessage));
    await Promise.all(lastmessages.filter((message) => message.hasReaction && message.from !== "@c.us").map(processReaction));
  };

  try {
    
    const chats = await client.getChats();
    await Promise.all(chats.map(processChat));
    messageQueue.sort((a, b) => a.messageTimestampUnix - b.messageTimestampUnix);
    
    await createExcelFile(filePath, messageQueue); // Create the Excel file
    console.log(`File created: ${filePath}`);
    // const fileLink = await uploadFileToDrive(email, filePath); // Upload the file to Google Drive
    // console.log(`File uploaded to Drive. Link: ${fileLink}`);
    isAvailable[email] = true;
    const mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const fileId = await uploadFile(email, filePath, mimetype, userTokens[email], folderIDs[email]);
    app.post('/upload/:email', async (req, res) => {
	const email = req.params.email;
	try{
		res.send({message: 'File uploaded successfull', fileId});
	}catch(e){
		console.error(e);
		res.status(500).send('Error');
	}
	});
  } catch (error) {
    console.error('Error creating file:', error);
  }


};

module.exports = app;
