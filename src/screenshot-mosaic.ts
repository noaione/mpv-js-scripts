const mosaicOptions = {
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
}

interface SubprocessCommand {
    stdout: string | undefined;
    stderr: string | undefined;
    status: number;
}

class Pathing {
    _isUnix: boolean | null;
    _isMac: boolean | null;
    _pathSep: string | null;

    constructor() {
        this._isUnix = null;
        this._isMac = null;
        this._pathSep = null;
    }

    getCwd() {
        const cwd = mp.utils.getcwd();
        if (cwd) return cwd;
        return "";
    }

    _detectOs() {
        const cwdPath = this.getCwd();


        this._isUnix = cwdPath.charAt(0) === '/';
        this._isMac = false; // Mac is also Unix, but we'll detect separately.
        this._pathSep = this._isUnix ? '/' : '\\';

        if (this._isUnix) {
            const unameResult = mp.command_native_async({name: "subprocess", capture_stdout: true, playback_only: false, args: ["uname", "-s"]}) as SubprocessCommand;
            if (typeof unameResult.stdout === "string" && unameResult.stdout.match(/^\s*Darwin\s*$/)) {
                this._isMac = true;
            }
        }
    }

    isUnix() {
        if (this._isUnix === null) {
            this._detectOs();
        }
        return this._isUnix;
    }

    isMac() {
        if (this._isMac === null) {
            this._detectOs();
        }
        return this._isMac;
    }

    pathSep() {
        if (this._pathSep === null) {
            this._detectOs();
        }
        return this._pathSep;
    }

    getParentPath(path: string) {
        if (this._isUnix === null || this._pathSep === null) {
            this._detectOs();
        }

        const pathParts = path.split(this._pathSep as string);
        let previousDir = null;

        if (pathParts.length > 1) {
            previousDir = pathParts.pop();
        }

        let newPath = pathParts.join(this._pathSep as string);
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
        }
    }

    createDirectory(path: string) {
        if (this.isUnix()) {
            mp.command_native({name: "subprocess", playback_only: false, args: ["mkdir", "-p", path]});
        } else {
            mp.msg.info("Creating directory: " + path);
            mp.command_native({name: "subprocess", playback_only: false, args: ["mkdir", path]});
        }
    }

    joinPath(basePath: string, path: string) {
        if (this._pathSep === null) {
            this._detectOs();
        }
        return basePath + this._pathSep + path;
    }

    fixPath(path: string) {
        if (!this.isUnix()) {
            if (path.indexOf("/")) {
                path = path.replace(/\//g, "\\");
            }
        }
        return path;
    }
}

mp.options.read_options(mosaicOptions, "screenshot-mosaic");

function humanizeBytes(bytes?: number) {
    if (bytes === undefined) return "?? B";
    const thresh = 1024;
    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }
    const units = ['kiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    do {
        bytes /= thresh;
        ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + ' ' + units[u];
}
function floor(n: number) {
    // no Math module
    return ~~n;
}

function padZero(n: number) {
    return n < 10 ? "0" + n : "" + n;
}

function formatDurationToHHMMSS(seconds?: number) {
    // do not use Date
    if (seconds === undefined) return "??:??:??";
    const hours = floor(seconds / 3600);
    const minutes = floor((seconds - (hours * 3600)) / 60);
    const seconds2 = floor(seconds - (hours * 3600) - (minutes * 60));
    // pad numbers with leading zeros
    const hoursString = padZero(hours);
    const minutesString = padZero(minutes);
    const secondsString = padZero(seconds2);
    return hoursString + ":" + minutesString + ":" + secondsString;
}

