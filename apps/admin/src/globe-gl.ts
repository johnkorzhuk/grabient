/**
 * The WebGL2 tier of the world card.
 *
 * The card has three renderers, each a fallback for the one above: this one,
 * the 2D canvas in globe.ts, and the plate-carrée SVG that ships in the markup.
 * Nothing here is required — `__globeGL` returns null on any failure and the
 * canvas path takes over, so a machine without WebGL2, a lost context, or a
 * shader that fails to link all degrade to a globe that still works.
 *
 * WHY A SHADER AT ALL. The 2D version draws land as ~3,000 arc() calls and
 * shades the body with a radial gradient, which is a per-dot cost for a
 * per-pixel effect: it can tint the sphere but it cannot light one. Moving to a
 * fragment shader makes the sphere analytic — every pixel knows its own surface
 * normal, so lambert shading, a fresnel limb and the atmosphere outside the
 * disc are all one evaluation rather than a stack of composited passes.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not invent geography. The land mask
 * is 34x90 cells at 4 degrees, and no amount of filtering turns that into a
 * coastline — bilinear sampling makes the dot field follow the mask smoothly,
 * which is the same honesty the 2D densifier claims: the spacing is
 * interpolated, the landmass is not.
 *
 * Interaction is NOT here. Drag, hover, hit-testing and the tooltip all stay in
 * globe.ts against its own CPU projection, so the two renderers cannot disagree
 * about where a country is — this module only draws.
 */
