/* =============================================================
   TECRA — interactions (no framework required)
   1. Mobile navigation toggle
   2. DNA double-helix motif (generated, projected in 3D)
   3. Contact form handling
   ============================================================= */
(function () {
  "use strict";

  /* ---------- 1. Mobile navigation ---------- */
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav__toggle");

  if (nav && toggle) {
    toggle.addEventListener("click", function () {
      const open = nav.getAttribute("data-open") === "true";
      nav.setAttribute("data-open", String(!open));
      toggle.setAttribute("aria-expanded", String(!open));
      toggle.setAttribute("aria-label", open ? "Open menu" : "Close menu");
    });

    // Close the menu after choosing a link (mobile)
    nav.querySelectorAll(".nav__menu a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.setAttribute("data-open", "false");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- 2. DNA double-helix, projected in 3D ----------
     A full-bleed horizontal double helix, slightly tilted, in the spirit
     of the original artwork. Two backbone ribbons (phase-shifted by PI),
     each a bundle of fine filaments sheared in phase so the ribbon reads
     as a flat twisting band, PLUS base-pair rungs between the strands so
     it clearly reads as DNA. Every point is computed in 3D, rotated around
     the helix's long axis, tilted, then projected. Depth (z) drives colour,
     opacity and width; geometry is batched into depth layers painted
     back-to-front so the spin reads with real volume. */
  function initHelix() {
    const wrap = document.querySelector(".about__helix");
    const canvas = wrap && wrap.querySelector(".about__helix-canvas");
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext("2d");
    const TWO_PI = Math.PI * 2;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Periwinkle palette: far/back -> near/front.
    const BACK = [96, 110, 190];
    const FRONT = [165, 176, 232];

    // Tuning (calibrated against the reference artwork).
    const FILAMENTS = 16; // filaments per backbone ribbon
    const STEPS = 120; // samples along the length per filament
    const LAYERS = 26; // depth buckets for batched painting
    const SPEED = TWO_PI / 26; // rad/s — slow, ambient spin
    const R_SPREAD = 0.5; // band thickness, as a fraction of amplitude
    const P_SHEAR = 1.5; // phase shear across the band (ribbon twist)
    const TILT = Math.tan((-6 * Math.PI) / 180); // gentle incline
    const RUNGS_PER_TURN = 9; // base-pair density
    const RUNG_SUB = 6; // sub-segments per rung (for depth shading)

    let W = 0,
      H = 0,
      dpr = 1,
      geom = null,
      rot = 0,
      rafId = 0,
      visible = true;

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    // Pre-built per-layer styles (colour/opacity fade back->front).
    const bbStyle = []; // backbone filaments
    const rungStyle = []; // base pairs (a touch more defined)
    for (let b = 0; b < LAYERS; b++) {
      const t = LAYERS === 1 ? 0.5 : b / (LAYERS - 1);
      const r = Math.round(lerp(BACK[0], FRONT[0], t));
      const g = Math.round(lerp(BACK[1], FRONT[1], t));
      const bl = Math.round(lerp(BACK[2], FRONT[2], t));
      bbStyle.push({
        stroke: "rgba(" + r + "," + g + "," + bl + "," + (0.3 + 0.2 * t).toFixed(3) + ")",
        width: 0.9 + 0.8 * t,
      });
      rungStyle.push({
        stroke: "rgba(" + r + "," + g + "," + bl + "," + (0.2 + 0.28 * t).toFixed(3) + ")",
        width: 0.9 + 0.7 * t,
      });
    }

    function resize() {
      const rect = wrap.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";

      const left = -30;
      const right = W + 30;
      const radiusScale = W < 480 ? 0.28 : W < 720 ? 0.32 : 0.34;
      const radiusCap = W < 500 ? 360 : 480;
      const centerY = W < 720 ? H * 0.55 : H * 0.5;
      geom = {
        left,
        right,
        span: right - left,
        cx: W * 0.5,
        cy: centerY,
        radius: Math.min(H, radiusCap) * radiusScale,
        // keep the number of "lenses" proportional to width
        turns: Math.max(1.6, Math.min(3.2, W / 640)),
      };
    }

    // One point on a ribbon filament: rotated about the long axis, tilted.
    function point(s, phase, rOff, pOff) {
      const g = geom;
      const x = g.left + s * g.span;
      const theta = s * g.turns * TWO_PI + phase + pOff + rot;
      const r = g.radius * (1 + rOff);
      const y = g.cy + Math.cos(theta) * r + (x - g.cx) * TILT;
      const z = Math.sin(theta); // -1 (back) .. 1 (front)
      return { x: x, y: y, z: z };
    }

    function bucket(z) {
      let b = ((z + 1) * 0.5 * (LAYERS - 1) + 0.5) | 0;
      if (b < 0) b = 0;
      else if (b >= LAYERS) b = LAYERS - 1;
      return b;
    }

    function draw() {
      const g = geom;
      ctx.clearRect(0, 0, W, H);

      const bb = new Array(LAYERS);
      const rg = new Array(LAYERS);
      for (let i = 0; i < LAYERS; i++) {
        bb[i] = new Path2D();
        rg[i] = new Path2D();
      }

      // Backbone ribbons.
      const phases = [0, Math.PI];
      for (let p = 0; p < 2; p++) {
        for (let f = 0; f < FILAMENTS; f++) {
          const fr = f / (FILAMENTS - 1) - 0.5; // -0.5 .. 0.5
          const rOff = fr * R_SPREAD;
          const pOff = fr * P_SHEAR;
          let prev = point(0, phases[p], rOff, pOff);
          for (let i = 1; i <= STEPS; i++) {
            const cur = point(i / STEPS, phases[p], rOff, pOff);
            const path = bb[bucket((prev.z + cur.z) * 0.5)];
            path.moveTo(prev.x, prev.y);
            path.lineTo(cur.x, cur.y);
            prev = cur;
          }
        }
      }

      // Base-pair rungs (subdivided so each piece sits in its depth layer).
      const nr = Math.round(g.turns * RUNGS_PER_TURN);
      for (let k = 0; k <= nr; k++) {
        const s = k / nr;
        const a = point(s, 0, 0, 0);
        const b = point(s, Math.PI, 0, 0);
        let px = a.x,
          py = a.y,
          pz = a.z;
        for (let j = 1; j <= RUNG_SUB; j++) {
          const t = j / RUNG_SUB;
          const qx = lerp(a.x, b.x, t);
          const qy = lerp(a.y, b.y, t);
          const qz = lerp(a.z, b.z, t);
          const path = rg[bucket((pz + qz) * 0.5)];
          path.moveTo(px, py);
          path.lineTo(qx, qy);
          px = qx;
          py = qy;
          pz = qz;
        }
      }

      // Paint back (faint) to front (brighter): backbones, then rungs.
      for (let b = 0; b < LAYERS; b++) {
        ctx.strokeStyle = bbStyle[b].stroke;
        ctx.lineWidth = bbStyle[b].width;
        ctx.stroke(bb[b]);
      }
      for (let b = 0; b < LAYERS; b++) {
        ctx.strokeStyle = rungStyle[b].stroke;
        ctx.lineWidth = rungStyle[b].width;
        ctx.stroke(rg[b]);
      }
    }

    let last = 0;
    function frame(now) {
      if (!last) last = now;
      rot += ((now - last) / 1000) * SPEED;
      last = now;
      draw();
      rafId = requestAnimationFrame(frame);
    }
    function start() {
      if (rafId || reduceMotion) return;
      last = 0;
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    resize();
    if (reduceMotion) {
      rot = 0.6; // a static angle that already shows the twist
      draw();
    } else {
      start();
    }

    // Pause when scrolled out of view or tab hidden (saves battery).
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start();
        else stop();
      }).observe(wrap);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else if (visible) start();
    });

    // Reflow on resize (debounced).
    let rt = 0;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        resize();
        if (reduceMotion) draw();
      }, 150);
    });
  }

  initHelix();

  /* ---------- 3. Contact form ---------- */
  const form = document.querySelector(".form");

  if (form) {
    const fields = Array.from(form.querySelectorAll("input, select, textarea"));
    const messageField = document.createElement("div");
    messageField.className = "form__message";
    form.appendChild(messageField);

    function clearErrors() {
      fields.forEach(function (field) {
        field.setCustomValidity("");
        const wrapper = field.closest(".field");
        if (wrapper) {
          wrapper.classList.remove("field--error");
          const message = wrapper.querySelector(".field__error");
          if (message) message.textContent = "";
        }
      });
      messageField.textContent = "";
      messageField.className = "form__message";
    }

    function showError(field, text) {
      const wrapper = field.closest(".field");
      if (wrapper) {
        wrapper.classList.add("field--error");
        const message = wrapper.querySelector(".field__error");
        if (message) message.textContent = text;
      }
      field.setCustomValidity(text || "");
    }

    function showFormMessage(text, type) {
      messageField.textContent = text;
      messageField.className = "form__message form__message--" + type;
    }

    function validateField(field) {
      if (field.validity.valueMissing) {
        showError(field, "This field is required.");
        return false;
      }
      if (field.type === "email" && field.validity.typeMismatch) {
        showError(field, "Please enter a valid email address.");
        return false;
      }
      if (field.validity.tooShort) {
        showError(field, "Please enter at least " + field.minLength + " characters.");
        return false;
      }
      return true;
    }

    function validateForm() {
      clearErrors();
      let valid = true;
      fields.forEach(function (field) {
        if (!validateField(field)) {
          valid = false;
        }
      });
      return valid;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!validateForm()) {
        const firstInvalid = form.querySelector(":invalid");
        if (firstInvalid) firstInvalid.focus({ preventScroll: true });
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      if (!submitBtn) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";

      const emailEndpoint = form.getAttribute("action");
      const formData = new FormData(form);
      formData.set("_replyto", form.querySelector("#email").value || "");

      fetch(emailEndpoint, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("Network response was not ok");
          }
          return response.json();
        })
        .then(function () {
          submitBtn.textContent = "Message sent \u2713";
          showFormMessage("Your request has been sent successfully.", "success");
          setTimeout(function () {
            submitBtn.disabled = false;
            submitBtn.innerHTML = "Send my request <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5 12h14M13 6l6 6-6 6\" /></svg>";
            form.reset();
            clearErrors();
          }, 2200);
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = "Send my request";
          showFormMessage("Unable to send your message right now. Please try again later.", "error");
        });
    });
  }
})();