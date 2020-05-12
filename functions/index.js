const functions = require('firebase-functions');
const express = require('express');
const BlueLinky = require('bluelinky');
const bodyParser = require('body-parser');
const got = require('got');
const MyQ = require('myq-api');

const config = functions.config();
const account = new MyQ(config.myq.username, config.myq.password);

const PLATE_DETECTION_URL = config.plate.url;
const MY_PLATE = config.plate.value;

const app = express();
app.use(bodyParser.json());

let vehicle;
let door;

const middleWare = (req, res, next) => {
  const ip = req.headers['x-forwarded-for'];

  if(req.body.VALIDATION_KEY !== config.bluelink.validation_key){
    console.log('Bad key used by', ip);
    return res.send({ error: 'something went wrong' });
  }

  const client = new BlueLinky({ 
    username: config.bluelink.username, 
    password: config.bluelink.password,
    pin: config.bluelink.pin,
    region: 'US'
  });

  client.on('ready', async () => {
    await account.login();

    const response = await account.getDevices([17]);
    door = response.devices[0];

    vehicle = client.getVehicle(config.bluelink.vin);
    console.log(vehicle.name);     
    return next();
  });

}

app.use(middleWare);

const getVehicle = async () => {
  const response = await got(PLATE_DETECTION_URL);
  const data = JSON.parse(response.body);

  // this might not be ideal as the opencv sometimes has issues
  // going to observe the failure rate here
  const hasMyCar = data.plates.find(item => item.plate === MY_PLATE);
  
  if (data.detected && hasMyCar){
    return Promise.resolve(true);
  }

  return Promise.resolve(false);
}

app.post('/start', async (req, res) => {
  let response;
  try {
    const hasCar = await getVehicle();
    
    if (hasCar) {
      console.log('My car was detected, opening door');
      await account.setDoorState(door.id, 1);
    }

    response = await vehicle.start({
      airCtrl: true,
      igniOnDuration: 10,
      airTempvalue: 70
    });

  } catch (e) {
    response = {
      error: e.message
    };
  }
  res.send(response);
});

app.post('/lock', async (req, res) => {
  let response;
  try {
    response = await vehicle.lock();
  } catch (e) {
    console.log(e);
    response = {
      error: e.message
    };
  }
  res.send(response);
});

app.post('/status', async (req, res) => {
  let response;
  try {
    response = await vehicle.status();
  } catch (e) {
    console.log(e);
    response = {
      error: e.message
    };
  }
  res.send(response);
});

exports.app = functions.https.onRequest(app);
