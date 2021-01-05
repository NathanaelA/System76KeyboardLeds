'use strict';

// ESC = Key 0, Del = 15, Home = 16 - PgDn = 19
// 20 = No Key
// 21 - 31 = No Key
// 32 - 43 = Row 2 ( ~ thru - )
// 44 = No Key
// 45 = +
// 46 - 47 = Backspace
// 48 - 51 = Keypad: NumLk, /, * * -
// 64 - 78 = Row 3 (Tab - |)
// 79 - No Key
// 80 - 82 = Keypad: 7/8/9
// 83, 115 = Keypad "+"
// 84 - 95 = No Key
// 96 - 108 = Row 4 (Caps - ')
// 109 = No Key
// 110 - 111 = Enter Key
// 112 - 114 = Keypad 4/5/6
// 129 = No Key
// 128, 130 = Row 5: L Shift
// 131 - 140 = Row 5: Z - ?
// 141 - 142 = Row 5: R Shift
// 143 - 146 = Up/1/2/3
// 147, 179 = Enter
// 148 - 159 = No Key
// 160 - 161 = Row 6: L Ctrl
// 162 - 164 = Fn/Super/Alt
// 165, 166, 168, 169 = Space
// 167 = No Key
// 170 - 178 = Row 6: R Alt - Del

const HID = require('node-hid');
const FS = require('fs');
const child = require("child_process");
const http = require("http");

const VENDOR_ID = 0x048d;
const LIGHTING_ID = 0x8297;
const KEYBOARD_ID = 0x8910;

let PORT = 7567;

function getDevice(vendor, product) {
    const devices_found = HID.devices(vendor, product);

    if (devices_found.length === 0) {
        console.log("No devices found");
        return null;
    }

    let hidDevice;
    try {
        hidDevice = new HID.HID(vendor, product);
    } catch (err) {
        console.error(err);
        return null;
    }
    hidDevice.on('error', function(error) {
        console.error("Device:", product, "error:", error);
    } );

    return hidDevice;
}

function sendCommand(device, ...featureReport) {
    return device.sendFeatureReport(featureReport);
}

function parseColor(color) {
    if (color == null) {
        return {r: 0, g: 0, b: 0, bright: 255, error: 1};
    }
    if (color.startsWith("#")) {
        color = color.substr(1);
    }
    switch (color.toLowerCase()) {
        case 'blue':  return {r: 0, g: 0, b: 255, bright: 255};
        case 'red':   return {r: 255, g: 0, b: 0, bright: 255};
        case 'green': return {r: 0, g: 255, b: 0, bright: 255};

        case 'cyan':   return {r: 0, g: 255, b: 255, bright: 255};
        case 'yellow': return {r: 255, g: 255, b: 0, bright: 255};
        case 'pink':   return {r: 255, g: 0, b: 255, bright: 255};

        case 'teal': return {r: 0, g: 128, b: 256, bright: 255};
        case 'orange': return {r: 255, g: 128, b: 0, bright: 255};
        case 'purple': return {r: 128, g: 0, b: 255, bright: 255};
        case 'off': return {r: 0, g:0, b: 0, bright: 0};
    }
    if (color.length === 3) {
        color = "FF" + color[0]+color[0] + color[1]+color[1] + color[2] + color[2];
    } else if (color.length === 6) {
        color = "FF"+color;
    } else if (color.length !== 8) {
        return {r: 255, g:255, b:255, bright: 255, error: 1};
    }

    const c = parseInt(color, 16);
    let b = c & 255;
    let r = (c >> 16) & 255;
    let g = (c >> 8) & 255;
    let bright = (c >> 24) & 255;
    return {r, g, b, bright}
}

