"""Read JPEG dimensions without decoding an untrusted image."""


def dimensions(data: bytes):
    from app.vision import VisionError

    pos = 2
    while pos + 4 <= len(data):
        if data[pos] != 0xFF:
            raise VisionError("INVALID_IMAGE")
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        if pos >= len(data):
            break
        marker = data[pos]
        pos += 1
        if marker in (0xD8, 0xD9, 0x01) or 0xD0 <= marker <= 0xD7:
            continue
        if marker == 0xDA:
            break
        size = int.from_bytes(data[pos : pos + 2], "big")
        if size < 2 or pos + size > len(data):
            break
        if marker in (0xC0, 0xC1, 0xC2):
            if size < 7:
                break
            return int.from_bytes(data[pos + 5 : pos + 7], "big"), int.from_bytes(
                data[pos + 3 : pos + 5], "big"
            )
        pos += size
    raise VisionError("INVALID_IMAGE")
