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

// Keep the direct support link ready while the widget waits until it is nearby.
const coffeeTemplate = document.querySelector('#coffee-template');
if (coffeeTemplate && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    const source = coffeeTemplate.content.querySelector('script');
    const script = document.createElement('script');
    for (const attribute of source.attributes) script.setAttribute(attribute.name, attribute.value);
    coffeeTemplate.parentElement.append(script);
  }, { rootMargin: '300px' });
  observer.observe(coffeeTemplate.parentElement);
}
