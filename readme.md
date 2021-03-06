# System 76 - Keyboard LEDs

Several of the System 76 devices have full support for programmable leds.  After much search I couldn't find anything that actually controlled them.

So I wrote something based on how the system76 power driver handles the Keyboard hotkeys.

# Quick and Dirty docs

You can do:
`node index` *or* `node .` to activate the program.  It should give you a quick help screen.

I personally created a quick bash script (`/usr/local/bin/kcolor`) that looks like this:
  ```bash
  #!/bin/bash
  sudo /usr/local/bin/node <where the project is located>/index.js "$@"
  ```

The reason for `sudo` is that their as a "bug" in the power firmware where when the computer goes into a shallow sleep (or anything that effects the keyboard brightness); unfortunately when it wakes up it resets the brightness; but also the color is reset when the brightness is changed.   So using sudo allows the script to change the values of keyboard at the OS level so when it changes the keyboard, the color doesn't reset to whatever your last sudo'd color was.
Issue Report: https://github.com/pop-os/system76-power/issues/202

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