# System 76 - Keyboard LEDs

Several of the System 76 devices have full support for programmable leds.  After much search I couldn't find anything that actually controlled them.

So I wrote something based on how the system76 power driver handles the Keyboard hotkeys.

# Quick and Dirty docs

You can do:
`node index` *or* `node .` to activate the program.  It should give you a quick help screen.

Do to usb/hid devices being protected from most users to change anything you either need to "sudo" it or create some udev rules allowing everyone read/write access to the devices.

I personally created a udev rules so I don't need to run sudo.
File: `/etc/udev/rules/50-keyboard.rules`

Contents:
```
KERNEL=="usb", ATTRS{idVendor}=="048d", MODE="0666"
KERNEL=="hidraw*", ATTRS{idVendor}=="048d", MODE="0666"
```

## CLI samples:
- node . 00FF00  (or kcolor 00FF00)  
  will change the color to green.
- node . -r #0000FF
  will rotate the keyboard in blue.
- node . -f -count 5
    Will flash the keyboard 5 times

- node . -server
  Will enable it as a server on port (7567), meaning you can
  control the colors via an HTTP api.
  Line 435-440 actually contains the "validation", by default it doesn't allow remote connections unless they match a couple things.  TODO: a real auth layer -- but at this point it keeps my kids from messing with me.  :-)
  Line 452 are the URL end points (basically the same commands as the CLI)
  You can change the port you want to use by -port <port>
  
- 