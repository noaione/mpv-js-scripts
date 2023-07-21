/**
 * This script will take a screenshot of a video and create a mosaic of that said video.
 * It will take a screenshot of determined number of rows and columns, and then create
 * a montage of those screenshots.
 * 
 * This .js file is a compiled version of the .ts file, you can compile it yourself by
 * running `npm run compile:mosaic`.
 * 
 * Created by: N4O#8868 (noaione)
 * License: MIT
 */

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

/**
 * The result of running a subprocess.
 * @typedef {Object} SubprocessResult
 * @property {string | undefined} stdout - The stdout of the command.
 * @property {string | undefined} stderr - The stderr of the command.
 * @property {number} status - The exit code of the command.
 * @property {boolean} killed_by_us - Whether the command was killed by us.
 * @property {string} error_string - The error string of the command.
 */

interface SubprocessResult {
    status: number;
    killed_by_us: boolean;
    error_string: string;
    stderr?: string;
    stdout?: string;
}

/**
 * The callback chain for montage -> resize -> annotate
 * @callback CallbackChain
 * @param {boolean} success - Whether the command was successful.
 * @param {string | undefined} error - The error string of the command.
 */

type CallbackChain = (success: boolean, error: string | undefined) => void;

/**
 * @class Pathing
 */
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
            const unameResult = mp.command_native_async({name: "subprocess", capture_stdout: true, playback_only: false, args: ["uname", "-s"]}) as SubprocessResult;
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

/**
 * Test if a directory is valid.
 * @param {string} path - The path to test.
 * @returns {boolean} - Whether the path is valid.
 */
