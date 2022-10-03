# mpv-js-scripts

A collection of JS mpv scripts that can be used.

To download, open the dist file and just put the `.js` file into your `scripts` folder.

### [`screenshot-mosaic`](dist/screenshot-mosaic.js)

Create a mosaic of an images like what MPC-HC does.

![Sample](https://p.ihateani.me/gwfvrvmc.png)

To run, just press `ctrl+alt+s`, it will create a `mosaic.png` file in the same folder as your video.

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
```