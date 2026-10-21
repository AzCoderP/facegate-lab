// Classic worker: MediaPipe's WASM loader uses importScripts internally.
let hand;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const { FilesetResolver, HandLandmarker } = await import(
        "/static/gesture-assets/vision_bundle.mjs"
      );
      hand = await HandLandmarker.createFromOptions(
        await FilesetResolver.forVisionTasks("/static/gesture-assets/wasm"),
        {
          baseOptions: {
            modelAssetPath: "/static/gesture-assets/hand_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        },
      );
      self.postMessage({ type: "ready" });
    } else if (data.type === "frame" && hand) {
      try {
        const start = performance.now();
        const result = hand.detectForVideo(data.frame, data.timestamp);
        self.postMessage({
          type: "result",
          points: result.landmarks[0] || null,
          elapsed: performance.now() - start,
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