function resetSystemColor(color) {
    if (process.getuid() !== 0) {
        console.log("Not root, not allowed to set system configurations");
        return;
    }
    // TODO: Verify Path, this is the new System76 path
    const path = "/sys/class/leds/system76_acpi::kbd_backlight/color";
    let r = color.r.toString(16);
    let g = color.g.toString(16);
    let b = color.b.toString(16);
    if (r.length === 0) r = "00";
    else if (r.length === 1) r = "0" + r;
    if (g.length === 0) g = "00";
    else if (g.length === 1) g = "0" + g;
    if (b.length === 0) b = "00";
    else if (b.length === 1) b = "0" + b;

    let newColor = r + g + b;
    try {
        // Set color
        child.exec("echo "+newColor+">"+path);

        // Reset Brightness to max
        child.exec("cat /sys/class/leds/system76_acpi::kbd_backlight/max_brightness > /sys/class/leds/system76_acpi::kbd_backlight/brightness");
    } catch (e) {
        console.log("Failed to write /color");
    }
}

function getKeyColorRGB(keyDevice, key) {
    // TODO: Actually get the current key's color
    return {r: 0, g: 255, b: 255, bright: 255};
}

function setLightColorRGB(hidDevice, r,g,b, brightness= 255) {
    if (r < 0 || r > 255) { r = 255; }
    if (g < 0 || g > 255) { g = 255; }
    if (b < 0 || b > 255) { b = 255; }
    sendCommand(hidDevice, 0xCC, 0xB0, 0x00, 0x00, r, g, b, 0);

    // Format Brightness value for Lighting
    if (brightness > 255 || brightness < 0) { brightness = 255; }
    const raw_brightness = parseInt(((brightness * 4) + 254) / 255, 10);
    sendCommand(hidDevice, 0xCC, 0xBF, raw_brightness, 0);
}

function setKeyColorRGB(keyDevice, r,g,b, brightness= 255, key= -1, keyEnd=-1) {
    if (r < 0 || r > 255) { r = 255; }
    if (g < 0 || g > 255) { g = 255; }
    if (b < 0 || b > 255) { b = 255; }

    if (key === -1) {
        // Full Keyboard mode
        // Valid Key Ranges (Start,Stop)
        let ranges = [0, 19, 32, 51, 64, 83, 96, 115, 128, 147, 160, 179];

        for (let j = 0; j < ranges.length; j += 2) {
            for (let i = ranges[j], end = ranges[j + 1]; i <= end; i++) {
                sendCommand(keyDevice, 0xCC, 0x01, i, r, g, b, 0);
            }
        }
    } else if (key === -3) {
        // Keypad Mode
        let ranges = [16,19, 48,51, 79,83, 112,115, 144,147, 177,179];

        for (let j = 0; j < ranges.length; j += 2) {
            for (let i = ranges[j], end = ranges[j + 1]; i <= end; i++) {
                sendCommand(keyDevice, 0xCC, 0x01, i, r, g, b, 0);
            }
        }
    } else if (key === -4) {
        // Keypad Mode
        let ranges = [143,143, 174,176];

        for (let j = 0; j < ranges.length; j += 2) {
            for (let i = ranges[j], end = ranges[j + 1]; i <= end; i++) {
                sendCommand(keyDevice, 0xCC, 0x01, i, r, g, b, 0);
            }
        }

    } else if (key === -2) {
        // Keys 180 - 255 do Nothing, but we hit key ranges that are not valid in here
        // Hence the key=-1 uses groups of ranges so we don't waste time, this is left for testing
        for (let i = 0; i < 180; i++) {
            sendCommand(keyDevice, 0xCC, 0x01, i, r, g, b, 0);
        }
    } else if (keyEnd > -1 && keyEnd < 256 && keyEnd > key) {
        for (let i = key; i <= keyEnd; i++) {
            sendCommand(keyDevice, 0xCC, 0x01, i, r, g, b, 0);
        }
    } else if (key < 256) {
        sendCommand(keyDevice, 0xCC, 0x01, key, r, g, b, 0);
    } else {
        console.error("Key must be -1 (All) to 255");
        return;
    }

    if (brightness != null) {
        if (brightness < 0 || brightness > 255) {
            brightness = 255;
        }
        let raw_brightness = parseInt(((brightness * 10) + 254) / 255, 10);  // (0-255)value * 10 + 254 / 255
        sendCommand(keyDevice, 0xCC, 0x09, raw_brightness, 0);
    }

    // Disable boot function???
    sendCommand(keyDevice, 0xCC, 0x20, 0x01, 0);
}

