# mpv-js-scripts

A collection of JS mpv scripts that can be used.

To download, open the [dist](dist) folder and just put the `.js` file into your `scripts` folder.

### [`screenshot-mosaic`](dist/screenshot-mosaic.js)

**You need at minimum ImageMagick 7.1.0-48+ or 6.9.12-63+ installed on your system** (especially the `montage` command need to be available)

Create a mosaic of an images like what MPC-HC does.

![Sample](https://p.ihateani.me/qklxfhvu.jpg)

To run, just press `ctrl+alt+s`, it will create a `$fileName.mosaic$colx$row.png` file in either your screenshot folder or the mpv home directory. (`~/.mpv` or `%APPDATA%/mpv`)

You can modify the keybind:
```conf
ctrl+alt+s script-binding screenshot_mosaic/screenshot
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
# Imagemagick folder path, leave empty to use $PATH default
executable_path=
# The fallback font family to be used in imagemagick.
font_family=
```

#### Font Problem

If your file contains any CJK characters, the character will not be included in the actual text.

To fix this, you would need:
1. ImageMagick 7.1.0-48+ or 6.9.12-63+ (this has fix on CSS-style selector)
2. [Noto Sans CJK OTCs](https://github.com/notofonts/noto-cjk/tree/main/Sans#downloading-noto-sans-cjk) or any other font that includes a wide-range of CJK glyphs.

Then, start:
1. Download any font that has a wide-range of support, or any font you want.
2. Run `magick convert -list font | grep "Your Font Name"` to get your font list

An example output would be like this:
```
$ magick convert -list font
Path: Windows Fonts
  Font: Noto-Sans-CJK-JP-&-Noto-Sans-CJK-KR-&-Noto-Sans-CJK-SC-&-Noto-Sans-CJK-TC-&-Noto-Sans-CJK-HK-&-Noto-Sans-Mono-CJK-JP-&-Noto-Sans-Mono-CJK-KR-&-Noto-Sans-Mono-CJK-SC-&-Noto-Sans-Mono-CJK-TC-&-Noto-Sans-Mono-CJK-HK
    family: Noto Sans CJK JP & Noto Sans CJK KR & Noto Sans CJK SC & Noto Sans CJK TC & Noto Sans CJK HK & Noto Sans Mono CJK JP & Noto Sans Mono CJK KR & Noto Sans Mono CJK SC & Noto Sans Mono CJK TC & Noto Sans Mono CJK HK
    style: Normal
    stretch: Normal
    weight: 400
    glyphs: c:\windows\fonts\notosanscjk-regular.ttc
    index: 0
  Font: Noto-Sans-CJK-JP-Black-&-Noto-Sans-CJK-KR-Black-&-Noto-Sans-CJK-SC-Black-&-Noto-Sans-CJK-TC-Black-&-Noto-Sans-CJK-HK-Black
    family: Noto Sans CJK JP Black & Noto Sans CJK KR Black & Noto Sans CJK SC Black & Noto Sans CJK TC Black & Noto Sans CJK HK
    style: Normal
    stretch: Normal
    weight: 900
    glyphs: c:\windows\fonts\notosanscjk-black.ttc
    index: 0
```

Save the `family` part of your prefered fonts.

3. Change `font_family` in your `screenshot-mosaic.conf` into your installed family font
4. Try it.

#### UOSC Support

![Screenshot Mosaic - uosc Menu](https://p.ihateani.me/nfvjqlnf.png)

This script has support for [`uosc`](https://github.com/tomasklaen/uosc)

In your `uosc.conf`, you can add a controls for screenshot-mosaic by adding the following command:
```
<video>command:screenshot_monitor:script-binding screenshot_mosaic/screenshot?Screenshot Mosaic
```
You can add it before the first `gap` so it shows on the left side.

Another way to execute `screnshot-mosaic` is to use the menu where you can configure `screenshot-mosaic` first before executing it.

You can just change the `screenshot_mosaic/screenshot` in above controls command into `screenshot_mosaic/uosc-menu`

You can also put it in your `input.conf` by using the `#!` shorthand:
```
#           script-binding screenshot_mosaic/uosc-menu    #! Screenshot Mosaic
```
