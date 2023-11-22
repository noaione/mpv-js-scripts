"use strict";
/**
 * This script will take a screenshot of a video and create a mosaic of that said video.
 * It will take a screenshot of determined number of rows and columns, and then create
 * a montage of those screenshots.
 *
 * This .js file is a compiled version of the .ts file, you can compile it yourself by
 * running `npm run compile:mosaic`.
 *
 * Created by: noaione
 * License: MIT
 * Version: 2023.11.22.1
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var scriptName = mp.get_script_name();
var uoscMenuName = "".concat(scriptName, "_uosc_menu");
var mosaicOptions = {
    // Number of rows for screenshot
    rows: 3,
    // Number of columns for screenshot
    columns: 4,
    // Padding between screenshots (pixels)
    padding: 10,
    // Output format
    /**
     * @type {"png" | "jpg" | "webp"}
     */
    format: "png",
    // Screenshot mode
    /**
     * @type {"video" | "subtitles" | "window"}
     */
    mode: "video",
    // Append the "magick" command to the command line.
    // Sometimes on windows, you cannot really use any magick command without prefixing
    // "magick", if the command failed, you can set this to `yes` in your config.
    append_magick: "no",
    // Resize the final montage into the video height.
    // I recommend keeping this enabled since if you have a 4k video, you don't want to
    // have a montage that is basically 4k * whatever the number of screenshots you have.
    // It would be way too big, so this will resize it back to the video height.
    resize: "yes",
    // The quality of the final montage image.
    quality: 90,
};
/**
 * @class Pathing
 */