function testDirectory(path: string): boolean {
    const paths = new Pathing();

    const target = mp.utils.join_path(path, "_mosaic_screenshot_test.bin");
    try {
        mp.utils.write_file(`file://${target}`, "THIS FILE IS CREATED BY MPV SCREENSHOT MOSAIC SCRIPT");
    } catch (e) {
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
function getOutputDir(): string {
    const paths = new Pathing();
    // Use screenshot directory
    const screenDir = mp.get_property("screenshot-directory");
    if (screenDir) {
        const expandScreenDir = mp.command_native(["expand-path", screenDir]) as string;
        const lastError = mp.last_error();
        if (!lastError && testDirectory(expandScreenDir)) {
            mp.msg.info("Using screenshot directory: " + expandScreenDir);
            return paths.fixPath(expandScreenDir);
        }
    }

    // Use mpv home directory as fallback
    const homeDir = mp.command_native(["expand-path", "~~home/"]) as string;
    mp.msg.error(`Could not get screenshot directory, trying to use mpv home directory: ${homeDir}`);
    return paths.fixPath(homeDir);
}

/**
 * Explicitly check if the execution of magick command was successful.
 * Since sometimes a command would just return 0 even if it failed.
 * @param {SubprocessResult} result - The result of the subprocess.
 * @returns {boolean} - Whether the subprocess was successful.
 */
function isMagickSuccess(result: SubprocessResult): [boolean, string] {
    // mpv subprocess actually return success even if magick fails.
    if (result.status !== 0) {
        return [false, result.stderr || ""];
    }

    const stdout = result.stdout || "";
    const stderr = result.stderr || "";

    const errorMsg = (stdout || stderr).replace(/\r?\n/g, "\n");
    return [stdout.indexOf("error/") === -1 && stderr.indexOf("error/") === -1, errorMsg];
}

/**
 * Humanize bytes number to a human readable string.
 * @param {number | undefined} bytes - The number of bytes.
 * @returns {string} - The humanized bytes. e.g. "1.2 MiB" or "?? B" if bytes is undefined.
 */
function humanizeBytes(bytes?: number): string {
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

/**
 * Floor a number.
 * Since there is no Math.floor in mpv scripting, use ~~ instead.
 * @param {number} n - The number to floor.
 * @returns {number} - The floored number.
 */
function floor(n: number): number {
    // no Math module
    return ~~n;
}

/**
 * Pad a number with leading zeros.
 * @param {number} n - The number to pad.
 * @returns {string}
 */
function padZero(n: number): string {
    return n < 10 ? "0" + n : "" + n;
}

/**
 * Format a duration number into HH:MM:SS.
 * @param {number | undefined} seconds - The seconds to format.
 * @returns {string} - The formatted duration.
 */
function formatDurationToHHMMSS(seconds?: number): string {
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

/**
 * Format an output filename with some constraints and extra info.
 * @param {string} fileName - The original filename
 * @returns {string} - The new filename
 */
function createOutputName(fileName: string): string {
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

/**
 * Run the resize command, will be skipped if resize is disabled.
 * @param {string} imgOutput - The image output path.
 * @param {number} videoHeight - The video height.
 * @param {CallbackChain} callback - The callback chain that will be called.
 * @returns {void} - Nothing
 */
function runResize(imgOutput: string, videoHeight: number, callback: CallbackChain): void {
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
        {
            name: "subprocess",
            playback_only: false,
            args: resizeCmds,
            capture_stderr: true,
            capture_stdout: true,
        },
        (_, result, __) => {
            const [success, errorMsg] = isMagickSuccess(result as SubprocessResult);
            mp.msg.info(`Resize status: ${success} || err? ${errorMsg}`);
            callback(success, errorMsg);
        }
    );
}

/**
 * Run the annotation command.
 * @param {string} fileName - The video filename.
 * @param {number} videoWidth - The video width.
 * @param {number} videoHeight - The video height.
 * @param {string} duration - The video duration (pre-formatted).
 * @param {string} imgOutput - The image output path.
 * @param {CallbackChain} callback - The callback chain that will be called.
 * @returns {void} - Nothing
 */
function runAnnotation(
    fileName: string,
    videoWidth: number,
    videoHeight: number,
    duration: string,
    imgOutput: string,
    callback: CallbackChain
): void {
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
        {
            name: "subprocess",
            playback_only: false,
            args: annotateCmds,
            capture_stderr: true,
            capture_stdout: true,
        },
        (_, result, __) => {
            const [success, errorMsg] = isMagickSuccess(result as SubprocessResult);
            mp.msg.info(`Annotate status: ${success} || err? ${errorMsg}`);
            callback(success, errorMsg);
        }
    )
}

/**
 * Run the montagge, resize, and annotate command.
 * @param {string[]} screenshots - The list of screenshots to montage.
 * @param {number} videoWidth - The video width.
 * @param {number} videoHeight - The video height.
 * @param {string} fileName - The video filename.
 * @param {string} duration - The video duration (pre-formatted).
 * @param {string} outputFile - The image output path.
 * @param {CallbackChain} callback - The callback chain that will be called.
 * @returns {void} - Nothing
 */
function createMosaic(
    screenshots: string[],
    videoWidth: number,
    videoHeight: number,
    fileName: string,
    duration: string,
    outputFile: string,
    callback: CallbackChain
): void {
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
    imageMagickArgs.push(outputFile);
    mp.msg.info(`Creating image montage: ${outputFile}`)
    dump(imageMagickArgs)
    mp.command_native_async(
        {
            name: "subprocess",
            playback_only: false,
            args: imageMagick.concat(imageMagickArgs),
            capture_stderr: true,
            capture_stdout: true,
        },
        (_, result, __) => {
            const [success, errorMsg] = isMagickSuccess(result as SubprocessResult);
            mp.msg.info(`Montage status: ${success} || ${errorMsg}`);
            if (success) {
                runResize(outputFile, videoHeight, (result2, error2) => {
                    if (!result2) {
                        callback(false, error2);
                    } else {
                        runAnnotation(fileName, videoWidth, videoHeight, duration, outputFile, (result3, error3) => {
                            callback(result3, error3);
                        });
                    }
                });
            } else {
                callback(false, errorMsg)
            }
        }
    );
    
}

/**
 * Create a collection of screenshots from the video.
 * @param {number} startTime - The start time of the video. (in seconds, relative to video duration)
 * @param {number} timeStep - The time step in-between each screenshot. (in seconds)
 * @param {string} screenshotDir - The temporary folder to be used to save the screenshot.
 * @returns {string[] | undefined} - The list of screenshots created, or undefined if an error occurred.
 */
function screenshotCycles(startTime: number, timeStep: number, screenshotDir: string): string[] | undefined {
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

/**
 * Check if the montage command is available. (also check Magick)
 * @returns {boolean} - True if the montage command is available, false otherwise.
 */
function checkMagick(): boolean {
    const cmds = [];
    if (mosaicOptions.append_magick.toLowerCase() === "yes") {
        cmds.push("magick")
    }
    cmds.push("montage");
    cmds.push("--version");
    const res = mp.command_native({name: "subprocess", playback_only: false, args: cmds}) as any;
    return res.status === 0;
}

/**
 * Check if the variables of an options are all valid.
 * @returns {boolean} - True if all the options are valid, false otherwise.
 */
function verifyVariables(): boolean {
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

/**
 * Send a formatted OSD message that support ASS tags.
 * @param {string} message - The message to send
 * @param {number} duration - The duration (in seconds, default to `2`)
 */
function sendOSD(message: string, duration: number = 2): void {
    const prefix = mp.get_property("osd-ass-cc/0");
    const postfix = mp.get_property("osd-ass-cc/1");

    if (prefix && postfix) {
        mp.osd_message(`${prefix}${message}${postfix}`, duration);
    } else {
        mp.osd_message(message, duration);
    }
}

/**
 * The main execution function, which includes all the check and everything.
 * This should be called immediatly after a macro is executed.
 * @returns {void} - Nothing
 */
function main(): void {
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
        const fileName = mp.get_property("filename") as string;
        const outputDir = getOutputDir();
        const imgOutput = paths.fixPath(mp.utils.join_path(outputDir, `${createOutputName(fileName)}.${mosaicOptions.format}`));

        createMosaic(
            screenshots,
            videoWidth,
            videoHeight,
            fileName,
            videoDuration,
            imgOutput,
            (success, error) => {
            if (success) {
                mp.msg.info(`Mosaic created for ${mosaicOptions.columns}x${mosaicOptions.rows} images at ${imgOutput}...`);
                sendOSD(`Mosaic created!\n{\\b1}${imgOutput}{\\b0}`, 5);
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

