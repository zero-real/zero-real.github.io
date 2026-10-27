/* Apply a saved theme choice before first paint. Without one, CSS follows prefers-color-scheme. */
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
