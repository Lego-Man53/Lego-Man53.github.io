// Add verified profile URLs here; unset profiles remain hidden instead of linking elsewhere.
const socialProfiles = {
  instagram: "https://www.instagram.com/lego.man515253/",
  youtube: "https://www.youtube.com/@legoman5253",
};
for (const [name, url] of Object.entries(socialProfiles)) {
  if (!url) continue;
  const link = document.querySelector(`[data-social="${name}"]`);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.hidden = false;
}
