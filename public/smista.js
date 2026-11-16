// BajujuDate: manda ognuno nel posto giusto.
// Android -> app su Google Play. iPhone/iPad -> web app /date/. Computer -> pagina BajujuDate con entrambe le opzioni.
(function () {
  var ua = navigator.userAgent || "";
  var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(ua);
  var PLAY = "https://play.google.com/store/apps/details?id=it.amiva.app";
  var root = document.documentElement;
  if (ios) root.classList.add("is-ios");
  if (android) root.classList.add("is-android");
  if (!ios && !android) return;

  // Home «Il mondo Bajuju»: la scheda BajujuDate porta subito all'app giusta.
  var card = document.querySelector(".app-card.date");
  if (card) {
    card.href = android ? PLAY : "/date/";
    var go = card.querySelector(".go");
    if (go) go.textContent = android ? "Scarica l'app" : "Apri BajujuDate";
  }

  // Pagina BajujuDate: un solo pulsante, quello del proprio telefono.
  var btns = document.querySelectorAll(".btn");
  for (var i = 0; i < btns.length; i++) {
    var b = btns[i];
    if (ios && b.href && b.href.indexOf("play.google.com") !== -1) b.style.display = "none";
    if (android && b.classList.contains("iphone")) b.style.display = "none";
    if (ios && b.classList.contains("iphone")) {
      b.textContent = "Apri BajujuDate";
      b.style.background = "var(--red, #C8102E)";
      b.style.color = "#FFFFFF";
    }
  }
  var tip = document.querySelector(".iphone-tip");
  if (tip && android) tip.style.display = "none";
})();