function setKeyBrightness(keyDevice, brightness= 255) {
    if (brightness < 0 || brightness > 255) { brightness = 255; }
    let raw_brightness = parseInt(((brightness * 10) + 254) / 255, 10);  // (0-255)value * 10 + 254 / 255
    sendCommand(keyDevice,  0xCC, 0x09, raw_brightness, 0);
}


let choosenKey = -1, changeLighting, changeKeypad, changeArrows, changeKeyboard, doSomething=false, specialMode, repeat=3, writeOS=false, startServer=false;

for (let i=2;i<process.argv.length;i++) {
    switch (process.argv[i].toLowerCase()) {
        case '-port':
        case '/port':
            i++;
            doSomething=true;
            PORT = parseInt(process.argv[i],10);
            if (PORT < 1 || PORT > 65535) { PORT = 7567; }
            startServer = true;
            break;

        case '/server':
        case '-server':
            startServer = true;
            doSomething = true;
            break;

        case '-help':
        case '/?':
        case '-?':
        case '/help':
            do_help();
            break

        case '/kp':
        case '-kp':
        case '-keypad':
        case '/keypad':
            i++;
            doSomething = true;
            changeKeypad = parseColor(process.argv[i]);
            if (changeKeypad.error) {
                console.log("You need to pass a valid color");
                process.exit(1);
            }
            break;

        case '/ar':
        case '-ar':
        case '-arrow':
        case '/arrow':
        case '-arrows':
        case '/arrows':
            i++;
            doSomething = true;
            changeArrows = parseColor(process.argv[i]);
            if (changeArrows.error) {
                console.log("You need to pass a valid color");
                process.exit(1);
            }
            break;

        case '/a':
        case '-a':
        case '/all':
        case '-all':
            i++;
            doSomething = true;
            writeOS = true;
            changeLighting = parseColor(process.argv[i]);
            if (changeLighting.error) {
                console.log("You need to pass a valid color");
                process.exit(1);
            }
            changeKeyboard = changeLighting;

            break;

        case '-l':
        case '-light':
        case '-lighting':
        case '/l':
        case '/light':
        case '/lighting':
            i++;
            doSomething = true;
            changeLighting = parseColor(process.argv[i]);
            if (changeLighting.error) {
                console.log("You need to pass a valid color");
                process.exit(1);
            }
            break;

        case '-key':
        case '/key':
            i++;
            choosenKey = parseInt(process.argv[i], 10);
            break;

        case '-f':
        case '/f':
        case '-flash':
        case '/flash':
            doSomething = true;
            specialMode = 1;
            break;

        case '-k':
        case '/k':
        case '-keyboard':
        case '/keyboard':
            i++;
            doSomething = true;
            changeKeyboard = parseColor(process.argv[i]);
            if (changeKeyboard.error) {
                console.log("You need to pass a valid color");
                process.exit(1);
            }
            break;

        case '-p':
        case '/p':
        case '-pulse':
        case '/pulse':
            i++;
            doSomething = true;
            specialMode = 1;
            changeKeyboard = parseColor(process.argv[i]);
            if (changeKeyboard.error) {
                console.log("You need to pass a valid color");
                process.exit(1);
            }
            break;

        case '/runner':
        case '-runner':
            i++;
            specialMode =3;
            doSomething = true;
            changeKeyboard = parseColor(process.argv[i]);
            if (changeKeyboard.error) {
                console.log("You need to pass a valid color");
                process.exit(1);
            }
            break;


        case '-r':
        case '/r':
        case '/rotate':
        case '-rotate':
            i++;
            specialMode = 2;
            doSomething = true;
            changeKeyboard = parseColor(process.argv[i]);
            if (changeKeyboard.error) {
                console.log("You need to pass a valid color");
                process.exit(1);
            }
            break;

        case '-c':
        case '/c':
        case '-count':
        case '/count':
            i++;
            repeat = parseInt(process.argv[i], 10);
            if (repeat < 0) { repeat = 1; }
            break;

        default:
            let color = parseColor(process.argv[i]);
            if (!color.error) {
                changeKeyboard = color;
                doSomething = true;
            }
    }

}

