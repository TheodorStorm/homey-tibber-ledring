'use strict';

const Homey = require('homey');
const https = require('https');

class MyApp extends Homey.App {
  static tibberPrices; // Latest prices from Tibber
  static appInstance; // A static reference to the MyApp object so we can reach it easily (set in onInit)
  static tibberApiKey = 'YOUR TIBBER API KEY';

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    MyApp.appInstance = this;

    this.loadTibberPrices(function() {
      MyApp.appInstance.updateAnimation();
      setInterval(MyApp.appInstance.updateAnimation, 59 * 1000);
    });

    setInterval(this.loadTibberPrices, 17 * 60 * 1000);
  }

  /**
   * Update animation using current Tibber prices
   */
  updateAnimation() {
    if (!MyApp.tibberPrices) return;

    let priceRgb = {
      "VERY_CHEAP": [ 0, 255, 0 ],
      "CHEAP": [ 128, 255, 0 ],
      "NORMAL": [ 255, 255, 0 ],
      "EXPENSIVE": [ 255, 128, 0 ],
      "VERY_EXPENSIVE": [ 255, 0, 0 ]
    };
    const frames = [];
    const frame = [];

    // Fast forward to current time in priceInfo.today array
    let currentDate = new Date().getTime();
    // console.log(currentDate);
    // console.log(Date.parse(currentPrice.startsAt));
    let startIndex = 0;
    while (startIndex < 23 && 
      Date.parse(MyApp.tibberPrices.data.viewer.homes[0].currentSubscription.priceInfo.today[startIndex+1].startsAt) < currentDate) {
      startIndex++;
    }

    // Add colors for current hour until midnight
    for (let pixelIndex = startIndex; pixelIndex < 24; pixelIndex++) {
      let rgb = priceRgb[MyApp.tibberPrices.data.viewer.homes[0].currentSubscription.priceInfo.today[pixelIndex].level];
      let colors = {
        r: rgb[0] / (pixelIndex == startIndex ? 1 : 10), // Dim lights in the future to 10%, otherwise it's really bright
        g: rgb[1] / (pixelIndex == startIndex ? 1 : 10),
        b: rgb[2] / (pixelIndex == startIndex ? 1 : 10)
      }
      frame.push(colors);
    }

    // Add colors for next day's prices (if available) until we have 24 pixels
    if (MyApp.tibberPrices.data.viewer.homes[0].currentSubscription.priceInfo.tomorrow &&
      MyApp.tibberPrices.data.viewer.homes[0].currentSubscription.priceInfo.tomorrow.length) {
      for (let pixelIndex = frame.length; pixelIndex < 24; pixelIndex++) {
        let rgb = priceRgb[MyApp.tibberPrices.data.viewer.homes[0].currentSubscription.priceInfo.tomorrow[pixelIndex].level];
        let colors = {
          r: rgb[0] / 10,
          g: rgb[1] / 10,
          b: rgb[2] / 10
        }
        frame.push(colors);
      }
    }

    // If we don't have prices for 24 hours, add black pixels until frame contains 24 pixels
    while(frame.length < 24) frame.push({ r: 0, g: 0, b: 0 });

    // Add frame to animation
    frames.push(frame);

    // Copy the frame and tone down first pixel, so we can animate it
    let blinkFrame = frame.slice();
    blinkFrame[0] = { r: blinkFrame[0].r/10, g: blinkFrame[0].g/10, b: blinkFrame[0].b/10 };
    frames.push(blinkFrame);

    // Shift pixels two positions so first pixel is in the front center of Homey
    frame.unshift(frame.pop());
    frame.unshift(frame.pop());
    blinkFrame.unshift(blinkFrame.pop());
    blinkFrame.unshift(blinkFrame.pop());

    // Reverse frames so next hour is to the right
    frame.reverse();
    // console.log(frame);
    blinkFrame.reverse();

    // Set animation
    MyApp.appInstance.animateLedRing(frames);
  }  

  /**
   * Create LED ring animation
   */
  async animateLedRing(frames) {
    const myAnimation = await this.homey.ledring.createAnimation({
      options: {
        fps: 1, // real frames per second
        tfps: 30, // target frames per second (interpolations, higher value = smoother flashing)
        rpm: 0, // rotations per minute (0 since we don't want the ring to rotate)
      },
      frames: frames,
      priority: "INFORMATIVE" // or FEEDBACK, or CRITICAL
    });

    // register the animation with Homey
    myAnimation
      .on("start", () => {
        // The animation has started playing
      })
      .on("stop", () => {
        // The animation has stopped playing
      });

    await myAnimation.start();
  }

  /**
   * Load prices from Tibber API
   */  
  loadTibberPrices(callback) {
    let json = { "query": "{ viewer { homes { currentSubscription { priceInfo { current { level startsAt } today { level startsAt } tomorrow { level startsAt } } } } } }" };
    let options = {
      host: 'api.tibber.com',
      port: 443,
      path: '/v1-beta/gql',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MyApp.tibberApiKey
      }
    };

    let req = https.request(options, res => {
      let body = '';
      res.on('data', function(chunk){
          body += chunk;
      });
      res.on('end', function(){
          MyApp.tibberPrices = JSON.parse(body);
          if (callback) callback();
      });
    });

    req.on('error', (e) => {
      console.log(`Error: ${e.message}`);
    });

    req.write(JSON.stringify(json));
    req.end();    
  }
}

module.exports = MyApp;
