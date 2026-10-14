// Apply the saved theme before first paint to avoid a flash of the wrong theme.
(function () {
  try {
    var pref = localStorage.getItem("tp.theme") || "system";
    var dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (e) {
    document.documentElement.dataset.theme = "light";
  }
})();