if (changeLighting) {
    handleLighting(changeLighting);
}

if (changeKeyboard) {
    handleKeyboard(changeKeyboard, choosenKey, specialMode, repeat);

    if (writeOS && choosenKey === -1) {
        resetSystemColor(changeKeyboard);
    }

} else if (specialMode) {
    handleFlash(specialMode, repeat);
}

if (changeKeypad) {
    handleKeyboard(changeKeypad, -3, 0, 0);
}

if (changeArrows) {
    handleKeyboard(changeArrows, -4, 0, 0);
}
if (startServer) {
    const server = http.createServer()

    server.listen(PORT, error => {
        if (error) {
            return console.error(error)
        }

        console.log(`KColor Server listening on port http://127.0.0.1:${PORT}`);
    });
    server.on("request", (request, response) => {
        let { method, url, headers } = request;
        if (method === "GET") {
            let options='';
            if (url.indexOf("?") > 0) {
                options = serverParseOptions(url.substr(url.indexOf("?")+1).split("&"));
                url = url.substr(0, url.indexOf("?"));
            }
            let valid = false;
            // console.log(request.connection.remoteAddress);
            // console.log(headers);
            if (headers['user-agent'].indexOf("SM-G960U1") > 1) { valid = true; }
            if (headers['user-agent'].indexOf("(X11; Linux x86_64") > 1) { valid = true; }
            if (request.connection.remoteAddress.indexOf("172.16.") >= 0) { valid = true; }
            if (request.connection.remoteAddress.indexOf("127.0.") >= 0) { valid = true; }

            if (!valid) {
                response.statusCode = 404
                response.setHeader("Content-Type", "text/plain");
                response.write("No Access");
                response.end();
                return;
            }

            switch (url.toUpperCase()) {
                case '/FAVICON.ICO': return serverWriteHelp(response);  break;

                case '/KEYBOARD': serverKeyboard(options, 0); serverWriteOK(response); break;
                case '/PULSE':    serverKeyboard(options, 1); serverWriteOK(response); break;
                case '/ROTATE':   serverKeyboard(options, 2); serverWriteOK(response); break;
                case '/RUNNING':  serverKeyboard(options, 3); serverWriteOK(response); break;
                case '/LIGHTING': serverLighting(options); serverWriteOK(response); break;
                case '/FLASH':    serverFlash(options); serverWriteOK(response); break;
                case '/MOM':      serverKeyboard({color: "yellow"}, 1); serverWriteOK(response); break;
                case '/EXIT': serverWriteOK(response); process.exit(0); break;
                default:
                    console.log(url, options);
                    return serverWriteHelp(response);
            }
        } else {
            // We don't do anything with other methods yet
            return serverWriteHelp(response);
        }
    })
}

function serverKeyboard(options, specialMode=0) {
    let {key=-1, times=3, color="cyan" } = options;
    color = parseColor(color);
    console.log("Server Keyboard", key, times, color);
    handleKeyboard(color, key, specialMode, times);
}

function serverFlash(options) {
    let { times=3 } = options;
    handleFlash(1, times);
}

function serverLighting(options) {
    let { color="cyan" } = options;
    handleLighting(parseColor(color));
}

function serverParseOptions(optionString) {
    const options = {};
    for (let i=0;i<optionString.length;i++) {
        let temp = optionString[i].split("=");
        if (temp.length === 1) {
            options[temp[0]] = true;
        } else {
            options[temp[0]] = temp[1];
        }
    }
    return options;
}

function serverWriteHelp(response) {
    response.statusCode = 200
    response.setHeader("Content-Type", "text/html");
    response.write("<html><head><body><ul><li>/KEYBOARD<li>/ROTATE<li>/LIGHTING<li>/RUNNING<li>/FLASH</ul></body></html>");
    response.end();

}

