/* CMO Moving — vanilla canvas confetti bursts in the brand palette.
   Fires on: "Lock in this estimate" (estimate screen), "Yes, reserve it"
   (lock screen), and "Complete booking" (payment screen). Skipped entirely
   under prefers-reduced-motion. */
(function () {
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var COLORS = ['#DE121F', '#DE121F', '#303338', '#ffffff', '#f3ede4'];
  var Z = 90;

  function burst(x, y, count) {
    if (reduced) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:' + Z + ';';
    document.body.appendChild(cv);
    var W = window.innerWidth, H = window.innerHeight;
    cv.width = Math.floor(W * dpr);
    cv.height = Math.floor(H * dpr);
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    var parts = [];
    for (var i = 0; i < count; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.15;
      var sp = 8 + Math.random() * 9;
      parts.push({
        x: x, y: y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        s: 5 + Math.random() * 7,
        c: COLORS[(Math.random() * COLORS.length) | 0],
        r: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.35,
        circle: Math.random() < 0.3,
        life: 1,
        decay: 0.007 + Math.random() * 0.008,
        ph: Math.random() * Math.PI * 2
      });
    }

    var start = performance.now(), last = start;
    function tick(now) {
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      var k = dt * 60;
      ctx.clearRect(0, 0, W, H);
      var alive = false;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.life <= 0 || p.y > H + 40) continue;
        alive = true;
        p.vy += 0.24 * k;
        p.vx *= (1 - 0.008 * k);
        p.vy *= (1 - 0.004 * k);
        p.x += (p.vx + Math.sin(p.ph + now / 240) * 0.9) * k;
        p.y += p.vy * k;
        p.r += p.vr * k;
        p.life -= p.decay * k;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.2));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        if (p.circle) {
          ctx.beginPath();
          ctx.arc(0, 0, p.s / 2.4, 0, 6.2832);
          ctx.fill();
        } else {
          ctx.fillRect(-p.s / 2, -p.s / 3.2, p.s, p.s / 1.6);
        }
        ctx.restore();
      }
      if (alive && now - start < 4500) {
        requestAnimationFrame(tick);
      } else if (cv.parentNode) {
        cv.parentNode.removeChild(cv);
      }
    }
    requestAnimationFrame(tick);
  }

  function fromEl(el, big) {
    if (!el || !el.getBoundingClientRect) return;
    var r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, Math.max(r.top + r.height / 2, 60), big ? 170 : 120);
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var lockBtn = t.closest('[data-screen="cust-estimate"] [data-next="cust-lock"]');
    if (lockBtn) { fromEl(lockBtn, false); return; }
    var yesBtn = t.closest('[data-value="Reserve crew"]');
    if (yesBtn) { fromEl(yesBtn, false); return; }
    var doneBtn = t.closest('#completeBooking');
    if (doneBtn) { fromEl(doneBtn, true); }
  }, true);
})();
