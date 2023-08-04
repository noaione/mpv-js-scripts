# mpv-js-scripts

A collection of JS mpv scripts that can be used.

To download, open the [dist](dist) folder and just put the `.js` file into your `scripts` folder.

### [`screenshot-mosaic`](dist/screenshot-mosaic.js)

**You need ImageMagick installed on your system** (especially the `montage` command need to be available)

Create a mosaic of an images like what MPC-HC does.

![Sample](https://p.ihateani.me/qklxfhvu.jpg)

To run, just press `ctrl+alt+s`, it will create a `$fileName.mosaic$colx$row.png` file in either your screenshot folder or the mpv home directory. (`~/.mpv` or `%APPDATA%/mpv`)

You can modify the keybind:
```conf
ctrl+alt+s script-binding screenshot-mosaic
```

You can also modify the configuration by adding `screenshot-mosaic.conf` on your `script-opts` folder:
```conf
# Number of rows for screenshot
rows=3
# Number of columns for screenshot
columns=4
# Padding between images/screenshots (in pixels)
padding=10
# Output format (jpg/png)
format=png
# Screenshot mode (video/subtitles/window)
# --> video: Screenshot the video only
# --> subtitles: Screenshot the video + subs
# --> window: Screenshot the whole window, including the UI
mode=video
# Append the "magick" command to the command line.
# Sometimes on windows, you cannot really use any magick command without prefixing
# "magick", if the command failed, you can set this to `yes` to prepend the command with `magick`
append_magick=no
# Resize the final montage into the video height.
# ---
# I recommend keeping this enabled since if you have a 4k video, you don't want to
# have a montage that is basically 4k * whatever the number of screenshots you have.
# It would be way too big, so this will resize it back to the video height.
resize=yes
# The quality of the final montage image.
quality=90
```