function serverWriteOK(response) {
    response.statusCode = 200
    response.setHeader("Content-Type", "text/plain");
    response.write("OK");
    response.end();
}

if (!doSomething) {
    do_help();
}

function handleLighting(color) {
    const hidDevice = getDevice(VENDOR_ID, LIGHTING_ID);
    if (hidDevice) {
        setLightColorRGB(hidDevice, color.r, color.g, color.b, color.bright);
        hidDevice.close();
    }
}

function _pulse(device, color) {
    let direction=0, curBright=color.bright;
    return new Promise((resolve) => {
        let iv = setInterval(() => {
            if (direction === 0) {
                curBright -= 25;
                if (curBright <= 0) { curBright = 0; direction=1;}
            } else if (direction === 1) {
                curBright += 25;
                if (curBright >= 255) {
                    curBright = 255;
                    direction = 2;
                }
            } else if (direction === 2) {
                curBright -= 25;
                if (curBright <= color.bright) {
                    curBright = color.bright;
                    direction = 3;
                }
            }

            setKeyBrightness(device, curBright);
            if (direction === 3) {
                clearTimeout(iv);
                resolve();
            }
        }, 50);
    });
}

function pulseKeyboard(device, times, color) {
        if (color != null && typeof color.r !== 'undefined') {
            setKeyColorRGB(device, color.r, color.g, color.b, color.bright, -1);
        } else {
            color = {bright: 255};
        }
        return new Promise(async (resolve) => {
            for (let count=0;count < times;count++) {
                await _pulse(device, color);
            }
            resolve();
        });
    }

function _rotate(device, color, key) {
    let direction=0, colorSet=0, curColor=color.r, properColor=color.r;
    let r=color.r, g=color.g, b=color.b;
    return new Promise((resolve) => {
        let iv = setInterval(() => {
            if (direction === 0) {
                curColor -= 25;
                if (curColor <= 0) { curColor = 0; direction=1;}
            } else if (direction === 1) {
                curColor += 25;
                if (curColor >= 255) {
                    curColor = 255;
                    direction = 2;
                }
            } else if (direction === 2) {
                curColor -= 25;
                if (curColor <= properColor) {
                    curColor = properColor;
                    colorSet++;
                    switch (colorSet) {
                        case 0: // Invalid (but should be R)
                        case 1: // Switch to G
                            r = properColor;
                            curColor = color.g;
                            properColor = color.g;
                            direction = 0;
                            break;
                        case 2: // Switch to B
                            g = properColor;
                            curColor = color.b;
                            properColor = color.b;
                            direction = 0;
                            break;
                        case 3:
                            b = properColor;
                            direction = 3;
                            break;
                    }
                }
            }

            switch (colorSet) {
                case 0: r = curColor; break;
                case 1: g = curColor; break;
                case 2: b = curColor; break;
            }
            setKeyColorRGB(device, r, g, b, color.bright, key);

            if (direction === 3) {
                clearTimeout(iv);
                resolve();
            }
        }, 50);
    });
}

function rotateKeyboard(device, times, color, key) {
    setKeyColorRGB(device, color.r, color.g, color.g, color.bright, key);
    return new Promise(async (resolve) => {
        for (let count=0;count < times;count++) {
            await _rotate(device, color, key);
        }
        resolve();
    });
}

