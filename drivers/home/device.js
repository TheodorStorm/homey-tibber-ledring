'use strict';

const { Device } = require('homey');

class MyDevice extends Device {
  updateTimer;
  lastSync = 0;
  lastWatt = 0;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('MyDevice has been initialized');

    if (!this.hasCapability('measure_cost')) await this.addCapability('measure_cost');
    if (!this.hasCapability('base_rate')) await this.addCapability('base_rate');
    if (!this.hasCapability('meter_power')) await this.addCapability('meter_power');
    if (!this.hasCapability('measure_power_usage')) await this.addCapability('measure_power_usage');
    if (!this.hasCapability('measure_power_excess')) await this.addCapability('measure_power_excess');
    if (this.hasCapability('onoff')) await this.removeCapability('onoff');
    if (this.hasCapability('price_level')) await this.removeCapability('price_level');
    if (this.hasCapability('measure_power')) await this.removeCapability('measure_power');
    if (this.hasCapability('measure_power_use')) await this.removeCapability('measure_power_use');

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
          const watt = report.totalConsumed.W || 0;
          const gen = report.totalGenerated.W || 0;
          const kw = (watt-gen)/1000;
          
          this.setCapabilityValue('measure_power_usage', Math.round(watt));
          this.setCapabilityValue('measure_power_excess', Math.max(0, Math.round(gen-watt)));
          this.setCapabilityValue('measure_cost', Math.round(total_cost * kw * 100)/100);

          let now = new Date().getTime(); // milliseconds

          if (this.lastSync>0) {
            let meter_power = this.getStoreValue('meter_power') || 0;
            let last_day = this.getStoreValue('last_day') || 0;
            let current_day = new Date().getDate(); // Date of month
            if (current_day != last_day) {
              meter_power = 0;
              this.setStoreValue('last_day', current_day);
            }

            const power_add = ((watt + this.lastWatt) / 2000) * ((now - this.lastSync) / (1000 * 60 * 60) );
            meter_power += power_add;
            this.setStoreValue('meter_power', meter_power);
            this.setCapabilityValue('meter_power', Math.round((meter_power) * 100)/100).catch(this.error);
          }

          //console.log(total_cost);
          //console.log(kw);

          this.lastWatt = watt;
          this.lastSync = now;
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

    if (newSettings.base_rate) {
      this.setCapabilityValue('base_rate', newSettings.base_rate);
    }
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
