var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var mosaicOptions = {
    // Number of rows for screenshot
    rows: 3,
    // Number of columns for screenshot
    columns: 4,
    // Padding between screenshots (pixels)
    padding: 10,
    // Output format
    format: "png",
    // Screenshot mode
    /**
     * @type {"video" | "subtitles" | "window"}
     */
    mode: "video",
    // Append the "magick" command to the command line.
    // Sometimes on windows, you cannot really use any magick command without prefixing
    // "magick", if the command failed, you can run this.
    // Set to "yes" to enable
    append_magick: "no"
};
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
            previousDir: previousDir
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
            if (path.indexOf("/")) {
                path = path.replace(/\//g, "\\");
            }
        }
        return path;
    };
    return Pathing;
}());
mp.options.read_options(mosaicOptions, "screenshot-mosaic");
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
function floor(n) {
    // no Math module
    return ~~n;
}
function padZero(n) {
    return n < 10 ? "0" + n : "" + n;
}
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
function createOutputName(fileName) {
    var finalName = fileName.replace(" ", "_");
    var ColRow = "".concat(mosaicOptions.columns, "x").concat(mosaicOptions.rows);
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
function createMosaic(screenshots, videoWidth, videoHeight, fileName, duration, callback) {
    var paths = new Pathing();
    var cwd = paths.getCwd();
    var imageMagick = [];
    if (mosaicOptions.append_magick.toLowerCase() === "yes") {
        imageMagick.push("magick");
    }
    var imageMagickArgs = [
        "montage",
        "-geometry",
        "".concat(videoWidth, "x").concat(videoHeight, "+").concat(mosaicOptions.padding, "+").concat(mosaicOptions.padding),
    ];
    for (var i = 0; i < screenshots.length; i++) {
        imageMagickArgs.push(screenshots[i]);
    }
    var imgOutput = paths.fixPath(mp.utils.join_path(cwd, "".concat(createOutputName(fileName), ".").concat(mosaicOptions.format)));
    imageMagickArgs.push(imgOutput);
    mp.command_native_async({ name: "subprocess", playback_only: false, args: imageMagick.concat(imageMagickArgs) }, function (success, res, err) {
        if (success) {
            mp.command_native_async({ name: "subprocess", playback_only: false, args: ["magick", "convert", imgOutput, "-resize", "x".concat(videoHeight), imgOutput] }, function (s2, r2, e2) {
                if (s2) {
                    // annotate text
                    var annotateCmdsBase = [];
                    if (mosaicOptions.append_magick.toLowerCase() === "yes") {
                        annotateCmdsBase.push("magick");
                    }
                    var annotateCmds = __spreadArray(__spreadArray([], annotateCmdsBase, true), [
                        "convert",
                        "-background",
                        "white",
                        "-pointsize",
                        "40",
                        "label:mpv Media Player",
                        "-gravity",
                        "northwest",
                        "-pointsize",
                        "16",
                        "-splice",
                        "5x0",
                        "label:File Name: " + fileName + "",
                        "-gravity",
                        "northwest",
                        "-pointsize",
                        "16",
                        "label:File Size: " + humanizeBytes(mp.get_property_number("file-size")) + "",
                        "-gravity",
                        "northwest",
                        "-splice",
                        "5x0",
                        "label:Resolution: " + videoWidth + "x" + videoHeight + "",
                        "-gravity",
                        "northwest",
                        "-pointsize",
                        "16",
                        "label:Duration: " + duration + "",
                        "-gravity",
                        "northwest",
                        "-splice",
                        "5x0",
                        imgOutput,
                        "-append",
                        imgOutput,
                    ], false);
                    mp.command_native_async({ name: "subprocess", playback_only: false, args: annotateCmds }, function (s3, r3, e3) {
                        if (s3) {
                            callback();
                        }
                        else {
                            mp.osd_message("Error annotating image: " + e3);
                        }
                    });
                }
            });
        }
    });
}
function waitSeeking() {
    setTimeout(function () {
        var seek = mp.get_property_bool("seeking");
        if (seek) {
            waitSeeking();
        }
    }, 500);
}
function screenshotCycles(startTime, timeStep, screenshotDir) {
    var rows = mosaicOptions.rows, columns = mosaicOptions.columns;
    var screenshots = [];
    var totalImages = rows * columns;
    for (var i = 1; i <= totalImages; i++) {
        var tTarget = startTime + (timeStep * (i - 1));
        mp.set_property_number("time-pos", tTarget);
        // wait until seeking done
        waitSeeking();
        var imagePath = mp.utils.join_path(screenshotDir, "temp_screenshot-".concat(i, ".png"));
        mp.command_native(["screenshot-to-file", imagePath, mosaicOptions.mode]);
        var errorMsg = mp.last_error();
        if (errorMsg.length > 0) {
            mp.osd_message("Error taking screenshot: " + errorMsg);
            return undefined;
        }
        screenshots.push(imagePath);
    }
    return screenshots;
}
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
function verifyVariables() {
    if (mosaicOptions.rows < 1) {
        mp.osd_message("Mosaic rows must be greater than 0");
        return false;
    }
    if (mosaicOptions.columns < 1) {
        mp.osd_message("Mosaic columns must be greater than 0");
        return false;
    }
    if (mosaicOptions.padding < 0) {
        mp.osd_message("Mosaic padding must be greater than or equal to 0");
        return false;
    }
    var mosaicMode = mosaicOptions.mode.toLowerCase();
    if (mosaicMode !== "video" && mosaicMode !== "subtitles" && mosaicMode !== "window") {
        mp.osd_message("Mosaic mode must be either 'video' or 'subtitles' or 'window'");
        return false;
    }
    return true;
}
function main() {
    // create a mosaic of screenshots
    var paths = new Pathing();
    if (!verifyVariables()) {
        return;
    }
    var magickExist = checkMagick();
    if (!magickExist) {
        var tf = paths.isUnix() ? "false" : "true";
        mp.msg.info("ImageMagick cannot be found, please install it.\nOr you can set append_magick to ".concat(tf, " in the script options."));
        mp.osd_message("ImageMagick cannot be found, please install it.\nOr you can set append_magick to ".concat(tf, " in the script options."), 5);
        return;
    }
    var imageCount = mosaicOptions.rows * mosaicOptions.columns;
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
    mp.msg.info("  Rows: " + mosaicOptions.rows);
    mp.msg.info("  Columns: " + mosaicOptions.columns);
    mp.msg.info("  Padding: " + mosaicOptions.padding);
    mp.msg.info("  Format: " + mosaicOptions.format);
    mp.msg.info("  Video Length: " + videoLength);
    mp.msg.info("  Video Width: " + videoWidth);
    mp.msg.info("  Video Height: " + videoHeight);
    var videoDuration = formatDurationToHHMMSS(videoLength);
    // we want to start at 10% of the video length and end at 90%
    var startTime = videoLength * 0.1;
    var endTime = videoLength * 0.9;
    var timeStep = (endTime - startTime) / (imageCount - 1);
    mp.osd_message("Creating ".concat(mosaicOptions.columns, "x").concat(mosaicOptions.rows, " mosaic of ").concat(imageCount, " screenshots..."), 2);
    mp.msg.info("Creating ".concat(mosaicOptions.columns, "x").concat(mosaicOptions.rows, " mosaic of ").concat(imageCount, " screenshots..."));
    // pause video
    var homeDir = mp.command_native(["expand-path", "~~home/"]);
    var screenshotDir = paths.fixPath(mp.utils.join_path(homeDir, "screenshot-mosaic"));
    paths.createDirectory(screenshotDir);
    mp.set_property("pause", "yes");
    var screenshots = screenshotCycles(startTime, timeStep, screenshotDir);
    mp.set_property_number("time-pos", originalTimePos);
    mp.set_property("pause", "no");
    if (screenshots !== undefined) {
        mp.msg.info("Creating mosaic for ".concat(mosaicOptions.columns, "x").concat(mosaicOptions.rows, " images..."));
        mp.osd_message("Creating mosaic...", 2);
        createMosaic(screenshots, videoWidth, videoHeight, mp.get_property("filename"), videoDuration, function () {
            mp.msg.info("Mosaic created for ".concat(mosaicOptions.columns, "x").concat(mosaicOptions.rows, " images..."));
            mp.osd_message("Mosaic created!", 2);
            // Cleanup
            mp.msg.info("Cleaning up...");
            screenshots.forEach(function (sspath) {
                paths.deleteFile(paths.fixPath(sspath));
            });
        });
    }
}
mp.add_key_binding("Ctrl+Alt+s", "screenshot-mosaic", main);
