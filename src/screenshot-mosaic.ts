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

const scriptName = mp.get_script_name();
const uoscMenuName = `${scriptName}_uosc_menu`;

type MosaicOptions = {
    rows: number;
    columns: number;
    padding: number;
    format: "png" | "jpg" | "webp";
    mode: "video" | "subtitles" | "window";
    append_magick: "yes" | "no";
    resize: "yes" | "no";
    quality: number;
}

type MinimalMosaicOptions = Omit<MosaicOptions, "append_magick">;

const mosaicOptions: MosaicOptions = {
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

type CallbackChainScreenshot = (success: boolean, error: string | undefined, screenshots: string[]) => void;

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
 * @param {MinimalMosaicOptions} options - The options to use
 * @returns {string} - The new filename
 */
function createOutputName(fileName: string, options: MinimalMosaicOptions): string {
    let finalName = fileName.replace(" ", "_");
    const ColRow = `${options.columns}x${options.rows}`;
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
 * @param {MosaicOptions} options - The options to use.
 * @param {CallbackChain} callback - The callback chain that will be called.
 * @returns {void} - Nothing
 */
function runResize(imgOutput: string, videoHeight: number, options: MosaicOptions, callback: CallbackChain): void {
    const resizeCmdsBase = [];
    if (options.append_magick.toLowerCase() === "yes") {
        resizeCmdsBase.push("magick");
    }
    const resizeCmds = [
        ...resizeCmdsBase,
        "convert",
        `${imgOutput}.montage.png`,
        "-resize",
        `x${videoHeight}`,
        `${imgOutput}.montage.png`,
    ]
    if (options.resize.toLowerCase() !== "yes") {
        callback(true, undefined);
        return;
    }
    mp.msg.info(`Resizing image to x${videoHeight}: ${imgOutput}.montage.png`)
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
 * @param {MosaicOptions} options - The options to use.
 * @param {CallbackChain} callback - The callback chain that will be called.
 * @returns {void} - Nothing
 */
function runAnnotation(
    fileName: string,
    videoWidth: number,
    videoHeight: number,
    duration: string,
    imgOutput: string,
    options: MosaicOptions,
    callback: CallbackChain
): void {
    // annotate text
    const annotateCmdsBase = [];
    if (options.append_magick.toLowerCase() === "yes") {
        annotateCmdsBase.push("magick");
    }
    const annotateCmds = [
        ...annotateCmdsBase,
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

        `${imgOutput}.montage.png`,
        "-append",
        "-quality",
        `${options.quality}%`,
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
 * @param {MosaicOptions} options - The options to use.
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
    options: MosaicOptions,
    callback: CallbackChain
): void {
    const imageMagick = [];
    if (options.append_magick.toLowerCase() === "yes") {
        imageMagick.push("magick");
    }
    const imageMagickArgs = [
        "montage",
        "-geometry",
        `${videoWidth}x${videoHeight}+${options.padding}+${options.padding}`,
    ];
    for (let i = 0; i < screenshots.length; i++) {
        imageMagickArgs.push(screenshots[i]);
    }
    imageMagickArgs.push(`${outputFile}.montage.png`);
    mp.msg.info(`Creating image montage: ${outputFile}.montage.png`)
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
                runResize(outputFile, videoHeight, options, (result2, error2) => {
                    if (!result2) {
                        callback(false, error2);
                    } else {
                        runAnnotation(fileName, videoWidth, videoHeight, duration, outputFile, options, (result3, error3) => {
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
 * @param {MosaicOptions} options - The options to use.
 * @param {CallbackChainScreenshot} callback - The callback chain that will be called.
 */
function screenshotCycles(startTime: number, timeStep: number, screenshotDir: string, options: MosaicOptions, callback: CallbackChainScreenshot): void {
    const { rows, columns } = options;

    const screenshots: string[] = [];
    const totalImages = rows * columns;

    // callback hell...
    function callbackScreenshot(counter: number, screenshots: string[]) {
        mp.command_native_async(["seek", (startTime + (timeStep * (counter - 1))), "absolute", "exact"], (success, _, error) => {
            if (!success) {
                callback(false, error, []);
                return;
            }

            const imagePath = mp.utils.join_path(screenshotDir, `temp_screenshot-${counter}.png`);
            mp.command_native_async(["screenshot-to-file", imagePath, options.mode], (success, _, error) => {
                if (!success) {
                    callback(false, error, screenshots);
                }
    
                // if counter is equal to totalImages, we are done
                if (counter >= totalImages) {
                    callback(true, undefined, screenshots);
                    return;
                }

                // if not, loop again.
                callbackScreenshot(counter + 1, [...screenshots, imagePath]);
            })
        })
    }

    callbackScreenshot(1, screenshots);
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
 * @param {MosaicOptions} options - The options to check.
 * @returns {boolean} - True if all the options are valid, false otherwise.
 */
function verifyVariables(options: MosaicOptions): boolean {
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
    const mosaicMode = options.mode.toLowerCase();
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
 * 
 * @param {MosaicOptions} options - Options
 * @returns {void} - Nothing
 */
function entrypoint(options: MosaicOptions): void {
    // create a mosaic of screenshots
    const paths = new Pathing();
    if (!verifyVariables(options)) {
        return;
    }
    const magickExist = checkMagick();
    if (!magickExist) {
        const tf = paths.isUnix() ? "false" : "true";
        mp.msg.info(`ImageMagick cannot be found, please install it.\nOr you can set append_magick to ${tf} in the script options.`);
        mp.osd_message(`ImageMagick cannot be found, please install it.\nOr you can set append_magick to ${tf} in the script options.`, 5);
        return;
    }
    const imageCount = options.rows * options.columns;
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
    mp.msg.info("  Rows: " + options.rows);
    mp.msg.info("  Columns: " + options.columns);
    mp.msg.info("  Padding: " + options.padding);
    mp.msg.info("  Format: " + options.format);
    mp.msg.info("  Video Length: " + videoLength);
    mp.msg.info("  Video Width: " + videoWidth);
    mp.msg.info("  Video Height: " + videoHeight);
    const videoDuration = formatDurationToHHMMSS(videoLength);

    // we want to start at 10% of the video length and end at 90%
    const startTime = videoLength * 0.1;
    const endTime = videoLength * 0.9;
    const timeStep = (endTime - startTime) / (imageCount - 1);
    mp.osd_message(`Creating ${options.columns}x${options.rows} mosaic of ${imageCount} screenshots...`, 2);
    mp.msg.info(`Creating ${options.columns}x${options.rows} mosaic of ${imageCount} screenshots...`);
    // pause video
    const homeDir = mp.command_native(["expand-path", "~~home/"])  as string;
    const screenshotDir = paths.fixPath(mp.utils.join_path(homeDir, "screenshot-mosaic"));
    paths.createDirectory(screenshotDir);
    mp.set_property("pause", "yes");

    // Take screenshot and put it in callback to createMosaic
    screenshotCycles(startTime, timeStep, screenshotDir, options, (success, error, screenshots) => {
        if (!success) {
            mp.msg.error("Failed to create screenshots...");
            mp.msg.error(error);
            mp.osd_message("Failed to create screenshots...", 5);
            return;
        }

        mp.set_property_number("time-pos", originalTimePos);
        mp.set_property("pause", "no");
        if (screenshots.length > 0) {
            mp.msg.info(`Creating mosaic for ${options.columns}x${options.rows} images...`)
            mp.osd_message("Creating mosaic...", 2);
            const fileName = mp.get_property("filename") as string;
            const outputDir = getOutputDir();
            const imgOutput = paths.fixPath(mp.utils.join_path(outputDir, `${createOutputName(fileName, options)}.${options.format}`));
    
            createMosaic(
                screenshots,
                videoWidth,
                videoHeight,
                fileName,
                videoDuration,
                imgOutput,
                options,
                (success, error) => {
                if (success) {
                    mp.msg.info(`Mosaic created for ${options.columns}x${options.rows} images at ${imgOutput}...`);
                    sendOSD(`Mosaic created!\n{\\b1}${imgOutput}{\\b0}`, 5);
                } else {
                    mp.msg.error(`Failed to create mosaic for ${options.columns}x${options.rows} images...`);
                    mp.msg.error(error);
                    mp.osd_message(`Failed to create mosaic for ${options.columns}x${options.rows} images...`, 5);
                }
                // Cleanup
                mp.msg.info("Cleaning up...");
                screenshots.forEach((sspath) => {
                    paths.deleteFile(paths.fixPath(sspath));
                });
                paths.deleteFile(paths.fixPath(`${imgOutput}.montage.png`));
            });
        }
    })
}

mp.add_key_binding("Ctrl+Alt+s", "screenshot", () => {
    entrypoint(mosaicOptions);
});

/** UOSC Related Code */

const UOSCState: MinimalMosaicOptions = {
    rows: 3,
    columns: 4,
    padding: 10,
    format: "png",
    mode: "video",
    resize: "yes",
    quality: 90,
}

type UOSCDispatchData = {
    key: string;
    value: string;
    format: string;
}

function resetStateWithConfig() {
    for (const key in UOSCState) {
        // @ts-expect-error
        UOSCState[key as keyof MinimalMosaicOptions] = mosaicOptions[key as keyof MosaicOptions];
    }
}

function createUOSCMenu(): Menu {
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
                value: `script-message-to ${scriptName} uosc-menu-reset`,
            },
            {
                title: "Create Mosaic Screenshot",
                icon: "screenshot_monitor",
                value: `script-message-to ${scriptName} uosc-menu-execute`,
                keep_open: false,
            }
        ]
    }
}

function uoscUpdateDispatch<
    T extends keyof MinimalMosaicOptions = keyof MinimalMosaicOptions,
>(key: T, value: MinimalMosaicOptions[T]): string {
    const jsonData = JSON.stringify({
        key,
        value: String(value),
        format: typeof value,
    } as UOSCDispatchData);
    return `script-message-to ${scriptName} uosc-menu-update ${jsonData}`;
}

function uoscUpdateConsume(rawData: unknown) {
    if (typeof rawData !== "string") return;
    const {key, value, format} = JSON.parse(rawData) as UOSCDispatchData;
    if (key in UOSCState) {
        if (format === "number") {
            const parsed = parseInt(value);
            if (!isNaN(parsed)) {
                // @ts-expect-error
                UOSCState[key as keyof MinimalMosaicOptions] = parsed;
            }
        } else if (format === "string") {
            // @ts-expect-error
            UOSCState[key as keyof MinimalMosaicOptions] = value;
        } else if (format === "boolean") {
            // @ts-expect-error
            UOSCState[key as keyof MinimalMosaicOptions] = value === "true" ? "yes" : "no";
        }
    }
    const menu = createUOSCMenu();
    mp.commandv("script-message-to", "uosc", "update-menu", JSON.stringify(menu));
}

mp.add_key_binding(null, "uosc-menu", () => {
    const menu = createUOSCMenu();
    mp.commandv("script-message-to", "uosc", "open-menu", JSON.stringify(menu));
})

mp.register_script_message("uosc-menu-update", uoscUpdateConsume)
mp.register_script_message("uosc-menu-reset", () => {
    resetStateWithConfig();
    const menu = createUOSCMenu();
    mp.commandv("script-message-to", "uosc", "update-menu", JSON.stringify(menu));
})
mp.register_script_message("uosc-menu-execute", () => {
    const mergedConfig = {...mosaicOptions, ...UOSCState};
    resetStateWithConfig();
    entrypoint(mergedConfig);
})