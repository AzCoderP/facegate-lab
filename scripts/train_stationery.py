"""Train only with a user-labeled, licensed pen/notebook dataset. No invented classes."""

import argparse

from ultralytics import YOLO

parser = argparse.ArgumentParser()
parser.add_argument(
    "--data", required=True, help="YOLO dataset YAML: names must include pen/notebook"
)
parser.add_argument("--epochs", type=int, default=50)
args = parser.parse_args()
YOLO("models/yolo11n.pt").train(
    data=args.data, epochs=args.epochs, imgsz=640, project="work/stationery"
)
