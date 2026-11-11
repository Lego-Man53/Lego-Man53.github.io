# Minecraft Java minimap resource pack

Current larger pack: `nminimap-a7ec6709c9ff.zip`.

SHA-1: `a7ec6709c9ffe4de9af80db1811de54531be4c2c`

The minimap is 512 pixels across instead of 256, using `MAP_SIZE vec2(128*4)` in `assets/nminimap/shaders/include/config.glsl`. Terrain coverage is unchanged. This is the only difference from the smaller fixed pack `nminimap-19876b851747.zip`.

Both include the 26.3 shader correction: initialize `custom`, `uvCoord`, `b_meta`, and `box` before GUI/see-through branches. These values were previously unwritten and caused shader linking failures on the user's Mac. Initializers match NMinimap's older shaders. All four original failing variants linked successfully in a native Mac OpenGL regression test; the smaller corrected map has also been seen working in-game. Source GLSL is included in each ZIP and `fix-java-shader.py` records the shader fix.

Original unpatched pack `nminimap-c18b6e3b7ff8.zip` is retained for reference; it failed to load on the Mac.

Shaders and art: [NMinimap](https://github.com/NezuShin/NMinimap/tree/V1.0.9-quickfix-1), GPL-3.0; see NMINIMAP-LICENSE.txt. [Corresponding upstream source](https://github.com/NezuShin/NMinimap/archive/refs/tags/V1.0.9-quickfix-1.zip) includes the generator and resource assets. No world files, player databases or server credentials are included.

Java only; Bedrock receives a separate pack through Geyser.