export const GLOBE_GL_SCRIPT = String.raw`
(function () {
  if (window.__globeGL) return;

  // Fullscreen triangle pair. The sphere is raycast per fragment, so geometry
  // is just a rectangle for the shader to run over.
  var VERT = [
    "#version 300 es",
    "in vec2 a_pos;",
    "void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }",
  ].join("\n");

  var FRAG = [
    "#version 300 es",
    "precision highp float;",
    "out vec4 fragColor;",
    "uniform vec2 u_res;",
    "uniform vec2 u_center;",
    "uniform float u_radius;",
    "uniform float u_spin;",
    "uniform float u_tilt;",
    "uniform vec3 u_ink;",
    "uniform vec3 u_accent;",
    "uniform vec2 u_dims;",
    "uniform vec3 u_geo;",     // lat0 (top), lon0 (left), cell
    "uniform sampler2D u_land;",
    "const float PI = 3.14159265359;",

    "void main(){",
    // DOM-style pixel coords: y down, matching the CPU projection in globe.ts
    // so the two renderers place a country at the same place.
    "  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);",
    "  vec2 q = (px - u_center) / u_radius;",
    "  float X = q.x;",
    "  float Y = -q.y;",
    "  float rho = length(vec2(X, Y));",

    // Outside the disc: atmosphere only, and deliberately faint. A broad halo
    // makes the planet look like a light source, which competes with the only
    // things on this card that ARE light sources — the countries. Tight falloff,
    // low ceiling: enough to seat the sphere against the card, not enough to
    // read as its own object.
    "  if (rho >= 1.0) {",
    "    float glow = exp(-(rho - 1.0) * 26.0) * 0.20;",
    "    if (glow < 0.004) discard;",
    "    fragColor = vec4(u_accent, glow);",
    "    return;",
    "  }",

    "  float cosc = sqrt(max(0.0, 1.0 - rho * rho));",
    "  float st = sin(u_tilt), ct = cos(u_tilt);",

    // Inverse orthographic (Snyder). The rho terms cancel, which is why there
    // is no guard needed at the centre of the disc.
    "  float lat = asin(clamp(cosc * st + Y * ct, -1.0, 1.0));",
    "  float lon = u_spin + atan(X, cosc * ct - Y * st);",
    "  float latDeg = degrees(lat);",
    "  float lonDeg = degrees(lon);",

    // Cell coordinates in the mask's own grid. Longitude wraps; latitude does
    // not, and a sample off the top or bottom of the band is ocean.
    "  float col = mod((lonDeg - u_geo.y) / u_geo.z, u_dims.x);",
    "  float row = (u_geo.x - latDeg) / u_geo.z;",
    "  float cov = 0.0;",
    "  if (row >= -0.5 && row <= u_dims.y - 0.5) {",
    "    cov = texture(u_land, vec2(col / u_dims.x, row / u_dims.y)).r;",
    "  }",

    // The dot field, at FOUR times the mask's density with a small dot inside
    // each cell. Density is what makes this read as a rendered planet rather
    // than as a chart of blobs, and it is free here — the dots are a pattern
    // evaluated per pixel, not geometry, so 16x the count costs nothing. The
    // mask is still 4 degrees; what is finer is the stipple, not the coastline.
    // fwidth antialiases each dot against the sphere instead of letting it
    // stair-step at the limb.
    "  vec2 grid = vec2(col, row) * 4.0;",
    "  vec2 cell = fract(grid) - 0.5;",
    "  float d = length(cell);",
    "  float aa = max(fwidth(d), 0.0015);",
    "  float dotMask = 1.0 - smoothstep(0.26 - aa, 0.26 + aa, d);",
    "  float land = dotMask * smoothstep(0.30 - 0.10, 0.30 + 0.28, cov);",

    // Lighting. The normal falls straight out of the raycast: X and Y are the
    // tangent components and cosc is the component facing the camera.
    "  vec3 n = vec3(X, Y, cosc);",
    "  vec3 L = normalize(vec3(-0.42, 0.52, 0.80));",
    "  float lambert = max(dot(n, L), 0.0);",
    "  float shade = 0.16 + 0.84 * lambert;",

    // Fresnel limb: bright exactly where the surface turns away from the eye,
    // which is the cue that reads as curvature rather than as a circle.
    "  float fres = pow(1.0 - cosc, 3.2);",

    // The body stays nearly invisible. What reads as a planet here is the
    // STIPPLE curving away, not a filled disc behind it — a body opaque enough
    // to see is also opaque enough to flatten the dots into a sticker.
    "  vec3 col3 = u_ink * (0.30 + 0.70 * shade);",
    "  float alpha = 0.030 + 0.055 * shade;",
    // Land carries a little accent so the geography sits in the same colour
    // family as the traffic without competing with it for brightness.
    "  vec3 landCol = mix(u_ink, u_accent, 0.22);",
    "  col3 = mix(col3, landCol, land);",
    "  alpha = mix(alpha, 0.14 + 0.40 * shade, land);",
    "  col3 = mix(col3, u_accent, fres * 0.35);",
    "  alpha = max(alpha, fres * 0.20);",
    // A hairline at the very edge so the planet has a rim even over ocean.
    "  float edge = smoothstep(0.988, 1.0, rho) * (1.0 - smoothstep(0.999, 1.0, rho));",
    "  alpha = max(alpha, edge * 0.22);",
    "  fragColor = vec4(col3, alpha);",
    "}",
  ].join("\n");

  // Traffic. Instanced billboards rather than another fragment-shader loop: the
  // country count is data-driven, and a loop over a uniform array would cost
  // every pixel on the disc whatever the worst case is.
  var DOT_VERT = [
    "#version 300 es",
    "in vec2 a_corner;",
    "in vec3 a_geo;",          // lat, lon (degrees), radius (map units)
    "out vec2 v_corner;",
    "out float v_face;",
    "uniform vec2 u_res;",
    "uniform vec2 u_center;",
    "uniform float u_radius;",
    "uniform float u_spin;",
    "uniform float u_tilt;",
    "const float RAD = 0.01745329252;",
    "void main(){",
    "  v_corner = a_corner;",
    "  float p = a_geo.x * RAD;",
    "  float l = (a_geo.y - u_spin) * RAD;",
    "  float p0 = u_tilt * RAD;",
    "  float cosc = sin(p0) * sin(p) + cos(p0) * cos(p) * cos(l);",
    "  v_face = cosc;",
    // Behind the planet: collapse the quad rather than branching, so the far
    // side never paints over the near side.
    "  if (cosc <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }",
    "  float sx = u_center.x + u_radius * cos(p) * sin(l);",
    "  float sy = u_center.y - u_radius * (cos(p0) * sin(p) - sin(p0) * cos(p) * cos(l));",
    "  float size = max(1.8, (a_geo.z / 360.0) * u_radius * 2.1) * 3.0;",
    "  vec2 px = vec2(sx, sy) + a_corner * size;",
    "  vec2 clip = vec2(px.x / u_res.x * 2.0 - 1.0, 1.0 - px.y / u_res.y * 2.0);",
    "  gl_Position = vec4(clip, 0.0, 1.0);",
    "}",
  ].join("\n");

  var DOT_FRAG = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 v_corner;",
    "in float v_face;",
    "out vec4 fragColor;",
    "uniform vec3 u_accent;",
    "void main(){",
    "  float d = length(v_corner);",
    "  if (d > 1.0) discard;",
    // A tight bright core inside a wide soft bloom. Against a body this faint
    // the countries are the only lit things on the card, so the bloom is what
    // sells them as emitting; the core is the part you actually point at, and
    // keeping it small is what stops two neighbours merging into one smear.
    "  float bloom = pow(1.0 - d, 3.4) * 0.34;",
    "  float core = 1.0 - smoothstep(0.14, 0.30, d);",
    "  float depth = 0.50 + 0.50 * clamp(v_face, 0.0, 1.0);",
    "  float a = (bloom + core * 0.95) * depth;",
    "  if (a < 0.004) discard;",
    "  fragColor = vec4(u_accent, min(a, 1.0));",
    "}",
  ].join("\n");

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
    return s;
  }

  function link(gl, vsSrc, fsSrc) {
    var vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); return null; }
    return p;
  }

  /**
   * Resolve a CSS colour token to linear 0..1 RGB.
   *
   * The tokens are whatever the stylesheet says — hex today, but oklch() is a
   * colour the 2D path would accept without noticing, and a shader needs
   * numbers. Painting one pixel and reading it back is the only conversion that
   * cannot fall behind the CSS colour syntax.
   */
  function parseColor(value, fallback) {
    try {
      var c = document.createElement("canvas");
      c.width = 1; c.height = 1;
      var g = c.getContext("2d", { willReadFrequently: true });
      g.fillStyle = fallback;
      g.fillStyle = value;
      g.fillRect(0, 0, 1, 1);
      var d = g.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255];
    } catch (e) {
      return [0.44, 0.44, 0.48];
    }
  }

  window.__globeGL = function (root, cfg) {
    var canvas = root.querySelector("canvas");
    if (!canvas || !cfg || !cfg.land || !cfg.land.length) return null;

    var gl;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
        depth: false,
        powerPreference: "low-power",
      });
    } catch (e) { return null; }
    if (!gl) return null;

    var sphere = link(gl, VERT, FRAG);
    var dots = link(gl, DOT_VERT, DOT_FRAG);
    if (!sphere || !dots) return null;

    // The mask as an R8 texture. LINEAR + REPEAT on S is what makes the dot
    // field follow the coastline instead of stepping cell by cell, and the wrap
    // is why the Pacific seam does not show.
    var cols = cfg.land[0].length, rows = cfg.land.length;
    var mask = new Uint8Array(cols * rows);
    for (var r = 0; r < rows; r++) {
      var line = cfg.land[r];
      for (var c = 0; c < cols; c++) mask[r * cols + c] = line.charAt(c) === "1" ? 255 : 0;
    }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, cols, rows, 0, gl.RED, gl.UNSIGNED_BYTE, mask);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    var corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    var list = cfg.dots || [];
    var geo = new Float32Array(list.length * 3);
    for (var i = 0; i < list.length; i++) {
      geo[i * 3] = list[i].la;
      geo[i * 3 + 1] = list[i].lo;
      geo[i * 3 + 2] = list[i].r;
    }
    var geoBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, geoBuf);
    gl.bufferData(gl.ARRAY_BUFFER, geo, gl.STATIC_DRAW);

    var sphereVao = gl.createVertexArray();
    gl.bindVertexArray(sphereVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    var aPos = gl.getAttribLocation(sphere, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var dotVao = gl.createVertexArray();
    gl.bindVertexArray(dotVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    var aCorner = gl.getAttribLocation(dots, "a_corner");
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, geoBuf);
    var aGeo = gl.getAttribLocation(dots, "a_geo");
    gl.enableVertexAttribArray(aGeo);
    gl.vertexAttribPointer(aGeo, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(aGeo, 1);
    gl.bindVertexArray(null);

    function u(p, name) { return gl.getUniformLocation(p, name); }
    var US = {
      res: u(sphere, "u_res"), center: u(sphere, "u_center"), radius: u(sphere, "u_radius"),
      spin: u(sphere, "u_spin"), tilt: u(sphere, "u_tilt"), ink: u(sphere, "u_ink"),
      accent: u(sphere, "u_accent"), dims: u(sphere, "u_dims"), geo: u(sphere, "u_geo"),
      land: u(sphere, "u_land"),
    };
    var UD = {
      res: u(dots, "u_res"), center: u(dots, "u_center"), radius: u(dots, "u_radius"),
      spin: u(dots, "u_spin"), tilt: u(dots, "u_tilt"), accent: u(dots, "u_accent"),
    };

    var ink = [0.44, 0.44, 0.48], accent = [0.16, 0.47, 0.84];
    var W = 0, H = 0, CX = 0, CY = 0, R = 0, lost = false;

    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); lost = true; });

    return {
      lost: function () { return lost; },
      setTheme: function (inkCss, accentCss) {
        ink = parseColor(inkCss, "#71717b");
        accent = parseColor(accentCss, "#2a78d6");
      },
      resize: function (w, h, dpr, cx, cy, radius) {
        W = w * dpr; H = h * dpr;
        canvas.width = Math.round(W);
        canvas.height = Math.round(H);
        CX = cx * dpr; CY = cy * dpr; R = radius * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);
      },
      draw: function (spin, tilt) {
        if (lost) return false;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(sphere);
        gl.bindVertexArray(sphereVao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(US.land, 0);
        gl.uniform2f(US.res, canvas.width, canvas.height);
        gl.uniform2f(US.center, CX, CY);
        gl.uniform1f(US.radius, R);
        gl.uniform1f(US.spin, spin * Math.PI / 180);
        gl.uniform1f(US.tilt, tilt * Math.PI / 180);
        gl.uniform3fv(US.ink, ink);
        gl.uniform3fv(US.accent, accent);
        gl.uniform2f(US.dims, cols, rows);
        gl.uniform3f(US.geo, cfg.lat0, cfg.lon0, cfg.cell);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        if (list.length) {
          gl.useProgram(dots);
          gl.bindVertexArray(dotVao);
          gl.uniform2f(UD.res, canvas.width, canvas.height);
          gl.uniform2f(UD.center, CX, CY);
          gl.uniform1f(UD.radius, R);
          gl.uniform1f(UD.spin, spin);
          gl.uniform1f(UD.tilt, tilt);
          gl.uniform3fv(UD.accent, accent);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, list.length);
        }
        gl.bindVertexArray(null);
        return true;
      },
    };
  };
})();
`;
