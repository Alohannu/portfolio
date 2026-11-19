/* ==========================================================================
   Selected Works: Serum-Hero-Video + Bildwechsel bei "ai face serum"
   (Collage, Outtakes, Showroom und Phasen haben eigene Dateien.)
   ========================================================================== */
(function () {
  "use strict";

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  /* ---------- Serum-Hero: spielt, solange er im Bild steht ---------- */
  var video = document.getElementById("swVideo");
  var toggle = document.getElementById("swSoundToggle");

  if (video) {
    var userChoseMute = false;
    var ticking = false;

    function syncToggle() {
      if (toggle) toggle.setAttribute("aria-pressed", video.muted ? "true" : "false");
    }
    function play() {
      if (document.documentElement.classList.contains("is-locked")) return; // Showroom offen
      var pr = video.play();
      if (pr && pr.catch) {
        pr.catch(function () {
          if (!video.muted) { video.muted = true; syncToggle(); }
        });
      }
    }
    function isVisible() {
      var r = video.getBoundingClientRect();
      var vh = window.innerHeight;
      return r.bottom > vh * 0.15 && r.top < vh * 0.85;
    }
    function update() {
      ticking = false;
      if (document.hidden) return;
      if (isVisible()) { if (video.paused) play(); }
      else if (!video.paused) video.pause();
    }
    function request() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }

    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (!video.paused) video.pause(); } else request();
    });

    if (toggle) {
      toggle.addEventListener("click", function () {
        userChoseMute = true;
        video.muted = !video.muted;
        syncToggle();
      });
    }
    /* Ton an, sobald der Nutzer die Seite bedient hat (Autoplay-Regeln). */
    ["pointerdown", "keydown", "touchend"].forEach(function (evt) {
      window.addEventListener(evt, function enable(e) {
        if (toggle && toggle.contains(e.target)) return;
        window.removeEventListener(evt, enable);
        if (!userChoseMute && video.muted && isVisible()) { video.muted = false; syncToggle(); }
      }, { passive: true });
    });

    syncToggle();
    update();
  }

  /* ---------- "ai face serum": Bildwechsel per Scrollfortschritt ---------- */
  var section = document.querySelector(".project--sw");
  var imgs = section ? Array.prototype.slice.call(section.querySelectorAll(".sw-avatar")) : [];
  if (section && imgs.length) {
    var active = -1;
    var tick = false;
    var fadeText = section.querySelector(".fade-in");

    function updateAvatar() {
      tick = false;
      var vh = window.innerHeight;
      if (!vh) return;
      var offset = -section.getBoundingClientRect().top;
      var p = clamp((offset - vh) / (2 * vh), 0, 1); // 100vh Morph, dann 200vh Bildwechsel
      var idx = Math.min(imgs.length - 1, Math.floor(p * imgs.length));
      if (idx !== active) {
        if (active >= 0) imgs[active].classList.remove("is-active");
        imgs[idx].classList.add("is-active");
        active = idx;
      }
    }
    function requestAvatar() {
      if (!tick) { tick = true; requestAnimationFrame(updateAvatar); }
    }
    window.addEventListener("scroll", requestAvatar, { passive: true });
    window.addEventListener("resize", requestAvatar);
    updateAvatar();
  }
})();
