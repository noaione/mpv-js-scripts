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
    // Append the "magick" command to the command line.
    // Sometimes on windows, you cannot really use any magick command without prefixing
    // "magick", if the command failed, you can set this to `yes` in your config.
    append_magick: "no",
    // Resize the final montage into the video height.
    // I recommend keeping this enabled since if you have a 4k video, you don't want to
    // have a montage that is basically 4k * whatever the number of screenshots you have.
    // It would be way too big, so this will resize it back to the video height.
    resize: "yes",
}

interface SubprocessCommand {
    stdout: string | undefined;
    stderr: string | undefined;
    status: number;
}

type CallbackChain = (success: boolean, error: string | undefined) => void;
type FinalCallbackChain = (success: boolean, error: string | undefined, output: string) => void;

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
            mp.msg.info("Creating directory (Unix): " + path);
            mp.command_native({name: "subprocess", playback_only: false, args: ["mkdir", "-p", path]});
        } else {
            mp.msg.info("Creating directory (Windows): " + path);
            mp.command_native({name: "subprocess", playback_only: false, args: ["cmd", "/C", `mkdir ${path}`]});
        }
    }

    deleteFile(path: string) {
        mp.msg.info("Deleting file: " + path);
        if (this.isUnix()) {
            mp.command_native({name: "subprocess", playback_only: false, args: ["rm", path]});
        } else {
            mp.command_native({name: "subprocess", playback_only: false, args: ["cmd", "/C", `del /F /Q ${path}`]});
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

function getOutputDir() {
    const paths = new Pathing();
    const cwd = paths.getCwd();
    if (cwd) {
        mp.msg.info("Using current working directory: " + cwd);
        return paths.fixPath(cwd);
    }

    const lastErr = mp.last_error();
    if (lastErr) {
        mp.msg.error("Could not get current working directory: " + lastErr);
    }

    // Use the screenshot directory as a fallback.
    const screenDir = mp.get_property("screenshot-directory");
    if (screenDir) {
        mp.msg.info("Using screenshot directory as fallback: " + screenDir);
        return paths.fixPath(screenDir);
    }

    const homeDir = mp.command_native(["expand-path", "~~home/"]) as string;
    mp.msg.error(`Could not get screenshot directory, trying to use mpv home directory: ${homeDir}`);
    return paths.fixPath(homeDir);
}

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

function createOutputName(fileName: string) {
    let finalName = fileName.replace(" ", "_");
    const ColRow = `${mosaicOptions.columns}x${mosaicOptions.rows}`;
    const mosaicName = `.mosaic${ColRow}`;
    // Max count is 256 characters, with safety margin to 224
    const testCount = finalName.length + mosaicName.length;
    if (testCount > 224) {
        // Butcher only the finalName that doesn't include the mosaicName yet
        const cutCount = testCount - 224;
        finalName = finalName.slice(0, -cutCount);
    }
    return finalName + mosaicName;
}

function runResize(imgOutput: string, videoHeight: number, callback: CallbackChain) {
    const resizeCmdsBase = [];
    if (mosaicOptions.append_magick.toLowerCase() === "yes") {
        resizeCmdsBase.push("magick");
    }
    const resizeCmds = [
        ...resizeCmdsBase,
        "convert",
        imgOutput,
        "-resize",
        `x${videoHeight}`,
        imgOutput,
    ]
    if (mosaicOptions.resize.toLowerCase() !== "yes") {
        callback(true, undefined);
        return;
    }
    mp.msg.info(`Resizing image to x${videoHeight}: ${imgOutput}`)
    dump(resizeCmds)
    mp.command_native_async(
        {name: "subprocess", playback_only: false, args: resizeCmds},
        (success, _, error) => {
            mp.msg.info(`Resize status: ${success} || ${error}`);
            callback(success, error);
        }
    );
}

function runAnnotation(fileName: string, videoWidth: number, videoHeight: number, duration: string, imgOutput: string, callback: CallbackChain) {
    // annotate text
    const annotateCmdsBase = [];
    if (mosaicOptions.append_magick.toLowerCase() === "yes") {
        annotateCmdsBase.push("magick");
    }
    const annotateCmds = [
        ...annotateCmdsBase,
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
    mp.msg.info(`Annotating image: ${imgOutput}`)
    dump(annotateCmds)
    mp.command_native_async(
        {name: "subprocess", playback_only: false, args: annotateCmds},
        (success, _, error) => {
            mp.msg.info(`Annotate status: ${success} || ${error}`);
            callback(success, error)
        }
    )
}

function createMosaic(screenshots: string[], videoWidth: number, videoHeight: number, fileName: string, duration: string, callback: FinalCallbackChain) {
    const paths = new Pathing();
    const outputDir = getOutputDir();
    const imageMagick = [];
    if (mosaicOptions.append_magick.toLowerCase() === "yes") {
        imageMagick.push("magick");
    }
    const imageMagickArgs = [
        "montage",
        "-geometry",
        `${videoWidth}x${videoHeight}+${mosaicOptions.padding}+${mosaicOptions.padding}`,
    ];
    for (let i = 0; i < screenshots.length; i++) {
        imageMagickArgs.push(screenshots[i]);
    }
    const imgOutput = paths.fixPath(mp.utils.join_path(outputDir, `${createOutputName(fileName)}.${mosaicOptions.format}`));
    imageMagickArgs.push(imgOutput);
    mp.msg.info(`Creating image montage: ${imgOutput}`)
    dump(imageMagickArgs)
    mp.command_native_async(
        {name: "subprocess", playback_only: false, args: imageMagick.concat(imageMagickArgs)},
        (success, _, error) => {
            mp.msg.info(`Montage status: ${success} || ${error}`);
            if (success) {
                runResize(imgOutput, videoHeight, (result2, error2) => {
                    if (!result2) {
                        callback(false, error2, imgOutput);
                    } else {
                        runAnnotation(fileName, videoWidth, videoHeight, duration, imgOutput, (result3, error3) => {
                            callback(result3, error3, imgOutput);
                        });
                    }
                });
            } else {
                callback(false, error, imgOutput)
            }
        }
    );
    
}

function screenshotCycles(startTime: number, timeStep: number, screenshotDir: string) {
    const { rows, columns } = mosaicOptions;

    const screenshots: string[] = [];
    const totalImages = rows * columns;

    for (let i = 1; i <= totalImages; i++) {
        const tTarget = startTime + (timeStep * (i - 1));
        mp.command_native(["seek", tTarget, "absolute", "exact"]);
        // wait until seeking done
        const imagePath = mp.utils.join_path(screenshotDir, `temp_screenshot-${i}.png`);
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

function checkMagick() {
    const cmds = [];
    if (mosaicOptions.append_magick.toLowerCase() === "yes") {
        cmds.push("magick")
    }
    cmds.push("montage");
    cmds.push("--version");
    const res = mp.command_native({name: "subprocess", playback_only: false, args: cmds}) as any;
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
    const mosaicMode = mosaicOptions.mode.toLowerCase();
    if (mosaicMode !== "video" && mosaicMode !== "subtitles" && mosaicMode !== "window") {
        mp.osd_message("Mosaic mode must be either 'video' or 'subtitles' or 'window'");
        return false;
    }
    return true;
}

function sendOSD(message: string, duration: number = 2) {
    const prefix = mp.get_property("osd-ass-cc/0");
    const postfix = mp.get_property("osd-ass-cc/1");

    if (prefix && postfix) {
        mp.osd_message(`${prefix}${message}${postfix}`, duration);
    } else {
        mp.osd_message(message, duration);
    }
}

function main() {
    // create a mosaic of screenshots
    const paths = new Pathing();
    if (!verifyVariables()) {
        return;
    }
    const magickExist = checkMagick();
    if (!magickExist) {
        const tf = paths.isUnix() ? "false" : "true";
        mp.msg.info(`ImageMagick cannot be found, please install it.\nOr you can set append_magick to ${tf} in the script options.`);
        mp.osd_message(`ImageMagick cannot be found, please install it.\nOr you can set append_magick to ${tf} in the script options.`, 5);
        return;
    }
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
    mp.msg.info(`Creating ${mosaicOptions.columns}x${mosaicOptions.rows} mosaic of ${imageCount} screenshots...`);
    // pause video
    const homeDir = mp.command_native(["expand-path", "~~home/"])  as string;
    const screenshotDir = paths.fixPath(mp.utils.join_path(homeDir, "screenshot-mosaic"));
    paths.createDirectory(screenshotDir);
    mp.set_property("pause", "yes");
    const screenshots = screenshotCycles(startTime, timeStep, screenshotDir);
    mp.set_property_number("time-pos", originalTimePos);
    mp.set_property("pause", "no");
    if (screenshots !== undefined) {
        mp.msg.info(`Creating mosaic for ${mosaicOptions.columns}x${mosaicOptions.rows} images...`)
        mp.osd_message("Creating mosaic...", 2);
        createMosaic(screenshots, videoWidth, videoHeight, mp.get_property("filename") as string, videoDuration, (success, error, output) => {
            if (success) {
                mp.msg.info(`Mosaic created for ${mosaicOptions.columns}x${mosaicOptions.rows} images at ${output}...`);
                sendOSD(`Mosaic created!\n{\\b1}${output}{\\b0}`, 5);
            } else {
                mp.msg.error(`Failed to create mosaic for ${mosaicOptions.columns}x${mosaicOptions.rows} images...`);
                mp.msg.error(error);
                mp.osd_message(`Failed to create mosaic for ${mosaicOptions.columns}x${mosaicOptions.rows} images...`, 5);
            }
            // Cleanup
            mp.msg.info("Cleaning up...");
            screenshots.forEach((sspath) => {
                paths.deleteFile(paths.fixPath(sspath));
            })
        });
    }
}

mp.add_key_binding("Ctrl+Alt+s", "screenshot-mosaic", main);