function _runner(device, colors, count=3) {
    return new Promise((resolve) => {
        const keyboard = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,51,83,115,147,
            179,178,177,176,175,174,[173,172],171,170, [169, 168], [166, 165],164,163,162,[161,160],[128,130],[96,97], [64,65], 32];
        let key = 0, steps=[], keys=[], len = colors.length, done=0, times=0, reset=0;
        for (let i=0;i<len;i++) {
            steps.push(0-i);
            keys.push(i);
        }
        let iv = setInterval(() => {
            for (let i=0;i<len;i++) {

                if (steps[i] > 0 && keys[i] > -1) {
                    if (Array.isArray(keyboard[keys[i]])) {
                        setKeyColorRGB(device, colors[steps[i]].r, colors[steps[i]].g, colors[steps[i]].b, null, keyboard[keys[i]][0]);
                        setKeyColorRGB(device, colors[steps[i]].r, colors[steps[i]].g, colors[steps[i]].b, null, keyboard[keys[i]][1]);
                    } else {
                        setKeyColorRGB(device, colors[steps[i]].r, colors[steps[i]].g, colors[steps[i]].b, null, keyboard[keys[i]]);
                    }
                }
                // Step the next color cycle
                steps[i]++;
                // Have we finished all the color cycles for this key

                if (steps[i] >= len) {
                    steps[i] = 0;
                    keys[i] += len;

                    if (keys[i] >= keyboard.length) {
                        if (times < count-1) {
                            keys[i] = reset++;
                            if (reset >= len) { times++; reset=0; }
                        } else {
                            keys[i] = -1;
                            done++;
                        }
                    }
                }
            }

            if (done >= len) {
                clearTimeout(iv);
                resolve();
            }
        }, 25);
    });
}

function runKeyboard(device, times, color, steps = 3) {
    return new Promise(async (resolve) => {
        const priorColor = getKeyColorRGB(device, 0);
        let rDiff = parseInt((priorColor.r - color.r) / steps, 10);
        let gDiff = parseInt((priorColor.g - color.g) / steps, 10);
        let bDiff = parseInt((priorColor.b - color.b) / steps, 10);

        const colors = [];
        for (let i = 1; i < steps; i++) {
            colors.push({r: priorColor.r + (rDiff * i), g: priorColor.g - (gDiff * i), b: priorColor.b - (bDiff * i)});
        }
        colors.push(color);
        for (let i = steps - 1; i > 0; i--) {
            colors.push({r: priorColor.r + (rDiff * i), g: priorColor.g - (gDiff * i), b: priorColor.b - (bDiff * i)});
        }
        colors.push(priorColor);
//        for (let count=0;count < times;count++) {
            await _runner(device, colors, times);
//        }

        resolve();
    });
}


async function handleFlash(specialMode=1, repeat=3) {
    const keyDevice = getDevice(VENDOR_ID, KEYBOARD_ID);

    switch (specialMode) {
        case 1: // Pulse
            await pulseKeyboard(keyDevice, repeat);
            break;
    }
    keyDevice.close();
}

async function handleKeyboard(color, key = -1, specialMode=0, repeat=0, keyEnd=-1) {
    const keyDevice = getDevice(VENDOR_ID, KEYBOARD_ID);

    switch (specialMode) {
        case 1: // Pulse
            await pulseKeyboard(keyDevice, repeat, color, key)
            break;

        case 2: // Rotate
            await rotateKeyboard(keyDevice, repeat, color, key);
            break;

        case 3: // Runner
            await runKeyboard(keyDevice, repeat, color);
            break;

        default:
            setKeyColorRGB(keyDevice, color.r, color.g, color.b, color.bright, key, keyEnd);

            break;
    }
    keyDevice.close();
}






function do_help() {
    console.log("<color>         = Color for Keyboard");
    console.log("-l <color>      = Color for lighting")
    console.log("-k <color>      = Color for Keyboard")
    console.log("-p <color>      = Color for Keyboard to Pulse");
    console.log("-r <color>      = Color to rotate into")
    console.log("-all <color>    = Color for Lighting & Keyboard")
    console.log("-runner <color> = Color to run around keyboard");
    console.log("-keypad <color> = Color to change the keypad to")
    console.log("-arrows <color> = Color to change the Arrows to")
    console.log("-key <id>       = Change only a SINGLE Key for the above commands");
    console.log("-f              = Flash Keyboard -count times")
    console.log("-count <count>  = Repeat how many times, default:", 3)
    console.log("-server         = Start server")
    console.log("-port <port>    = port to listen on for server, default:", PORT);
}