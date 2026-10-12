/* CMO Moving loader logo — TSL particle morph (technique after motion.dev's
   js-three-tsl example, hand-rolled: no Motion dependency).
   Particles sampled from logo.jpg form the mark, swirl into a turbulent globe
   on press/hold, and spring back on release. Falls back to the static <img>
   when WebGPU/TSL/the image is unavailable, or under prefers-reduced-motion. */
import * as THREE from 'three/webgpu';
import { attribute, cos, mix, positionLocal, sin, time, uniform, vec3 } from 'three/tsl';

(function () {
  var img = document.querySelector('img.brandlogo');
  if (!img) return;
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduced || !('gpu' in navigator)) return;

  var stage = document.createElement('div');
  stage.className = 'logo-stage';
  stage.setAttribute('aria-hidden', 'true');
  var canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'CMO Moving logo — press and hold to scatter it');
  canvas.tabIndex = 0;
  stage.appendChild(canvas);
  img.parentNode.insertBefore(stage, img);

  var COLS = 160;
  var WHITE_CUT = 0.93;

  function lum(r, g, b) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }

  async function boot() {
    var logo = new Image();
    logo.src = 'logo.jpg';
    await logo.decode();
    var aspect = (logo.naturalWidth || 1284) / (logo.naturalHeight || 723);
    var rows = Math.max(8, Math.round(COLS / aspect));

    var sc = document.createElement('canvas');
    sc.width = COLS; sc.height = rows;
    var sctx = sc.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(logo, 0, 0, COLS, rows);
    var data = sctx.getImageData(0, 0, COLS, rows).data;

    var samples = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < COLS; c++) {
        var px = (r * COLS + c) * 4;
        if (lum(data[px], data[px + 1], data[px + 2]) > WHITE_CUT) continue;
        samples.push({ c: c, r: r, R: data[px], G: data[px + 1], B: data[px + 2] });
      }
    }
    if (!samples.length) return;

    var n = samples.length;
    var LOGO_W = 1.7, LOGO_H = LOGO_W / aspect, GLOBE_R = 0.62;

    var imagePos = new Float32Array(n * 3);
    var globePos = new Float32Array(n * 3);
    var colours = new Float32Array(n * 3);
    var phases = new Float32Array(n);
    var speeds = new Float32Array(n);
    var col = new THREE.Color();
    var GA = Math.PI * (3 - Math.sqrt(5));
    var tilt = -0.28, tc = Math.cos(tilt), ts = Math.sin(tilt);

    for (var i = 0; i < n; i++) {
      var s = samples[i], o = i * 3;
      imagePos[o] = ((s.c + 0.5) / COLS - 0.5) * LOGO_W;
      imagePos[o + 1] = (0.5 - (s.r + 0.5) / rows) * LOGO_H;
      imagePos[o + 2] = 0;
      var y = 1 - (i / Math.max(n - 1, 1)) * 2;
      var rad = Math.sqrt(Math.max(0, 1 - y * y));
      var th = GA * i;
      var sx = Math.cos(th) * rad, sz = Math.sin(th) * rad;
      globePos[o] = sx * GLOBE_R;
      globePos[o + 1] = (y * tc - sz * ts) * GLOBE_R;
      globePos[o + 2] = (y * ts + sz * tc) * GLOBE_R;
      col.setRGB(s.R / 255, s.G / 255, s.B / 255, THREE.SRGBColorSpace);
      colours[o] = col.r; colours[o + 1] = col.g; colours[o + 2] = col.b;
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 0.7 + Math.random() * 0.35;
    }

    var base = new THREE.PlaneGeometry(1, 1);
    var geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    geo.instanceCount = n;
    geo.setAttribute('imagePosition', new THREE.InstancedBufferAttribute(imagePos, 3));
    geo.setAttribute('globePosition', new THREE.InstancedBufferAttribute(globePos, 3));
    geo.setAttribute('colour', new THREE.InstancedBufferAttribute(colours, 3));
    geo.setAttribute('phase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute('speed', new THREE.InstancedBufferAttribute(speeds, 1));

    var globe = uniform(1);
    var imagePosition = attribute('imagePosition');
    var spherePosition = attribute('globePosition');
    var phase = attribute('phase');
    var speed = attribute('speed');
    var ps = LOGO_W / COLS * 1.02;
    var particleSize = uniform(new THREE.Vector2(ps, ps));
    var turbulence = vec3(
      sin(time.mul(speed.add(0.6)).add(phase)).mul(0.045),
      cos(time.mul(speed.add(0.37)).add(phase.mul(1.71))).mul(0.035),
      sin(time.mul(speed.add(0.22)).add(phase.mul(2.13))).mul(0.045)
    );
    var mat = new THREE.MeshBasicNodeMaterial({ toneMapped: false });
    mat.colorNode = attribute('colour');
    var center = mix(imagePosition, spherePosition.add(turbulence), globe);
    mat.positionNode = center.add(vec3(positionLocal.xy.mul(particleSize), 0));
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;

    var tex = new THREE.Texture(logo);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    var photoMat = new THREE.MeshBasicMaterial({
      map: tex, toneMapped: false, transparent: true,
      opacity: 0, depthWrite: false, depthTest: false
    });
    var photo = new THREE.Mesh(new THREE.PlaneGeometry(LOGO_W, LOGO_H), photoMat);
    photo.renderOrder = 1;
    photo.frustumCulled = false;

    var renderer = new THREE.WebGPURenderer({ canvas: canvas, antialias: true, alpha: true });
    await renderer.init();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    var scene = new THREE.Scene();
    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 4;
    scene.add(mesh);
    scene.add(photo);

    function resize() {
      var w = Math.max(stage.clientWidth, 1), h = Math.max(stage.clientHeight, 1);
      var a = w / h;
      renderer.setSize(w, h, false);
      camera.left = -a; camera.right = a; camera.top = 1; camera.bottom = -1;
      camera.updateProjectionMatrix();
    }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
    resize();

    var v = 1, vel = 0, target = 1, k = 55, c = 16;
    var holding = false, settled = false;
    function pressOn() { holding = true; target = 1; k = 120; c = 18; }
    function pressOff() { if (!holding) return; holding = false; target = 0; k = 70; c = 16; }
    canvas.addEventListener('pointerdown', pressOn);
    window.addEventListener('pointerup', pressOff);
    canvas.addEventListener('pointercancel', pressOff);
    canvas.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pressOn(); }
    });
    canvas.addEventListener('keyup', pressOff);

    function hiRes(a) {
      var t = Math.min(1, Math.max(0, (a - 0.005) / 0.03));
      return 1 - t * t * (3 - 2 * t);
    }

    var visible = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(stage);
    }

    var firstFrame = false, last = performance.now(), startAt = last + 900;
    var frames = 0, gpuOk = false;
    renderer.setAnimationLoop(function () {
      if (!visible) { last = performance.now(); return; }
      var now = performance.now();
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!settled && !holding && now >= startAt) settled = true;
      if (settled && target === 1 && !holding) target = 0;
      var F = -k * (v - target) - c * vel;
      vel += F * dt;
      v += vel * dt;
      globe.value = v;
      photoMat.opacity = hiRes(v);
      renderer.render(scene, camera);
      frames++;
      if (!gpuOk && frames === 90) {
        try { gpuOk = renderer.info.render.triangles > 0; } catch (e) { gpuOk = false; }
        if (!gpuOk) {
          try { renderer.setAnimationLoop(null); } catch (e) {}
          if (stage.parentNode) stage.parentNode.removeChild(stage);
          img.classList.remove('fx-hidden');
          return;
        }
      }
      if (!firstFrame) {
        firstFrame = true;
        img.classList.add('fx-hidden');
        stage.classList.add('on');
      }
    });
  }

  boot().catch(function () {
    if (stage.parentNode) stage.parentNode.removeChild(stage);
    img.classList.remove('fx-hidden');
  });
})();