var Pathing = /** @class */ (function () {
    function Pathing() {
        this._isUnix = null;
        this._isMac = null;
        this._pathSep = null;
    }
    Pathing.prototype.getCwd = function () {
        var cwd = mp.utils.getcwd();
        if (cwd)
            return cwd;
        return "";
    };
    Pathing.prototype._detectOs = function () {
        var cwdPath = this.getCwd();
        this._isUnix = cwdPath.charAt(0) === '/';
        this._isMac = false; // Mac is also Unix, but we'll detect separately.
        this._pathSep = this._isUnix ? '/' : '\\';
        if (this._isUnix) {
            var unameResult = mp.command_native_async({ name: "subprocess", capture_stdout: true, playback_only: false, args: ["uname", "-s"] });
            if (typeof unameResult.stdout === "string" && unameResult.stdout.match(/^\s*Darwin\s*$/)) {
                this._isMac = true;
            }
        }
    };
    Pathing.prototype.isUnix = function () {
        if (this._isUnix === null) {
            this._detectOs();
        }
        return this._isUnix;
    };
    Pathing.prototype.isMac = function () {
        if (this._isMac === null) {
            this._detectOs();
        }
        return this._isMac;
    };
    Pathing.prototype.pathSep = function () {
        if (this._pathSep === null) {
            this._detectOs();
        }
        return this._pathSep;
    };
    Pathing.prototype.getParentPath = function (path) {
        if (this._isUnix === null || this._pathSep === null) {
            this._detectOs();
        }
        var pathParts = path.split(this._pathSep);
        var previousDir = null;
        if (pathParts.length > 1) {
            previousDir = pathParts.pop();
        }
        var newPath = pathParts.join(this._pathSep);
        if (this._isUnix && !newPath.length) {
            newPath = "/";
        }
        if (!newPath.length) {
            newPath = path;
        }
        return {
            path: path,
            newPath: newPath,
            previousDir: previousDir,
        };
    };
    Pathing.prototype.createDirectory = function (path) {
        if (this.isUnix()) {
            mp.msg.info("Creating directory (Unix): " + path);
            mp.command_native({ name: "subprocess", playback_only: false, args: ["mkdir", "-p", path] });
        }
        else {
            mp.msg.info("Creating directory (Windows): " + path);
            mp.command_native({ name: "subprocess", playback_only: false, args: ["cmd", "/C", "mkdir ".concat(path)] });
        }
    };
    Pathing.prototype.deleteFile = function (path) {
        mp.msg.info("Deleting file: " + path);
        if (this.isUnix()) {
            mp.command_native({ name: "subprocess", playback_only: false, args: ["rm", path] });
        }
        else {
            mp.command_native({ name: "subprocess", playback_only: false, args: ["cmd", "/C", "del /F /Q ".concat(path)] });
        }
    };
    Pathing.prototype.joinPath = function (basePath, path) {
        if (this._pathSep === null) {
            this._detectOs();
        }
        return basePath + this._pathSep + path;
    };
    Pathing.prototype.fixPath = function (path) {
        if (!this.isUnix()) {
            if (path.indexOf("/") !== -1) {
                path = path.replace(/\//g, "\\");
            }
        }
        if (path.indexOf("Program Files (x86)") !== -1) {
            path = path.replace("Program Files (x86)", "PROGRA~2");
        }
        if (path.indexOf("Program Files") !== -1) {
            path = path.replace("Program Files", "PROGRA~1");
        }
        return path;
    };
    return Pathing;
}());
mp.options.read_options(mosaicOptions, "screenshot-mosaic");
/**
 * Test if a directory is valid.
 * @param {string} path - The path to test.
 * @returns {boolean} - Whether the path is valid.
 */
function testDirectory(path) {
    var paths = new Pathing();
    var target = mp.utils.join_path(path, "_mosaic_screenshot_test.bin");
    try {
        mp.utils.write_file("file://".concat(target), "THIS FILE IS CREATED BY MPV SCREENSHOT MOSAIC SCRIPT");
    }
    catch (e) {
        mp.msg.error("Could not write to directory: " + path);
        return false;
    }
    // delete
    paths.deleteFile(paths.fixPath(target));
    return true;
}
/**
 * Get the output directory.
 * @returns {string} - The output directory.
 */
function getOutputDir() {
    var paths = new Pathing();
    // Use screenshot directory
    var screenDir = mp.get_property("screenshot-directory");
    if (screenDir) {
        var expandScreenDir = mp.command_native(["expand-path", screenDir]);
        var lastError = mp.last_error();
        if (!lastError && testDirectory(expandScreenDir)) {
            mp.msg.info("Using screenshot directory: " + expandScreenDir);
            return paths.fixPath(expandScreenDir);
        }
    }
    // Use mpv home directory as fallback
    var homeDir = mp.command_native(["expand-path", "~~home/"]);
    mp.msg.error("Could not get screenshot directory, trying to use mpv home directory: ".concat(homeDir));
    return paths.fixPath(homeDir);
}
/**
 * Explicitly check if the execution of magick command was successful.
 * Since sometimes a command would just return 0 even if it failed.
 * @param {SubprocessResult} result - The result of the subprocess.
 * @returns {boolean} - Whether the subprocess was successful.
 */
function isMagickSuccess(result) {
    // mpv subprocess actually return success even if magick fails.
    if (result.status !== 0) {
        return [false, result.stderr || ""];
    }
    var stdout = result.stdout || "";
    var stderr = result.stderr || "";
    var errorMsg = (stdout || stderr).replace(/\r?\n/g, "\n");
    return [stdout.indexOf("error/") === -1 && stderr.indexOf("error/") === -1, errorMsg];
}
/**
 * Humanize bytes number to a human readable string.
 * @param {number | undefined} bytes - The number of bytes.
 * @returns {string} - The humanized bytes. e.g. "1.2 MiB" or "?? B" if bytes is undefined.
 */
function humanizeBytes(bytes) {
    if (bytes === undefined)
        return "?? B";
    var thresh = 1024;
    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }
    var units = ['kiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    var u = -1;
    do {
        bytes /= thresh;
        ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + ' ' + units[u];
}
/**
 * Floor a number.
 * Since there is no Math.floor in mpv scripting, use ~~ instead.
 * @param {number} n - The number to floor.
 * @returns {number} - The floored number.
 */
function floor(n) {
    // no Math module
    return ~~n;
}
/**
 * Pad a number with leading zeros.
 * @param {number} n - The number to pad.
 * @returns {string}
 */
function padZero(n) {
    return n < 10 ? "0" + n : "" + n;
}
/**
 * Format a duration number into HH:MM:SS.
 * @param {number | undefined} seconds - The seconds to format.
 * @returns {string} - The formatted duration.
 */
function formatDurationToHHMMSS(seconds) {
    // do not use Date
    if (seconds === undefined)
        return "??:??:??";
    var hours = floor(seconds / 3600);
    var minutes = floor((seconds - (hours * 3600)) / 60);
    var seconds2 = floor(seconds - (hours * 3600) - (minutes * 60));
    // pad numbers with leading zeros
    var hoursString = padZero(hours);
    var minutesString = padZero(minutes);
    var secondsString = padZero(seconds2);
    return hoursString + ":" + minutesString + ":" + secondsString;
}
/**
 * Format an output filename with some constraints and extra info.
 * @param {string} fileName - The original filename
 * @param {MinimalMosaicOptions} options - The options to use
 * @returns {string} - The new filename
 */
function createOutputName(fileName, options) {
    var finalName = fileName.replace(" ", "_");
    var ColRow = "".concat(options.columns, "x").concat(options.rows);
    var mosaicName = ".mosaic".concat(ColRow);
    // Max count is 256 characters, with safety margin to 224
    var testCount = finalName.length + mosaicName.length;
    if (testCount > 224) {
        // Butcher only the finalName that doesn't include the mosaicName yet
        var cutCount = testCount - 224;
        finalName = finalName.slice(0, -cutCount);
    }
    return finalName + mosaicName;
}
/**
 * Run the resize command, will be skipped if resize is disabled.
 * @param {string} imgOutput - The image output path.
 * @param {number} videoHeight - The video height.
 * @param {MosaicOptions} options - The options to use.
 * @param {CallbackChain} callback - The callback chain that will be called.
 * @returns {void} - Nothing
 */
function runResize(imgOutput, videoHeight, options, callback) {
    var resizeCmdsBase = [];
    if (options.append_magick.toLowerCase() === "yes") {
        resizeCmdsBase.push("magick");
    }
    var resizeCmds = __spreadArray(__spreadArray([], resizeCmdsBase, true), [
        "convert",
        "".concat(imgOutput, ".montage.png"),
        "-resize",
        "x".concat(videoHeight),
        "".concat(imgOutput, ".montage.png"),
    ], false);
    if (options.resize.toLowerCase() !== "yes") {
        callback(true, undefined);
        return;
    }
    mp.msg.info("Resizing image to x".concat(videoHeight, ": ").concat(imgOutput, ".montage.png"));
    dump(resizeCmds);
    mp.command_native_async({
        name: "subprocess",
        playback_only: false,
        args: resizeCmds,
        capture_stderr: true,
        capture_stdout: true,
    }, function (_, result, __) {
        var _a = isMagickSuccess(result), success = _a[0], errorMsg = _a[1];
        mp.msg.info("Resize status: ".concat(success, " || err? ").concat(errorMsg));
        callback(success, errorMsg);
    });
}
/**
 * Run the annotation command.
 * @param {string} fileName - The video filename.
 * @param {number} videoWidth - The video width.
 * @param {number} videoHeight - The video height.
 * @param {string} duration - The video duration (pre-formatted).
 * @param {string} imgOutput - The image output path.
 * @param {MosaicOptions} options - The options to use.
 * @param {CallbackChain} callback - The callback chain that will be called.
 * @returns {void} - Nothing
 */
function runAnnotation(fileName, videoWidth, videoHeight, duration, imgOutput, options, callback) {
    // annotate text
    var annotateCmdsBase = [];
    if (options.append_magick.toLowerCase() === "yes") {
        annotateCmdsBase.push("magick");
    }
    var annotateCmds = __spreadArray(__spreadArray([], annotateCmdsBase, true), [
        "convert",
        "-background",
        "white",
        "-pointsize",
        "40",
        "-gravity",
        "northwest",
        "label:mpv Media Player",
        // Add top margin
        "-splice",
        "0x10",
        "-pointsize",
        "16",
        "-gravity",
        "northwest",
        "label:File Name: " + fileName + "",
        "label:File Size: " + humanizeBytes(mp.get_property_number("file-size")) + "",
        "label:Resolution: " + videoWidth + "x" + videoHeight + "",
        "label:Duration: " + duration + "",
        // Add left margin
        "-splice",
        "10x0",
        "".concat(imgOutput, ".montage.png"),
        "-append",
        "-quality",
        "".concat(options.quality, "%"),
        imgOutput,
    ], false);
    mp.msg.info("Annotating image: ".concat(imgOutput));
    dump(annotateCmds);
    mp.command_native_async({
        name: "subprocess",
        playback_only: false,
        args: annotateCmds,
        capture_stderr: true,
        capture_stdout: true,
    }, function (_, result, __) {
        var _a = isMagickSuccess(result), success = _a[0], errorMsg = _a[1];
        mp.msg.info("Annotate status: ".concat(success, " || err? ").concat(errorMsg));
        callback(success, errorMsg);
    });
}
/**
 * Run the montagge, resize, and annotate command.
 * @param {string[]} screenshots - The list of screenshots to montage.
 * @param {number} videoWidth - The video width.
 * @param {number} videoHeight - The video height.
 * @param {string} fileName - The video filename.
 * @param {string} duration - The video duration (pre-formatted).
 * @param {string} outputFile - The image output path.
 * @param {MosaicOptions} options - The options to use.
 * @param {CallbackChain} callback - The callback chain that will be called.
 * @returns {void} - Nothing
 */
function createMosaic(screenshots, videoWidth, videoHeight, fileName, duration, outputFile, options, callback) {
    var imageMagick = [];
    if (options.append_magick.toLowerCase() === "yes") {
        imageMagick.push("magick");
    }
    var imageMagickArgs = [
        "montage",
        "-geometry",
        "".concat(videoWidth, "x").concat(videoHeight, "+").concat(options.padding, "+").concat(options.padding),
    ];
    for (var i = 0; i < screenshots.length; i++) {
        imageMagickArgs.push(screenshots[i]);
    }
    imageMagickArgs.push("".concat(outputFile, ".montage.png"));
    mp.msg.info("Creating image montage: ".concat(outputFile, ".montage.png"));
    dump(imageMagickArgs);
    mp.command_native_async({
        name: "subprocess",
        playback_only: false,
        args: imageMagick.concat(imageMagickArgs),
        capture_stderr: true,
        capture_stdout: true,
    }, function (_, result, __) {
        var _a = isMagickSuccess(result), success = _a[0], errorMsg = _a[1];
        mp.msg.info("Montage status: ".concat(success, " || ").concat(errorMsg));
        if (success) {
            runResize(outputFile, videoHeight, options, function (result2, error2) {
                if (!result2) {
                    callback(false, error2);
                }
                else {
                    runAnnotation(fileName, videoWidth, videoHeight, duration, outputFile, options, function (result3, error3) {
                        callback(result3, error3);
                    });
                }
            });
        }
        else {
            callback(false, errorMsg);
        }
    });
}
/**
 * Create a collection of screenshots from the video.
 * @param {number} startTime - The start time of the video. (in seconds, relative to video duration)
 * @param {number} timeStep - The time step in-between each screenshot. (in seconds)
 * @param {string} screenshotDir - The temporary folder to be used to save the screenshot.
 * @param {MosaicOptions} options - The options to use.
 * @returns {string[] | undefined} - The list of screenshots created, or undefined if an error occurred.
 */
function screenshotCycles(startTime, timeStep, screenshotDir, options) {
    var rows = options.rows, columns = options.columns;
    var screenshots = [];
    var totalImages = rows * columns;
    for (var i = 1; i <= totalImages; i++) {
        var tTarget = startTime + (timeStep * (i - 1));
        mp.command_native(["seek", tTarget, "absolute", "exact"]);
        // wait until seeking done
        var imagePath = mp.utils.join_path(screenshotDir, "temp_screenshot-".concat(i, ".png"));
        mp.command_native(["screenshot-to-file", imagePath, options.mode]);
        var errorMsg = mp.last_error();
        if (errorMsg.length > 0) {
            mp.osd_message("Error taking screenshot: " + errorMsg);
            return undefined;
        }
        screenshots.push(imagePath);
    }
    return screenshots;
}
/**
 * Check if the montage command is available. (also check Magick)
 * @returns {boolean} - True if the montage command is available, false otherwise.
 */
function checkMagick() {
    var cmds = [];
    if (mosaicOptions.append_magick.toLowerCase() === "yes") {
        cmds.push("magick");
    }
    cmds.push("montage");
    cmds.push("--version");
    var res = mp.command_native({ name: "subprocess", playback_only: false, args: cmds });
    return res.status === 0;
}
/**
 * Check if the variables of an options are all valid.
 * @param {MosaicOptions} options - The options to check.
 * @returns {boolean} - True if all the options are valid, false otherwise.
 */
function verifyVariables(options) {
    if (options.rows < 1) {
        mp.osd_message("Mosaic rows must be greater than 0");
        return false;
    }
    if (options.columns < 1) {
        mp.osd_message("Mosaic columns must be greater than 0");
        return false;
    }
    if (options.padding < 0) {
        mp.osd_message("Mosaic padding must be greater than or equal to 0");
        return false;
    }
    var mosaicMode = options.mode.toLowerCase();
    if (mosaicMode !== "video" && mosaicMode !== "subtitles" && mosaicMode !== "window") {
        mp.osd_message("Mosaic mode must be either 'video' or 'subtitles' or 'window'");
        return false;
    }
    return true;
}
/**
 * Send a formatted OSD message that support ASS tags.
 * @param {string} message - The message to send
 * @param {number} duration - The duration (in seconds, default to `2`)
 */
function sendOSD(message, duration) {
    if (duration === void 0) { duration = 2; }
    var prefix = mp.get_property("osd-ass-cc/0");
    var postfix = mp.get_property("osd-ass-cc/1");
    if (prefix && postfix) {
        mp.osd_message("".concat(prefix).concat(message).concat(postfix), duration);
    }
    else {
        mp.osd_message(message, duration);
    }
}
/**
 * The main execution function, which includes all the check and everything.
 * This should be called immediatly after a macro is executed.
 *
 * @param {MosaicOptions} options - Options
 * @returns {void} - Nothing
 */
function entrypoint(options) {
    // create a mosaic of screenshots
    var paths = new Pathing();
    if (!verifyVariables(options)) {
        return;
    }
    var magickExist = checkMagick();
    if (!magickExist) {
        var tf = paths.isUnix() ? "false" : "true";
        mp.msg.info("ImageMagick cannot be found, please install it.\nOr you can set append_magick to ".concat(tf, " in the script options."));
        mp.osd_message("ImageMagick cannot be found, please install it.\nOr you can set append_magick to ".concat(tf, " in the script options."), 5);
        return;
    }
    var imageCount = options.rows * options.columns;
    // get video length and divide by number of screenshots
    var videoLength = mp.get_property_number("duration");
    if (videoLength === undefined) {
        mp.osd_message("Failed to get video length");
        return;
    }
    // get video width
    var videoWidth = mp.get_property_number("width");
    if (videoWidth === undefined) {
        mp.osd_message("Failed to get video width");
        return;
    }
    // get video height
    var videoHeight = mp.get_property_number("height");
    if (videoHeight === undefined) {
        mp.osd_message("Failed to get video height");
        return;
    }
    // original time position
    var originalTimePos = mp.get_property_number("time-pos");
    if (originalTimePos === undefined) {
        mp.osd_message("Failed to get time position");
        return;
    }
    mp.msg.info("Running Mosaic Tools with the following options:");
    mp.msg.info("  Rows: " + options.rows);
    mp.msg.info("  Columns: " + options.columns);
    mp.msg.info("  Padding: " + options.padding);
    mp.msg.info("  Format: " + options.format);
    mp.msg.info("  Video Length: " + videoLength);
    mp.msg.info("  Video Width: " + videoWidth);
    mp.msg.info("  Video Height: " + videoHeight);
    var videoDuration = formatDurationToHHMMSS(videoLength);
    // we want to start at 10% of the video length and end at 90%
    var startTime = videoLength * 0.1;
    var endTime = videoLength * 0.9;
    var timeStep = (endTime - startTime) / (imageCount - 1);
    mp.osd_message("Creating ".concat(options.columns, "x").concat(options.rows, " mosaic of ").concat(imageCount, " screenshots..."), 2);
    mp.msg.info("Creating ".concat(options.columns, "x").concat(options.rows, " mosaic of ").concat(imageCount, " screenshots..."));
    // pause video
    var homeDir = mp.command_native(["expand-path", "~~home/"]);
    var screenshotDir = paths.fixPath(mp.utils.join_path(homeDir, "screenshot-mosaic"));
    paths.createDirectory(screenshotDir);
    mp.set_property("pause", "yes");
    var screenshots = screenshotCycles(startTime, timeStep, screenshotDir, options);
    mp.set_property_number("time-pos", originalTimePos);
    mp.set_property("pause", "no");
    if (screenshots !== undefined) {
        mp.msg.info("Creating mosaic for ".concat(options.columns, "x").concat(options.rows, " images..."));
        mp.osd_message("Creating mosaic...", 2);
        var fileName = mp.get_property("filename");
        var outputDir = getOutputDir();
        var imgOutput_1 = paths.fixPath(mp.utils.join_path(outputDir, "".concat(createOutputName(fileName, options), ".").concat(options.format)));
        createMosaic(screenshots, videoWidth, videoHeight, fileName, videoDuration, imgOutput_1, options, function (success, error) {
            if (success) {
                mp.msg.info("Mosaic created for ".concat(options.columns, "x").concat(options.rows, " images at ").concat(imgOutput_1, "..."));
                sendOSD("Mosaic created!\n{\\b1}".concat(imgOutput_1, "{\\b0}"), 5);
            }
            else {
                mp.msg.error("Failed to create mosaic for ".concat(options.columns, "x").concat(options.rows, " images..."));
                mp.msg.error(error);
                mp.osd_message("Failed to create mosaic for ".concat(options.columns, "x").concat(options.rows, " images..."), 5);
            }
            // Cleanup
            mp.msg.info("Cleaning up...");
            screenshots.forEach(function (sspath) {
                paths.deleteFile(paths.fixPath(sspath));
            });
            paths.deleteFile(paths.fixPath("".concat(imgOutput_1, ".montage.png")));
        });
    }
}
mp.add_key_binding("Ctrl+Alt+s", "screenshot", function () {
    entrypoint(mosaicOptions);
});
/** UOSC Related Code */
var UOSCState = {
    rows: 3,
    columns: 4,
    padding: 10,
    format: "png",
    mode: "video",
    resize: "yes",
    quality: 90,
};
function resetStateWithConfig() {
    for (var key in UOSCState) {
        // @ts-expect-error
        UOSCState[key] = mosaicOptions[key];
    }
}
function createUOSCMenu() {
    return {
        type: uoscMenuName,
        title: "Screenshot Mosaic",
        keep_open: true,
        items: [
            {
                title: "Rows",
                hint: UOSCState.rows.toString(),
                items: [
                    {
                        title: "+1",
                        icon: "keyboard_arrow_up",
                        value: uoscUpdateDispatch("rows", UOSCState.rows + 1),
                    },
                    {
                        title: "-1",
                        icon: "keyboard_arrow_down",
                        value: uoscUpdateDispatch("rows", UOSCState.rows - 1 < 1 ? 1 : UOSCState.rows - 1),
                    },
                ]
            },
            {
                title: "Columns",
                hint: UOSCState.columns.toString(),
                items: [
                    {
                        title: "+1",
                        icon: "keyboard_arrow_up",
                        value: uoscUpdateDispatch("columns", UOSCState.columns + 1),
                    },
                    {
                        title: "-1",
                        icon: "keyboard_arrow_down",
                        value: uoscUpdateDispatch("columns", UOSCState.columns - 1 < 1 ? 1 : UOSCState.columns - 1),
                    },
                ]
            },
            {
                title: "Padding",
                hint: UOSCState.padding.toString(),
                items: [
                    {
                        title: "+5",
                        icon: "keyboard_double_arrow_up",
                        value: uoscUpdateDispatch("padding", UOSCState.padding + 5),
                    },
                    {
                        title: "+1",
                        icon: "keyboard_arrow_up",
                        value: uoscUpdateDispatch("padding", UOSCState.padding + 1),
                    },
                    {
                        title: "-1",
                        icon: "keyboard_arrow_down",
                        value: uoscUpdateDispatch("padding", UOSCState.padding - 1 < 1 ? 1 : UOSCState.padding - 1),
                    },
                    {
                        title: "-5",
                        icon: "keyboard_double_arrow_down",
                        value: uoscUpdateDispatch("padding", UOSCState.padding - 5 < 1 ? 1 : UOSCState.padding - 5),
                    },
                ]
            },
            {
                title: "Format",
                hint: UOSCState.format,
                icon: "image",
                items: [
                    {
                        title: "PNG",
                        icon: UOSCState.format === "png" ? "radio_button_checked" : "radio_button_unchecked",
                        value: uoscUpdateDispatch("format", "png"),
                    },
                    {
                        title: "JPEG",
                        icon: UOSCState.format === "jpg" ? "radio_button_checked" : "radio_button_unchecked",
                        value: uoscUpdateDispatch("format", "jpg"),
                    },
                    {
                        title: "WebP",
                        icon: UOSCState.format === "webp" ? "radio_button_checked" : "radio_button_unchecked",
                        value: uoscUpdateDispatch("format", "webp"),
                    },
                ]
            },
            {
                title: "Screenshot Mode",
                hint: UOSCState.mode,
                icon: "burst_mode",
                items: [
                    {
                        title: "Video only",
                        icon: UOSCState.mode === "video" ? "radio_button_checked" : "radio_button_unchecked",
                        value: uoscUpdateDispatch("mode", "video"),
                    },
                    {
                        title: "Video + Subtitles",
                        icon: UOSCState.mode === "subtitles" ? "radio_button_checked" : "radio_button_unchecked",
                        value: uoscUpdateDispatch("mode", "subtitles"),
                    },
                    {
                        title: "Whole window",
                        icon: UOSCState.mode === "window" ? "radio_button_checked" : "radio_button_unchecked",
                        value: uoscUpdateDispatch("mode", "window"),
                    },
                ]
            },
            {
                title: "Resize",
                icon: UOSCState.resize === "yes" ? "check_box" : "check_box_outline_blank",
                value: uoscUpdateDispatch("resize", UOSCState.resize === "yes" ? "no" : "yes"),
            },
            {
                title: "Reset",
                icon: "restart_alt",
                value: "script-message-to ".concat(scriptName, " uosc-menu-reset"),
            },
            {
                title: "Create Mosaic Screenshot",
                icon: "screenshot_monitor",
                value: "script-message-to ".concat(scriptName, " uosc-menu-execute"),
                keep_open: false,
            }
        ]
    };
}
function uoscUpdateDispatch(key, value) {
    var jsonData = JSON.stringify({
        key: key,
        value: String(value),
        format: typeof value,
    });
    return "script-message-to ".concat(scriptName, " uosc-menu-update ").concat(jsonData);
}
function uoscUpdateConsume(rawData) {
    if (typeof rawData !== "string")
        return;
    var _a = JSON.parse(rawData), key = _a.key, value = _a.value, format = _a.format;
    if (key in UOSCState) {
        if (format === "number") {
            var parsed = parseInt(value);
            if (!isNaN(parsed)) {
                // @ts-expect-error
                UOSCState[key] = parsed;
            }
        }
        else if (format === "string") {
            // @ts-expect-error
            UOSCState[key] = value;
        }
        else if (format === "boolean") {
            // @ts-expect-error
            UOSCState[key] = value === "true" ? "yes" : "no";
        }
    }
    var menu = createUOSCMenu();
    mp.commandv("script-message-to", "uosc", "update-menu", JSON.stringify(menu));
}
mp.add_key_binding(null, "uosc-menu", function () {
    var menu = createUOSCMenu();
    mp.commandv("script-message-to", "uosc", "open-menu", JSON.stringify(menu));
});
mp.register_script_message("uosc-menu-update", uoscUpdateConsume);
mp.register_script_message("uosc-menu-reset", function () {
    resetStateWithConfig();
    var menu = createUOSCMenu();
    mp.commandv("script-message-to", "uosc", "update-menu", JSON.stringify(menu));
});
mp.register_script_message("uosc-menu-execute", function () {
    var mergedConfig = __assign(__assign({}, mosaicOptions), UOSCState);
    resetStateWithConfig();
    entrypoint(mergedConfig);
});
