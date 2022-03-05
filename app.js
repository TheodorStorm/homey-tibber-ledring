'use strict';

const Homey = require('homey');
const { HomeyAPIApp } = require('homey-api');
const https = require('https');

class MyApp extends Homey.App {
  static tibberPrices; // Latest prices from Tibber
  static appInstance; // A static reference to the MyApp object so we can reach it easily (set in onInit)
  static updateAnimationTimer;
  static loadTibberPricesTimer;

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    MyApp.appInstance = this;

    this.homey.settings.on('set', function(key) {
      switch (key) {
        case 'selectedHomeId':
        case 'tibberApiKey':
          MyApp.appInstance.initTibber();
          break;
        default:
          break;
      }
    });
    this.initTibber();

    this.api = new HomeyAPIApp({ homey: this.homey });
  }

  initTibber() {
    if (MyApp.loadTibberPricesTimer) clearInterval(MyApp.loadTibberPricesTimer);
    if (MyApp.updateAnimationTimer) clearInterval(MyApp.updateAnimationTimer);

    if (this.homey.settings.get('tibberApiKey')) {
      this.loadTibberPrices(function(data) {
        MyApp.appInstance.updateAnimation();
        MyApp.updateAnimationTimer = setInterval(MyApp.appInstance.updateAnimation, 59 * 1000);
      });

      MyApp.loadTibberPricesTimer = setInterval(this.loadTibberPrices, 17 * 60 * 1000);
    }
  }

  /**
   * Update animation using current Tibber prices
   */
  async updateAnimation() {
    let selectedHomeId = MyApp.appInstance.homey.settings.get('selectedHomeId');
    let selectedHome = null;

    if (selectedHomeId && MyApp.tibberPrices && MyApp.tibberPrices.data) {
      for (const home of MyApp.tibberPrices.data.viewer.homes) {
        if (home.id == selectedHomeId) selectedHome = home;
      }
    }

    if (!MyApp.tibberPrices || !MyApp.tibberPrices.data || !selectedHome) {
      if (this.ledRingAnimation) {
        await this.ledRingAnimation.stop();
        this.ledRingAnimation = null;
      }
      return;
    }

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
    let startHour = 0;
    while (startHour < 23 && 
      Date.parse(selectedHome.currentSubscription.priceInfo.today[startHour+1].startsAt) < currentDate) {
        startHour++;
    }

    // Add colors for current day
    for (let pixelIndex = 0; pixelIndex < selectedHome.currentSubscription.priceInfo.today.length; pixelIndex++) {
      let rgb = priceRgb[selectedHome.currentSubscription.priceInfo.today[pixelIndex].level];
      let colors = {
        r: Math.round(rgb[0] / (pixelIndex == startHour ? 1 : 10)),
        g: Math.round(rgb[1] / (pixelIndex == startHour ? 1 : 10)),
        b: Math.round(rgb[2] / (pixelIndex == startHour ? 1 : 10))
      }
      frame.push(colors);
    }

    // Add colors for next day's prices (if available)
    if (selectedHome.currentSubscription.priceInfo.tomorrow &&
      selectedHome.currentSubscription.priceInfo.tomorrow.length) {
      for (let pixelIndex = 0; pixelIndex < selectedHome.currentSubscription.priceInfo.tomorrow.length; pixelIndex++) {
        let rgb = priceRgb[selectedHome.currentSubscription.priceInfo.tomorrow[pixelIndex].level];
        let colors = {
          r: rgb[0] / 10,
          g: rgb[1] / 10,
          b: rgb[2] / 10
        }
        frame.push(colors);
      }
    }

    // Keep max 11 hours of history
    while(startHour > 11) {
      startHour--;
      frame.shift();
    }

    // If we don't have prices for 24 hours, add black pixels until frame contains 24 pixels
    while(frame.length < 24) frame.push({ r: 0, g: 0, b: 0 });

    // If we have more than 24 hours, remove some
    while(frame.length > 24) frame.pop();

    // Finally, shift until current hour is the first element
    for (let i = 0; i < startHour; i++) frame.push(frame.shift());

    // console.log(startHour);
    // console.log(frame);

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

  ledRingAnimation;

  /**
   * Create LED ring animation
   */
  async animateLedRing(frames) {
    if (!this.ledRingAnimation) {
      this.ledRingAnimation = await this.homey.ledring.createAnimation({
        options: {
          fps: 1, // real frames per second
          tfps: 60, // target frames per second (interpolations, higher value = smoother flashing)
          rpm: 0, // rotations per minute (0 since we don't want the ring to rotate)
        },
        frames: frames,
        priority: "INFORMATIVE" // or FEEDBACK, or CRITICAL
      });

      // register the animation with Homey
      this.ledRingAnimation
        .on("start", () => {
          // The animation has started playing
        })
        .on("stop", () => {
          // The animation has stopped playing
        });

      await this.ledRingAnimation.start();
    } else {
      this.ledRingAnimation.updateFrames(frames);
    }
  }

  /**
   * Load prices from Tibber API
   */  
  loadTibberPrices(callback) {
    let json = { "query": "{ viewer { homes { id appNickname address { address1 city } currentSubscription { priceInfo { current { energy total level startsAt } today { energy total level startsAt } tomorrow { energy total level startsAt } } } } } }" };
    let options = {
      host: 'api.tibber.com',
      port: 443,
      path: '/v1-beta/gql',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + MyApp.appInstance.homey.settings.get('tibberApiKey')
      }
    };

    let req = https.request(options, res => {
      let body = '';
      res.on('data', function(chunk){
          body += chunk;
      });
      res.on('end', function(){
          MyApp.tibberPrices = JSON.parse(body);
          //console.log(body);
          MyApp.appInstance.homey.settings.set('tibberData', MyApp.tibberPrices);
          if (callback) callback(MyApp.tibberPrices);
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
