"""Install local TensorFlow.js and COCO-SSD assets from the pinned manifest."""

from download_gestures import download

if __name__ == "__main__":
    download("object-assets.json", "object-assets")
