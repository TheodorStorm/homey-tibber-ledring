'use strict';

const { Device } = require('homey');

class MyDevice extends Device {
  updateTimer;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('MyDevice has been initialized');

    if (!this.hasCapability('measure_cost')) await this.addCapability('measure_cost');
    if (!this.hasCapability('base_rate')) await this.addCapability('base_rate');
    if (this.hasCapability('meter_power')) await this.removeCapability('meter_power');
    if (this.hasCapability('measure_power')) await this.removeCapability('measure_power');
    if (this.hasCapability('onoff')) await this.removeCapability('onoff');
    if (this.hasCapability('price_level')) await this.removeCapability('price_level');

    const deviceSettings = this.getSettings();
    const appSettings = this.homey.settings;
    let selectedHomeId = appSettings.get("selectedHomeId");
    if (selectedHomeId == this.getData().id) {
      deviceSettings.ledring = true;
    } else {
      deviceSettings.ledring = false;
    }
    this.setSettings(deviceSettings);

    if (!this.getCapabilityValue('base_rate')) await this.setCapabilityValue('base_rate', this.getSetting('base_rate'));

    this.registerCapabilityListener("base_rate", async (value) => {
      this.setSettings({ "base_rate": value });
    });

    this.update();
    this.updateTimer = this.homey.setInterval(() => {
      this.update();
    }, 7000);  
  }

  async update() {
    const allDevices = await this.homey.app.api.devices.getDevices();
    const report = await this.homey.app.api.energy.getLiveReport();
    const prices = this.homey.settings.get('tibberData');
    const base_rate = this.getSetting('base_rate');

    if (!base_rate || !report) return;

    if (prices && prices.data && prices.data.viewer && prices.data.viewer.homes) {
      for (const home of prices.data.viewer.homes) {
        if (home.id == this.getData().id) {
          //console.log(base_rate);
          //console.log(home.currentSubscription);
          //console.log(report);

          const total_cost = base_rate + home.currentSubscription.priceInfo.current.total;
          const watt = report.totalConsumed.W;
          const gen = report.totalGenerated.W;
          const kw = (watt-gen)/1000;
          
          if (kw > 0) {
            this.setCapabilityValue('measure_cost', Math.round(total_cost * kw * 100)/100);            
          } else {
            this.setCapabilityValue('measure_cost', Math.round(home.currentSubscription.priceInfo.current.energy * kw * 100)/100);
          }

          //console.log(total_cost);
          //console.log(kw);

        }
      }
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('MyDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('MyDevice settings where changed');
    const appSettings = this.homey.settings;

    if (newSettings.ledring) {
      appSettings.set("selectedHomeId", this.getData().id);
    } else if (appSettings.get("selectedHomeId") == this.getData().id) {
      appSettings.set("selectedHomeId", null);
    }

    this.setCapabilityValue('base_rate', newSettings.base_rate.value);
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('MyDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('MyDevice has been deleted');
    this.homey.clearInterval(this.updateTimer);
  }

}

module.exports = MyDevice;
