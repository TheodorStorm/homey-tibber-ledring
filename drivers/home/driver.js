'use strict';

const { Driver } = require('homey');

class MyDriver extends Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('MyDriver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    let deviceArray = [];
    let tibberData = this.homey.settings.get('tibberData');

    if (tibberData && 
      tibberData.data && 
      tibberData.data.viewer && 
      tibberData.data.viewer.homes) {
      for(let home of tibberData.data.viewer.homes) {
        if (home.currentSubscription) {
          deviceArray.push({
            name: home.appNickname,
            data: {
              id: home.id
            }
          });
        }
      }
    }

    return deviceArray;
  }

}

module.exports = MyDriver;
