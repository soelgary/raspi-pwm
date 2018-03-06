/*
The MIT License (MIT)

Copyright (c) 2014-2017 Bryan Hughes <bryan@nebri.us>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

import { Peripheral } from 'raspi-peripheral';
import { Gpio } from 'pigpio';
const p = require('physis-label');
const fs = require('fs');

export interface IConfig {
  pin?: number | string;
  frequency?: number;
}

const DEFAULT_PIN = 1;
const DEFAULT_FREQUENCY = 50;
const MAX_DUTY_CYCLE = 1000000;

const PWM0 = 'PWM0';
const PWM1 = 'PWM1';

// So there's a funky thing with PWM, where there are four PWM-capable pins,
// but only two actual PWM ports. So the standard pin contention mechanism
// doesn't _quite_ cover all cases. This object tracks which PWM peripherals are
// in use at a given time, so we can do error checking on it.
const pwmPeripheralsInUse: { [ port: string ]: boolean } = {
  [PWM0]: false,
  [PWM1]: false
};

export class PWM extends Peripheral {

  private _frequencyValue: number;
  private _dutyCycleValue: number;
  private _pwmPort: string;

  private _pwm: Gpio;

  private _policies: object;
  private _label: any;

  public get frequency() {
    return this._frequencyValue;
  }

  public get dutyCycle() {
    return this._dutyCycleValue;
  }

  public get policies() {
    return this._policies;
  }

  public get label() {
    return this._label;
  }

  constructor(policies: string, config?: number | string | IConfig) {
    let pin: number | string = DEFAULT_PIN;
    let frequency = DEFAULT_FREQUENCY;
    if (typeof config === 'number' || typeof config === 'string') {
      pin = config;
    } else if (typeof config === 'object') {
      if (typeof config.pin === 'number' || typeof config.pin === 'string') {
        pin = config.pin;
      }
      if (typeof config.frequency === 'number') {
        frequency = config.frequency;
      }
    }
    super(pin);

    // Pin details from http://elinux.org/RPi_BCM2835_GPIOs
    let gpioPin: number;
    let mode: number;
    switch (this.pins[0]) {
      case 26: // GPIO12 PWM0 ALT0
        gpioPin = 12;
        mode = Gpio.ALT0;
        this._pwmPort = PWM0;
        break;
      case 1: // GPIO18 PWM0 ALT5
        gpioPin = 18;
        mode = Gpio.ALT5;
        this._pwmPort = PWM0;
        break;
      case 23: // GPIO13 PWM1 ALT0
        gpioPin = 13;
        mode = Gpio.ALT0;
        this._pwmPort = PWM1;
        break;
      case 24: // GPIO19 PWM1 ALT5
        gpioPin = 19;
        mode = Gpio.ALT5;
        this._pwmPort = PWM1;
        break;
      default:
        throw new Error(`Pin ${pin} does not support hardware PWM`);
    }

    if (pwmPeripheralsInUse[this._pwmPort]) {
      throw new Error(`${this._pwmPort} is already in use and cannot be used again`);
    }
    pwmPeripheralsInUse[this._pwmPort] = true;

    this._frequencyValue = frequency;
    this._dutyCycleValue = 0;
    this._pwm = new Gpio(gpioPin, { mode });

    this._policies = JSON.parse(fs.readFileSync(policies, 'utf-8'));
    this._label = "pin-" + gpioPin;
  }

  public destroy() {
    pwmPeripheralsInUse[this._pwmPort] = false;
    super.destroy();
  }

  public write(dutyCycle: number | any) {
    console.log("We got a label..." + this._label);
    var dc;
    if (p.label.Labeled.prototype.isPrototypeOf(dutyCycle)) {
      console.log("writing a labeled value");
      const lab = dutyCycle.getLabel();
      console.log(lab);
      if (!lab.canFlowTo(this._label, this._policies)) {
        throw new Error("Invalid flow");
      }
      dc = dutyCycle.getValue();
    } else {
      console.log("not writing a labeled value");
      dc = dutyCycle;
    }
    if (!this.alive) {
      throw new Error('Attempted to write to a destroyed peripheral');
    }
    if (typeof dc !== 'number' || dc < 0 || dc > 1) {
      throw new Error(`Invalid PWM duty cycle ${dc}`);
    }
    this._dutyCycleValue = dc;
    this._pwm.hardwarePwmWrite(this._frequencyValue, Math.round(this._dutyCycleValue * MAX_DUTY_CYCLE));
    this.emit('change', this._dutyCycleValue);
  }
}
