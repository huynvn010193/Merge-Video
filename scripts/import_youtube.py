"""Download one public YouTube video into a request-owned temporary directory."""
import json
import sys
from pathlib import Path


class ImportRejected(Exception):
    def __init__(self, code):
        self.code = code


class Logger:
    def debug(self, message):
        pass

    def warning(self, message):
        print(message, file=sys.stderr)

    def error(self, message):
        print(message, file=sys.stderr)


def main():
    try:
        import yt_dlp
    except ImportError:
        return {"error": "dependency"}

    options = json.load(sys.stdin)
    maximum = options["maxBytes"]
    downloaded = {}
    rejected = None

    def check_progress(progress):
        nonlocal rejected
        filename = progress.get("filename", "")
        downloaded[filename] = progress.get("downloaded_bytes", 0)
        if sum(downloaded.values()) > maximum:
            rejected = "size"
            raise ImportRejected("size")

    def check_video(info, *, incomplete=False):
        nonlocal rejected
        if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming", "post_live"):
            rejected = "live"
            raise ImportRejected("live")
        return None

    settings = {
        "quiet": True,
        "noprogress": True,
        "logger": Logger(),
        "noplaylist": True,
        "cachedir": False,
        "socket_timeout": 20,
        "retries": 2,
        "fragment_retries": 2,
        "max_filesize": maximum,
        "progress_hooks": [check_progress],
        "match_filter": check_video,
        "format": "bv[ext=mp4][vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[ext=mp4][vcodec^=avc1][height<=1080]",
        "merge_output_format": "mp4",
        "outtmpl": str(Path(options["directory"]) / "source.%(ext)s"),
        "ffmpeg_location": options["ffmpeg"],
        "js_runtimes": {"node": {"path": options["node"]}},
    }
    try:
        with yt_dlp.YoutubeDL(settings) as downloader:
            info = downloader.extract_info(options["url"], download=False)
            if not info or info.get("_type") in ("playlist", "multi_video"):
                return {"error": "download"}
            check_video(info)
            selected = info.get("requested_formats") or [info]
            expected_size = sum(item.get("filesize") or item.get("filesize_approx") or 0 for item in selected)
            if expected_size > maximum:
                return {"error": "size"}
            downloader.process_info(info)

        output = Path(options["directory"]) / "source.mp4"
        if not output.is_file():
            return {"error": rejected or "download"}
        if output.stat().st_size > maximum:
            return {"error": "size"}
        return {"title": str(info.get("title") or "YouTube video")[:200]}
    except ImportRejected as error:
        return {"error": error.code}
    except Exception as error:
        print(str(error), file=sys.stderr)
        return {"error": rejected or "download"}


if __name__ == "__main__":
    print(json.dumps(main(), ensure_ascii=True))
