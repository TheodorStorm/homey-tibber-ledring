'use strict';

const { Device } = require('homey');

class MyDevice extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('MyDevice has been initialized');
    const deviceSettings = this.getSettings();
    const appSettings = this.homey.settings;

    let selectedHomeId = appSettings.get("selectedHomeId");
    if (selectedHomeId == this.getData().id) {
      deviceSettings.ledring = true;
    } else {
      deviceSettings.ledring = false;
    }
    this.setSettings(deviceSettings);
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
  }

}

module.exports = MyDevice;
