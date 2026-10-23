let detector, method, background, silhouette, csrf;
const surface = new OffscreenCanvas(480, 360),
  context = surface.getContext("2d", { willReadFrequently: true });
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      method = data.method;
      if (method === "yolo") {
        const auth = await fetch("/api/auth/status").then((r) => r.json());
        if (!auth.authenticated) throw Error("AUTH_REQUIRED");
        csrf = auth.csrf;
      } else if (method === "ai") {
        // Predeclare the legacy Babel runtime global so its strict-mode assignment
        // does not fall back to Function(...). CSP stays free of unsafe-eval.
        self.regeneratorRuntime = undefined;
        importScripts(
          "/static/object-assets/tf.min.js",
          "/static/object-assets/coco-ssd.min.js",
        );
        await tf.setBackend("cpu");
        await tf.ready();
        detector = await cocoSsd.load({
          base: "lite_mobilenet_v2",
          modelUrl: "/static/object-assets/model/model.json",
        });
      } else {
        ({ silhouette } = await import("/static/object-core.mjs"));
      }
      self.postMessage({ type: "ready" });
    } else if (data.type === "frame" || data.type === "background") {
      const started = performance.now();
      let result = [];
      try {
        context.drawImage(data.frame, 0, 0, 480, 360);
        if (method === "yolo") {
          const blob = await surface.convertToBlob({
            type: "image/jpeg",
            quality: 0.75,
          });
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (const b of bytes) binary += String.fromCharCode(b);
          const response = await fetch("/api/objects", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-FaceGate-Lab": "local",
              "X-CSRF-Token": csrf,
            },
            body: JSON.stringify({ image: btoa(binary) }),
          });
          if (!response.ok)
            throw Error("YOLO modelini və serveri yoxla: " + response.status);
          result = (await response.json()).objects;
        } else if (method === "ai")
          result = (
            await detector.detect(context.getImageData(0, 0, 480, 360), 6, 0.6)
          ).map((p) => ({ ...p, label: p.class }));
        else {
          const small = new OffscreenCanvas(240, 180),
            c = small.getContext("2d", { willReadFrequently: true });
          c.drawImage(surface, 0, 0, 240, 180);
          const pixels = c.getImageData(0, 0, 240, 180).data;
          if (data.type === "background")
            background = new Uint8ClampedArray(pixels);
          else if (background)
            result = silhouette(pixels, background, 240, 180).map((p) => ({
              ...p,
              bbox: p.bbox.map((n) => n * 2),
            }));
        }
        self.postMessage({
          type: "objects",
          objects: result,
          elapsed: performance.now() - started,
          needsBackground: method === "geometry" && !background,
          backgroundSaved: data.type === "background",
        });
      } finally {
        data.frame.close();
      }
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: String(error.message).slice(0, 240),
    });
  }
};