function createMosaic(screenshots: string[], videoWidth: number, videoHeight: number, fileName: string, duration: string, callback: () => void) {
    const paths = new Pathing();
    const cwd = paths.getCwd();
    const imageMagick = ["magick", "montage"];
    const imageMagickArgs = [
        "-geometry",
        `${videoWidth}x${videoHeight}+${mosaicOptions.padding}+${mosaicOptions.padding}`,
    ];
    for (let i = 0; i < screenshots.length; i++) {
        imageMagickArgs.push(screenshots[i]);
    }
    const imgOutput = paths.fixPath(mp.utils.join_path(cwd, `mosaic.${mosaicOptions.format}`));
    imageMagickArgs.push(imgOutput);
    mp.command_native_async({name: "subprocess", playback_only: false, args: imageMagick.concat(imageMagickArgs)}, (success, res, err) => {
        if (success) {
            mp.command_native_async({name: "subprocess", playback_only: false, args: ["magick", "convert", imgOutput, "-resize", `x${videoHeight}`, imgOutput]}, (s2, r2, e2) => {
                if (s2) {
                    // annotate text
                    const annotateCmds = [
                        "magick",
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
                    ];
                    mp.command_native_async({name: "subprocess", playback_only: false, args: annotateCmds}, (s3, r3, e3) => {
                        if (s3) {
                            callback();
                        } else {
                            mp.osd_message("Error annotating image: " + e3);
                        }
                    })
                }
            });

        }
    });
    
}

function waitSeeking() {
    setTimeout(() => {
        const seek = mp.get_property_bool("seeking");
        if (seek) {
            waitSeeking();
        }
    }, 500);
}

function screenshotCycles(startTime: number, timeStep: number, screenshotDir: string) {
    const { rows, columns } = mosaicOptions;

    const screenshots: string[] = [];
    const totalImages = rows * columns;

    for (let i = 1; i <= totalImages; i++) {
        const tTarget = startTime + (timeStep * (i - 1));
        mp.set_property_number("time-pos", tTarget);
        // wait until seeking done
        waitSeeking();

        const imagePath = mp.utils.join_path(screenshotDir, `screenshot-${i}.png`);
        mp.command_native(["screenshot-to-file", imagePath, mosaicOptions.mode]) as string;
        const errorMsg = mp.last_error();
        if (errorMsg.length > 0) {
            mp.osd_message("Error taking screenshot: " + errorMsg);
            return undefined;
        }
        screenshots.push(imagePath);
    }
    return screenshots;
}

function main() {
    // create a mosaic of screenshots
    const paths = new Pathing();
    const imageCount = mosaicOptions.rows * mosaicOptions.columns;
    // get video length and divide by number of screenshots
    const videoLength = mp.get_property_number("duration");
    if (videoLength === undefined) {
        mp.osd_message("Failed to get video length");
        return;
    }
    // get video width
    const videoWidth = mp.get_property_number("width");
    if (videoWidth === undefined) {
        mp.osd_message("Failed to get video width");
        return;
    }
    // get video height
    const videoHeight = mp.get_property_number("height");
    if (videoHeight === undefined) {
        mp.osd_message("Failed to get video height");
        return;
    }
    // original time position
    const originalTimePos = mp.get_property_number("time-pos");
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
    const videoDuration = formatDurationToHHMMSS(videoLength);

    // we want to start at 10% of the video length and end at 90%
    const startTime = videoLength * 0.1;
    const endTime = videoLength * 0.9;
    const timeStep = (endTime - startTime) / (imageCount - 1);
    mp.osd_message(`Creating ${mosaicOptions.columns}x${mosaicOptions.rows} mosaic of ${imageCount} screenshots...`, 2);
    // pause video
    const homeDir = mp.command_native(["expand-path", "~~home/"])  as string;
    const screenshotDir = paths.fixPath(mp.utils.join_path(homeDir, "screenshot-mosaic"));
    paths.createDirectory(screenshotDir);
    mp.set_property("pause", "yes");
    const screenshots = screenshotCycles(startTime, timeStep, screenshotDir);
    mp.set_property_number("time-pos", originalTimePos);
    mp.set_property("pause", "no");
    if (screenshots !== undefined) {
        mp.osd_message("Creating mosaic...", 2);
        createMosaic(screenshots, videoWidth, videoHeight, mp.get_property("filename") as string, videoDuration, () => {
            mp.osd_message("Mosaic created!", 2);
        });
    }
}

mp.add_key_binding("Ctrl+Alt+s", "screenshot-mosaic", main);

