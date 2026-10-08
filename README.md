# Yusuf's website

Personal portfolio at [yusufmm.com](https://yusufmm.com/), hosted with GitHub Pages. Plain HTML, CSS, and JavaScript; no build step.

## Pages

- `/`: photography, featured projects, and social profiles.
- `/flappycar/`: the Flappy Car — Night Drive game, synchronized from [Car-Sim-FlappyBird](https://github.com/Lego-Man53/Car-Sim-FlappyBird).

## Edit

- Homepage content and featured public repositories: `index.html`.
- Instagram and YouTube profile URLs: `socials.js`. Empty values are hidden, never linked to guessed accounts.
- Styling: `styles.css`.
- Photos: `assets/`; originals belong to Yusuf and come from his [Adobe Portfolio gallery](https://iyusuf515253.myportfolio.com/photos). See `assets/PHOTO-SOURCES.md`.
- Domain: `CNAME`; preserve this when updating.

Serve locally with `python3 -m http.server 8000`. Google Fonts has local system-font fallbacks. All photos and illustrations are served locally. The Connect section embeds the official Buy Me a Coffee button for `legoman53`, with a direct support link as a fallback if the widget cannot load.

To update the game, copy its `index.html`, `styles.css`, `game-core.js`, and `game.js` from the game repository into `flappycar/` together. Run the simulation tests in that repository before copying.
