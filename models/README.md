# OpenCV Zoo model provenance

Pinned upstream commit: `48b10fa505aeb51fbd127fc60a5c660040e823b7`.

- `yunet.onnx`: `models/face_detection_yunet/face_detection_yunet_2023mar.onnx`
- `sface.onnx`: `models/face_recognition_sface/face_recognition_sface_2021dec.onnx`

Download with `python scripts/download_models.py`. The script retrieves Git LFS pointers from the pinned official repository revision and verifies SHA-256 before replacing each local model. It never executes downloaded scripts. Model files are excluded from Git.

Licenses and upstream documentation:

- [YuNet license](https://github.com/opencv/opencv_zoo/blob/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet/LICENSE)
- [SFace license](https://github.com/opencv/opencv_zoo/blob/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_recognition_sface/LICENSE)
- [OpenCV tutorial](https://docs.opencv.org/4.x/d0/dd4/tutorial_dnn_face.html)

These upstream models are not original FaceGate Lab work. Review upstream model terms before redistributing weights.
